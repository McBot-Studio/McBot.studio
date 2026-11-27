import { describe, expect, it } from "vitest";
import type { Manifest, ManifestEntry } from "../contracts/compile";
import { claimNames, freeProfileName, ownerOf, planWrite, profilesOf, toLedger } from "./ledger";

const entry = (path: string): ManifestEntry => ({ path, sha256: "x", bytes: 1 });
const filesFor = (...names: string[]) => names.flatMap((n) => [entry(`profiles/${n}/SOUL.md`), entry(`profiles/${n}/config.yaml`)]);
const yes = () => true;
const no = () => false;

/** Compile `profiles` on `graphId` over `ledger`, as the writer would. */
const write = (ledger: ReturnType<typeof toLedger>, graphId: string, profiles: string[], opts: { occupied?: string[]; live?: (b: string, p: string) => boolean } = {}) =>
  planWrite({ ledger, graphId, profiles, files: filesFor(...profiles), occupied: new Set(opts.occupied ?? []), live: opts.live ?? yes });

describe("toLedger", () => {
  it("reads a manifest from before boards were kept apart as that board's part, and known agents as McBot's", () => {
    const old: Manifest = { schema: "mcbot.compile/v1", graphId: "b", profiles: ["writer"], files: filesFor("writer") };
    const l = toLedger(old, ["assistant", "writer"]);
    expect(l.boards).toEqual({ b: { profiles: ["writer"], files: filesFor("writer") } });
    expect(l.retired).toEqual(["assistant"]);
    expect(ownerOf(l, "writer")).toBe("b");
    expect(ownerOf(l, "assistant")).toBeNull();
  });

  it("ignores known agents once the manifest keeps boards apart", () => {
    const l = toLedger({ schema: "mcbot.compile/v1", graphId: "b", profiles: [], files: [], boards: {}, retired: [] }, ["assistant"]);
    expect(l.retired).toEqual([]);
  });
});

describe("planWrite", () => {
  it("keeps each board's agents and files: compiling one board never removes another's", () => {
    const a = write(toLedger(null), "a", ["assistant"]);
    const b = write(a.ledger, "b", ["writer"]);
    expect(b.refusal).toBeNull();
    expect(b.remove).toEqual([]);
    expect(b.ledger.boards).toEqual({ a: { profiles: ["assistant"], files: filesFor("assistant") }, b: { profiles: ["writer"], files: filesFor("writer") } });
    expect(b.ledger.profiles).toEqual(["assistant", "writer"]);
    expect(b.ledger.files.map((f) => f.path)).toEqual(filesFor("assistant", "writer").map((f) => f.path).sort());
    expect(b.ledger.graphId).toBe("b");
    // Board a again, with its folder full of Hermes' own files: still a's.
    const again = write(b.ledger, "a", ["assistant"], { occupied: ["assistant", "writer"] });
    expect(again.refusal).toBeNull();
    expect(profilesOf(again.ledger, "b")).toEqual(["writer"]);
  });

  it("removes only what this board wrote before, and keeps a removed agent's folder McBot's", () => {
    const first = write(toLedger(null), "a", ["assistant", "helper"]);
    const second = write(first.ledger, "a", ["helper"], { occupied: ["assistant", "helper"] });
    expect(second.remove).toEqual(["profiles/assistant/SOUL.md", "profiles/assistant/config.yaml"]);
    expect(second.ledger.retired).toEqual(["assistant"]);
    // The name comes back (on this board or another): its folder, with Hermes' memory, is McBot's.
    const back = write(second.ledger, "b", ["assistant"], { occupied: ["assistant", "helper"] });
    expect(back.refusal).toBeNull();
    expect(back.ledger.retired).toEqual([]);
    expect(ownerOf(back.ledger, "assistant")).toBe("b");
  });

  it("refuses a folder another board's agent has now", () => {
    const a = write(toLedger(null), "a", ["writer"]);
    const b = write(a.ledger, "b", ["writer"], { occupied: ["writer"], live: (board, p) => board === "a" && p === "writer" });
    expect(b.refusal).toEqual({ kind: "taken", profile: "writer", board: "a" });
    expect(b.ledger).toBe(a.ledger);
  });

  it("takes over a folder whose board let the agent go, with the files McBot wrote in it", () => {
    const a = write(toLedger(null), "a", ["writer", "editor"]);
    const withSkill = { ...a.ledger, boards: { a: { ...a.ledger.boards.a!, files: [...a.ledger.boards.a!.files, entry("profiles/writer/skills/style/SKILL.md")] } } };
    const b = write(toLedger(withSkill), "b", ["writer"], { occupied: ["writer", "editor"], live: no });
    expect(b.refusal).toBeNull();
    expect(b.remove).toEqual(["profiles/writer/skills/style/SKILL.md"]);
    expect(b.ledger.boards.a).toEqual({ profiles: ["editor"], files: filesFor("editor") });
    expect(ownerOf(b.ledger, "writer")).toBe("b");
  });

  it("refuses a folder McBot did not make", () => {
    const r = write(toLedger(null), "a", ["coder"], { occupied: ["coder"] });
    expect(r.refusal).toEqual({ kind: "foreign", profile: "coder" });
  });

  it("forgets a removed agent's folder once it is gone", () => {
    const first = write(toLedger(null), "a", ["assistant"]);
    const second = write(first.ledger, "a", [], { occupied: ["assistant"] });
    expect(second.ledger.boards).toEqual({});
    expect(second.ledger.retired).toEqual(["assistant"]);
    expect(write(second.ledger, "a", [], { occupied: [] }).ledger.retired).toEqual([]);
  });
});

describe("claimNames", () => {
  const ledger = write(toLedger(null), "a", ["writer"]).ledger;
  const agents = [{ id: "n1", name: "writer" }, { id: "n2", name: "editor" }];

  it("gives this board's agent a free id when another board's agent has its id", () => {
    const taken = new Set(["writer", "editor", "writer-2"]);
    expect(claimNames({ agents, boardId: "b", ledger, live: yes, foreign: new Set(), taken })).toEqual([{ id: "n1", from: "writer", to: "writer-3" }]);
  });

  it("leaves the board that compiled it first, a board that let it go, and agents nobody has alone", () => {
    expect(claimNames({ agents, boardId: "a", ledger, live: yes, foreign: new Set(), taken: new Set() })).toEqual([]);
    expect(claimNames({ agents, boardId: "b", ledger, live: no, foreign: new Set(), taken: new Set() })).toEqual([]);
  });

  it("steps around a folder McBot did not make", () => {
    expect(claimNames({ agents, boardId: "b", ledger: null, live: yes, foreign: new Set(["editor"]), taken: new Set(["writer", "editor"]) }))
      .toEqual([{ id: "n2", from: "editor", to: "editor-2" }]);
  });
});

describe("freeProfileName", () => {
  it("stays a valid Hermes profile id", () => {
    expect(freeProfileName("a".repeat(64), new Set())).toBe(`${"a".repeat(62)}-2`);
    expect(freeProfileName("x-", new Set())).toBe("x-2");
  });
});
