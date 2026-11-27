/**
 * Many boards, one Hermes root: every board's agents compile side by side, an id two boards want is
 * the first one's, and no board reads or runs another board's agent (src/harness/ledger.ts).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentMemoryView, CompileResponse } from "../src/contracts/api";
import type { Graph } from "../src/contracts/graph";
import { startEngine, type Engine } from "./server";

const ORIGIN = "http://localhost:5173";
let engine: Engine;
let workspace: string;
const hermes = (p: string) => join(workspace, "hermes", p);

const board = (agent: string): Graph => {
  const g = JSON.parse(readFileSync(join(import.meta.dirname, "../test/fixtures/three-node.graph.json"), "utf8")) as Graph;
  (g.nodes[0]!.data as { name: string }).name = agent;
  return g;
};
const agentName = async (boardId: string) => String((await engine.relay.graph(boardId)).nodes.find((n) => n.kind === "agent")!.data.name);

beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), "mcbot-boards-"));
  engine = await startEngine({ workspace, hermesHome: join(workspace, "hermes"), managedRoot: true, port: 0, host: "127.0.0.1", allowedOrigins: [ORIGIN] });
  await engine.relay.create("sales", "Sales", board("assistant"));
  await engine.relay.create("support", "Support", board("triage"));
  await engine.relay.create("again", "Setup again", board("assistant"));
});
afterAll(async () => {
  await engine?.close();
});

const api = async <T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> => {
  const res = await fetch(`${engine.url}${path}`, { ...init, headers: { origin: ORIGIN, "content-type": "application/json", ...(init.headers ?? {}) } });
  return { status: res.status, body: (await res.json()) as T };
};
const compileBoard = (boardId: string) => api<CompileResponse>("/api/compile", { method: "POST", body: JSON.stringify({ boardId }) });

describe("many boards in one Hermes root", () => {
  it("compiles each board without touching another's agents, again and again", async () => {
    expect((await compileBoard("sales")).body.ok).toBe(true);
    writeFileSync(hermes("profiles/assistant/state.db"), "hermes");
    expect((await compileBoard("support")).body.ok).toBe(true);
    expect(existsSync(hermes("profiles/assistant/SOUL.md"))).toBe(true);
    const again = await compileBoard("sales");
    expect(again.body.ok, JSON.stringify(again.body)).toBe(true);
  });

  it("gives an agent a free id when another board's agent has its id; a dry run only shows it", async () => {
    const preview = await api<CompileResponse>("/api/compile?boardId=again");
    expect(preview.body.ok && preview.body.report.profiles.map((p) => p.name)).toEqual(["assistant-2"]);
    expect(await agentName("again")).toBe("assistant");

    // Before it compiles, the board's "assistant" is not the Sales board's: no memory of it, and a run waits for a compile.
    const memory = await api<AgentMemoryView[]>("/api/memory?boardId=again");
    expect(memory.body[0]).toMatchObject({ profile: "assistant", compiled: false, memory: { exists: false } });
    const run = await api<{ error: string; stale?: string[] }>("/api/runs", { method: "POST", body: JSON.stringify({ boardId: "again", agentNodeId: "n-agent", prompt: "hi" }) });
    expect(run.status).toBe(409);
    expect(run.body.stale).toContain("profiles/assistant-2/");

    const done = await compileBoard("again");
    expect(done.body.ok, JSON.stringify(done.body)).toBe(true);
    expect(await agentName("again")).toBe("assistant-2");
    expect(readFileSync(hermes("profiles/assistant/state.db"), "utf8")).toBe("hermes");
    expect(existsSync(hermes("profiles/assistant-2/SOUL.md"))).toBe(true);
    expect((await compileBoard("sales")).body.ok).toBe(true);
    expect(await agentName("sales")).toBe("assistant");
  });

  it("shows each board only its own agents' folders", async () => {
    const roots = await api<{ id: string }[]>("/api/fs/roots?boardId=support");
    expect(roots.body.map((r) => r.id).filter((id) => id.startsWith("profile:"))).toEqual(["profile:triage"]);
  });

  it("steps around a profile folder McBot did not make", async () => {
    await engine.relay.create("mine", "Mine", board("coder"));
    mkdirSync(hermes("profiles/coder"), { recursive: true });
    writeFileSync(hermes("profiles/coder/config.yaml"), "model: mine\n");
    const done = await compileBoard("mine");
    expect(done.body.ok, JSON.stringify(done.body)).toBe(true);
    expect(await agentName("mine")).toBe("coder-2");
    expect(readFileSync(hermes("profiles/coder/config.yaml"), "utf8")).toBe("model: mine\n");
  });
});
