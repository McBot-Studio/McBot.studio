/**
 * Which board owns which agent folder in a Hermes root. Every board on this computer compiles into the
 * same root (`profiles/<agent>/`), so `<root>/.mcbot/manifest.json` keeps each board's agents and the
 * files McBot wrote for them (`boards`). Pure: the engine's writer (engine/writer.ts) and the demo
 * (src/app/demo/engine.ts) both plan with it.
 *
 * - A compile removes only files its own board wrote before, never another board's.
 * - A profile folder belongs to one board at a time. A board whose agent still has that name keeps it;
 *   a board that no longer has it (or no longer exists) gives it up to the next board that compiles it.
 * - A folder whose agent left every board stays McBot's (`retired`): Hermes' memory and sessions are
 *   still in it, and an agent with that name may use it again.
 * - A folder McBot never made is never written into.
 */
import { COMPILE_SCHEMA, type BoardRecord, type Manifest, type ManifestEntry } from "../contracts/compile";
import { PROFILE_NAME_RE, RESERVED_PROFILE_NAMES } from "../contracts/graph";

/** The manifest as the engine keeps it: every board's part, and the folders McBot made that no board uses now. */
export interface Ledger extends Manifest {
  boards: Record<string, BoardRecord>;
  retired: string[];
}

const byPath = (a: ManifestEntry, b: ManifestEntry) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();

/** Folds the boards into the fields every reader knows: all agents, all files. */
function seal(graphId: string, boards: Record<string, BoardRecord>, retired: Iterable<string>): Ledger {
  const ids = Object.keys(boards).sort();
  const out: Record<string, BoardRecord> = {};
  for (const id of ids) out[id] = { profiles: sorted(boards[id]!.profiles), files: [...boards[id]!.files].sort(byPath) };
  const profiles = sorted(ids.flatMap((id) => out[id]!.profiles));
  const live = new Set(profiles);
  return {
    schema: COMPILE_SCHEMA,
    graphId,
    profiles,
    files: ids.flatMap((id) => out[id]!.files).sort(byPath),
    boards: out,
    retired: sorted(retired).filter((p) => !live.has(p)),
  };
}

/**
 * A manifest read from disk as a ledger. One written before boards were kept apart describes the
 * board compiled last only; `known` names the agents McBot compiled into this root before that
 * (the engine's own record), so their folders count as McBot's again.
 */
export function toLedger(m: Manifest | null, known: Iterable<string> = []): Ledger {
  if (m?.boards) return seal(m.graphId, m.boards, m.retired ?? []);
  const boards: Record<string, BoardRecord> = m && m.profiles.length ? { [m.graphId]: { profiles: m.profiles, files: m.files } } : {};
  return seal(m?.graphId ?? "", boards, known);
}

/** The board that compiled this agent folder, if any. */
export function ownerOf(ledger: Ledger | null, profile: string): string | null {
  if (!ledger) return null;
  for (const [id, b] of Object.entries(ledger.boards)) if (b.profiles.includes(profile)) return id;
  return null;
}

/** The agents a board has compiled into the root. */
export const profilesOf = (ledger: Ledger | null, boardId: string): string[] => ledger?.boards[boardId]?.profiles ?? [];

export type WriteRefusal =
  /** Another board's agent has this name now. */
  | { kind: "taken"; profile: string; board: string }
  /** The folder is there with something in it, and McBot did not make it. */
  | { kind: "foreign"; profile: string };

export interface WritePlan {
  refusal: WriteRefusal | null;
  /** Files McBot wrote for this board (or took over with a folder) that this compile no longer writes. */
  remove: string[];
  /** The manifest to write after this compile. */
  ledger: Ledger;
}

/**
 * What compiling one board into the root does to ownership.
 * `occupied`: profile folders that are there with something in them (for the names this compile and
 * the ledger mention). `live(board, profile)`: does that board still have an agent with that name?
 */
export function planWrite(input: {
  ledger: Ledger;
  graphId: string;
  profiles: readonly string[];
  files: readonly ManifestEntry[];
  occupied: ReadonlySet<string>;
  live: (board: string, profile: string) => boolean;
}): WritePlan {
  const { ledger, graphId, profiles, files, occupied, live } = input;
  const mine = ledger.boards[graphId] ?? { profiles: [], files: [] };
  const boards: Record<string, BoardRecord> = {};
  for (const [id, b] of Object.entries(ledger.boards)) if (id !== graphId) boards[id] = { profiles: [...b.profiles], files: [...b.files] };
  const before = [...mine.files];
  const retired = new Set(ledger.retired);

  for (const p of profiles) {
    const owner = Object.keys(boards).find((id) => boards[id]!.profiles.includes(p));
    if (owner) {
      if (live(owner, p)) return { refusal: { kind: "taken", profile: p, board: owner }, remove: [], ledger };
      // That board let the agent go: the folder, and what McBot wrote in it, come to this board.
      const dir = `profiles/${p}/`;
      const b = boards[owner]!;
      before.push(...b.files.filter((f) => f.path.startsWith(dir)));
      boards[owner] = { profiles: b.profiles.filter((x) => x !== p), files: b.files.filter((f) => !f.path.startsWith(dir)) };
      if (!boards[owner]!.profiles.length) delete boards[owner];
    } else if (!mine.profiles.includes(p) && !retired.has(p) && occupied.has(p)) {
      return { refusal: { kind: "foreign", profile: p }, remove: [], ledger };
    }
  }

  const next = new Set(files.map((f) => f.path));
  const remove = sorted(before.map((f) => f.path).filter((p) => !next.has(p)));
  for (const p of mine.profiles) if (!profiles.includes(p)) retired.add(p);
  if (profiles.length) boards[graphId] = { profiles: [...profiles], files: [...files] };
  // A folder that is gone, or empty, needs no keeping.
  const kept = [...retired].filter((p) => occupied.has(p) || mine.profiles.includes(p));
  return { refusal: null, remove, ledger: seal(graphId, boards, kept) };
}

/** A profile id no one has: "writer-2", "writer-3"…, within Hermes' 64 characters. */
export function freeProfileName(base: string, taken: ReadonlySet<string>): string {
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const name = `${base.slice(0, 64 - suffix.length).replace(/[-_]+$/, "")}${suffix}`;
    if (!taken.has(name) && !RESERVED_PROFILE_NAMES.includes(name) && PROFILE_NAME_RE.test(name)) return name;
  }
}

export interface NameClaim {
  /** The agent node. */
  id: string;
  from: string;
  to: string;
}

/**
 * Agents on this board that cannot have their id: another board's compiled agent has it, or a folder
 * McBot did not make is there under that name (`foreign`). Each gets a free id ("writer-2") before it
 * compiles, so two boards never share a Hermes profile and no one's own profile is in the way. The
 * agent that compiled first keeps its id. `taken`: every id in use (all boards' agents, the ledger's
 * folders, folders on disk).
 */
export function claimNames(input: {
  agents: readonly { id: string; name: string }[];
  boardId: string;
  ledger: Ledger | null;
  live: (board: string, profile: string) => boolean;
  foreign: ReadonlySet<string>;
  taken: ReadonlySet<string>;
}): NameClaim[] {
  const taken = new Set(input.taken);
  const out: NameClaim[] = [];
  for (const a of input.agents) {
    const owner = ownerOf(input.ledger, a.name);
    const elsewhere = !!owner && owner !== input.boardId && input.live(owner, a.name);
    if (!elsewhere && !(owner === null && input.foreign.has(a.name))) continue;
    const to = freeProfileName(a.name, taken);
    taken.add(to);
    out.push({ id: a.id, from: a.name, to });
  }
  return out;
}
