import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { compile } from "../src/compile";
import { MANIFEST_PATH } from "../src/contracts/compile";
import { NameTakenError, OwnershipError, readManifest, writeCompileResult } from "./writer";

const fixture = () => JSON.parse(readFileSync(join(import.meta.dirname, "../test/fixtures/three-node.graph.json"), "utf8"));
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mcbot-writer-"));
});

describe("writeCompileResult", () => {
  it("writes every file byte-for-byte and reports them as added", async () => {
    const result = compile(fixture());
    const report = await writeCompileResult(result, root);
    expect(report.changes.every((c) => c.status === "added")).toBe(true);
    for (const f of result.files) if (f.path !== MANIFEST_PATH) expect(readFileSync(join(root, f.path), "utf8")).toBe(f.content);
    // The manifest on disk is compile's, plus each board's part (src/harness/ledger.ts).
    const manifest = JSON.parse(result.files.find((f) => f.path === MANIFEST_PATH)!.content);
    expect(JSON.parse(readFileSync(join(root, MANIFEST_PATH), "utf8"))).toEqual({
      ...manifest, boards: { [manifest.graphId]: { profiles: manifest.profiles, files: manifest.files } }, retired: [],
    });
    expect(existsSync(join(root, "profiles/triage/memories"))).toBe(true);
    expect(existsSync(join(root, "profiles/triage/skills"))).toBe(true);
  });

  it("is idempotent: a second compile changes nothing", async () => {
    await writeCompileResult(compile(fixture()), root);
    const again = await writeCompileResult(compile(fixture()), root);
    expect(again.changes.map((c) => c.status)).toEqual(again.changes.map(() => "unchanged"));
    expect(again.changes.every((c) => c.diff === "")).toBe(true);
  });

  it("reports a unified diff for a changed file", async () => {
    await writeCompileResult(compile(fixture()), root);
    const g = fixture();
    g.nodes[1].data.model = "qwen3:14b";
    const report = await writeCompileResult(compile(g), root);
    const cfg = report.changes.find((c) => c.path === "profiles/triage/config.yaml")!;
    expect(cfg.status).toBe("modified");
    expect(cfg.diff).toContain("-  default: qwen3:8b\n+  default: qwen3:14b\n");
  });

  it("keeps what Hermes, the CLI or an agent added to config.yaml, and then reports no change", async () => {
    await writeCompileResult(compile(fixture()), root);
    const file = join(root, "profiles/triage/config.yaml");
    // e.g. `hermes config set memory.provider holographic`, or an agent choosing a memory provider.
    writeFileSync(file, `${readFileSync(file, "utf8")}# added outside McBot\nmemory:\n  provider: holographic\n`);
    const g = fixture();
    g.nodes[1].data.model = "qwen3:14b";
    const report = await writeCompileResult(compile(g), root);
    const text = readFileSync(file, "utf8");
    expect(text).toContain("default: qwen3:14b");
    expect(text).toContain("# added outside McBot\nmemory:\n  provider: holographic\n");
    expect(report.changes.find((c) => c.path === "profiles/triage/config.yaml")!.diff).not.toContain("-memory");
    const again = await writeCompileResult(compile(g), root, { dryRun: true });
    expect(again.changes.filter((c) => c.status !== "unchanged")).toEqual([]);
  });

  it("deletes only files its previous manifest lists, never Hermes runtime state", async () => {
    const g = fixture();
    g.nodes[0].data.skills = [{ name: "triage-rules", description: "Route tickets by product area." }];
    await writeCompileResult(compile(g), root);
    writeFileSync(join(root, "profiles/triage/memories/MEMORY.md"), "learned something");
    mkdirSync(join(root, "profiles/triage/skills/hermes-agent"), { recursive: true });
    writeFileSync(join(root, "profiles/triage/skills/hermes-agent/SKILL.md"), "seeded by hermes");

    g.nodes[0].data.skills = [];
    const report = await writeCompileResult(compile(g), root);
    expect(report.changes.find((c) => c.path.endsWith("triage-rules/SKILL.md"))?.status).toBe("removed");
    expect(existsSync(join(root, "profiles/triage/skills/triage-rules/SKILL.md"))).toBe(false);
    expect(readFileSync(join(root, "profiles/triage/memories/MEMORY.md"), "utf8")).toBe("learned something");
    expect(existsSync(join(root, "profiles/triage/skills/hermes-agent/SKILL.md"))).toBe(true);
  });

  it("refuses to overwrite a profile directory McBot did not create", async () => {
    mkdirSync(join(root, "profiles/triage"), { recursive: true });
    writeFileSync(join(root, "profiles/triage/config.yaml"), "model: mine\n");
    await expect(writeCompileResult(compile(fixture()), root)).rejects.toBeInstanceOf(OwnershipError);
    expect(readFileSync(join(root, "profiles/triage/config.yaml"), "utf8")).toBe("model: mine\n");
  });

  /** The fixture as another board, its agent called `agent`. */
  const board = (id: string, agent: string) => {
    const g = fixture();
    g.id = id;
    g.nodes[0].data.name = agent;
    return g;
  };
  /** What Hermes leaves in a profile once an agent ran. */
  const ran = (agent: string) => writeFileSync(join(root, `profiles/${agent}/state.db`), "hermes");

  it("keeps every board's agents: compiling one board never removes another's, and each compiles again", async () => {
    await writeCompileResult(compile(board("sales", "assistant")), root);
    ran("assistant");
    const other = await writeCompileResult(compile(board("support", "triage")), root);
    expect(other.changes.filter((c) => c.status === "removed")).toEqual([]);
    expect(existsSync(join(root, "profiles/assistant/SOUL.md"))).toBe(true);
    const again = await writeCompileResult(compile(board("sales", "assistant")), root);
    expect(again.changes.filter((c) => c.path.startsWith("profiles/")).every((c) => c.status === "unchanged")).toBe(true);
    expect((await readManifest(root))!.boards).toMatchObject({ sales: { profiles: ["assistant"] }, support: { profiles: ["triage"] } });
  });

  it("lets an agent take back its id after it was renamed or deleted, with Hermes' files still there", async () => {
    await writeCompileResult(compile(board("sales", "assistant")), root);
    ran("assistant");
    const renamed = await writeCompileResult(compile(board("sales", "helper")), root);
    expect(renamed.changes.filter((c) => c.status === "removed").map((c) => c.path)).toContain("profiles/assistant/SOUL.md");
    expect(readFileSync(join(root, "profiles/assistant/state.db"), "utf8")).toBe("hermes");
    await expect(writeCompileResult(compile(board("sales", "assistant")), root)).resolves.toMatchObject({ written: true });
    expect(readFileSync(join(root, "profiles/assistant/state.db"), "utf8")).toBe("hermes");
  });

  it("recognises agents McBot compiled before boards were kept apart", async () => {
    // As 0.9.1 left it: board "support" compiled last, so the manifest forgot "assistant".
    await writeCompileResult(compile(board("sales", "assistant")), root);
    ran("assistant");
    const old = compile(board("support", "triage")).files.find((f) => f.path === MANIFEST_PATH)!.content;
    writeFileSync(join(root, MANIFEST_PATH), old);
    await expect(writeCompileResult(compile(board("sales", "assistant")), root)).rejects.toBeInstanceOf(OwnershipError);
    const report = await writeCompileResult(compile(board("sales", "assistant")), root, { known: ["assistant", "triage"] });
    expect(report.written).toBe(true);
    expect((await readManifest(root))!.boards).toMatchObject({ sales: { profiles: ["assistant"] }, support: { profiles: ["triage"] } });
  });

  it("refuses an id another board's agent has now, and takes it once that board let it go", async () => {
    await writeCompileResult(compile(board("sales", "writer")), root);
    await expect(writeCompileResult(compile(board("support", "writer")), root, { live: () => true })).rejects.toBeInstanceOf(NameTakenError);
    expect((await readManifest(root))!.boards.sales!.profiles).toEqual(["writer"]);
    await writeCompileResult(compile(board("support", "writer")), root, { live: () => false });
    expect((await readManifest(root))!.boards).toEqual({ support: expect.objectContaining({ profiles: ["writer"] }) });
  });

  it("dry run reports without writing", async () => {
    const report = await writeCompileResult(compile(fixture()), root, { dryRun: true });
    expect(report.written).toBe(false);
    expect(report.changes.length).toBeGreaterThan(0);
    expect(existsSync(join(root, "profiles"))).toBe(false);
  });
});
