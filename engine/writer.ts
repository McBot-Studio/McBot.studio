/**
 * Writes a CompileResult under an output root (a Hermes home) and reports a
 * per-file diff. The only module that writes compiled files to disk.
 *
 * Ownership rule (src/harness/ledger.ts): every board compiles into the same root, and the manifest
 * keeps each board's agents and the files McBot wrote for them. A compile deletes only files its own
 * board wrote before, never anything else, and it refuses to write into a profile folder another
 * board's agent has now, or one McBot did not create — so pointing the output root at a real
 * ~/.hermes cannot clobber a hand-made profile.
 */
import { createTwoFilesPatch } from "diff";
import { mkdir, readdir, rm } from "node:fs/promises";
import {
  MANIFEST_PATH,
  type CompileReport,
  type CompileResult,
  type CompiledFile,
  type FileChange,
  type Manifest,
} from "../src/contracts/compile";
import { renderManifest } from "../src/compile/manifest";
import { sha256Hex, utf8Bytes } from "../src/compile/text";
import { ownerOf, planWrite, toLedger, type Ledger } from "../src/harness/ledger";
import { mergeConfig } from "../src/harness/merge";
import { atomicWrite, readTextOrNull, resolveInside } from "./fsutil";

export class OwnershipError extends Error {
  constructor(readonly profile: string, readonly dir: string) {
    super(`profiles/${profile} already exists at ${dir} and McBot did not make it; give the agent another id, or move that folder away`);
    this.name = "OwnershipError";
  }
}

/** Another board's agent has this id now (McBot gives a board's agent a free id before it compiles; see engine/server.ts). */
export class NameTakenError extends Error {
  constructor(readonly profile: string, readonly board: string) {
    super(`${profile} is an agent on another board (${board}); give this one another id`);
    this.name = "NameTakenError";
  }
}

/**
 * The manifest on disk, with every board's part (src/harness/ledger.ts). `known`: agents McBot
 * compiled into this root before boards were kept apart, so their folders are McBot's again.
 */
export async function readManifest(root: string, known: Iterable<string> = []): Promise<Ledger | null> {
  const raw = await readTextOrNull(resolveInside(root, MANIFEST_PATH));
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as Manifest;
  return Array.isArray(parsed.files) && Array.isArray(parsed.profiles) ? toLedger(parsed, known) : null;
}

async function isEmptyOrMissing(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length === 0;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw err;
  }
}

/** Profile folders under the root that have something in them. */
export async function occupiedProfiles(root: string, names: Iterable<string>): Promise<Set<string>> {
  const out = new Set<string>();
  for (const n of new Set(names)) if (!(await isEmptyOrMissing(resolveInside(root, `profiles/${n}`)))) out.add(n);
  return out;
}

function unifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return "";
  return createTwoFilesPatch(`a/${path}`, `b/${path}`, before, after, "", "", { context: 3 });
}

export interface WriteOptions {
  /** Compute the report without touching the disk. */
  dryRun?: boolean;
  /** Does that board still have an agent with that id? (The engine asks the board; unknown = yes.) */
  live?: (board: string, profile: string) => boolean | Promise<boolean>;
  /** Agents McBot compiled into this root before boards were kept apart (see readManifest). */
  known?: Iterable<string>;
}

export async function writeCompileResult(result: CompileResult, root: string, opts: WriteOptions = {}): Promise<CompileReport> {
  const known = [...(opts.known ?? [])];
  const ledger = (await readManifest(root, known)) ?? toLedger(null, known);

  // config.yaml is merged into the one on disk: McBot changes only the keys the board shows and
  // keeps everything Hermes, the CLI or an agent added (src/harness/merge.ts).
  const files: CompiledFile[] = [];
  const befores = new Map<string, string | null>();
  for (const compiled of result.files) {
    if (compiled.role === "manifest") continue;
    const f = { ...compiled };
    const before = await readTextOrNull(resolveInside(root, f.path));
    befores.set(f.path, before);
    if (f.role === "config") {
      const merged = mergeConfig(before, f.content);
      if (merged !== f.content) Object.assign(f, { content: merged, sha256: sha256Hex(merged), bytes: utf8Bytes(merged).length });
    }
    files.push(f);
  }

  // Which board owns which folder: this board's agents, and what it wrote before (src/harness/ledger.ts).
  const names = result.profiles.map((p) => p.name);
  const occupied = await occupiedProfiles(root, [...names, ...ledger.profiles, ...ledger.retired]);
  const answers = new Map<string, boolean>();
  for (const name of names) {
    const owner = ownerOf(ledger, name);
    if (owner && owner !== result.graphId) answers.set(`${owner}/${name}`, opts.live ? await opts.live(owner, name) : true);
  }
  const plan = planWrite({
    ledger,
    graphId: result.graphId,
    profiles: names,
    files: files.map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes })),
    occupied,
    live: (board, profile) => answers.get(`${board}/${profile}`) ?? true,
  });
  if (plan.refusal?.kind === "taken") throw new NameTakenError(plan.refusal.profile, plan.refusal.board);
  if (plan.refusal) throw new OwnershipError(plan.refusal.profile, resolveInside(root, `profiles/${plan.refusal.profile}`));

  // The manifest on disk holds every board's part, not only this board's.
  const manifest = renderManifest(plan.ledger);
  files.push({ path: MANIFEST_PATH, content: manifest, sha256: sha256Hex(manifest), bytes: utf8Bytes(manifest).length, role: "manifest" });
  befores.set(MANIFEST_PATH, await readTextOrNull(resolveInside(root, MANIFEST_PATH)));

  const changes: FileChange[] = [];
  for (const f of files) {
    const before = befores.get(f.path) ?? null;
    const prevSha = before === null ? null : sha256Hex(before);
    changes.push({
      path: f.path,
      status: before === null ? "added" : prevSha === f.sha256 ? "unchanged" : "modified",
      sha256: f.sha256,
      previousSha256: prevSha,
      bytes: f.bytes,
      role: f.role,
      nodeId: f.nodeId ?? null,
      diff: unifiedDiff(f.path, before ?? "", f.content),
    });
  }

  for (const path of plan.remove) {
    const before = await readTextOrNull(resolveInside(root, path));
    if (before === null) continue;
    changes.push({
      path,
      status: "removed",
      sha256: null,
      previousSha256: sha256Hex(before),
      bytes: utf8Bytes(before).length,
      role: null,
      nodeId: null,
      diff: unifiedDiff(path, before, ""),
    });
  }
  changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  if (!opts.dryRun) {
    for (const d of result.dirs) await mkdir(resolveInside(root, d), { recursive: true });
    for (const c of changes) if (c.status === "removed") await rm(resolveInside(root, c.path), { force: true });
    // Manifest last: if anything above fails, the old manifest still describes the disk.
    const ordered = [...files].sort((a, b) => Number(a.path === MANIFEST_PATH) - Number(b.path === MANIFEST_PATH));
    for (const f of ordered) {
      const change = changes.find((c) => c.path === f.path);
      if (change?.status !== "unchanged") await atomicWrite(resolveInside(root, f.path), f.content);
    }
  }

  return { graphId: result.graphId, root, written: !opts.dryRun, profiles: result.profiles, changes };
}
