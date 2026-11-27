import { describe, expect, it } from "vitest";
import { compile, resolveGraph } from "../../compile";
import { GRAPH_SCHEMA, type Graph, type GraphNode } from "../../contracts/graph";
import { TEAMS, leadOf, makerProvider, teamToAdd } from "./teams";

const model = { id: "m", kind: "model", position: { x: 0, y: 0 }, data: { name: "local", label: "Local", endpoint: "local", baseUrl: "http://127.0.0.1:11434/v1", model: "qwen3:8b", apiKeyEnv: "", pricing: null } } as GraphNode;
const newModel = (position: { x: number; y: number }) => ({ ...model, id: "m-new", position }) as GraphNode;

const research = TEAMS.find((t) => t.id === "research")!;

describe("starter teams", () => {
  it.each(TEAMS.filter((t) => !t.front).map((t) => [t.id, t] as const))("%s compiles: every agent has a model and the lead hands work to its team", (_id, team) => {
    const graph: Graph = { schema: GRAPH_SCHEMA, id: "b", name: "B", nodes: [], edges: [] };
    const add = teamToAdd(graph, team, null, newModel);
    const g = { ...graph, nodes: add.nodes, edges: add.edges };
    expect(resolveGraph(g).issues.filter((i) => i.level === "error")).toEqual([]);
    const lead = resolveGraph(g).bundles.find((b) => b.agent.id === add.lead)!;
    expect(lead.team.map((t) => t.data.displayName).sort()).toEqual(team.members.slice(1).map((m) => m.displayName).sort());
    const soul = compile(g).files.find((f) => f.path === `profiles/${lead.agent.data.name}/SOUL.md`)!.content;
    expect(soul).toContain("## Team");
  });

  it("the front desk hands work to every team's lead and every lone agent, and new teams join it", () => {
    const empty: Graph = { schema: GRAPH_SCHEMA, id: "b", name: "B", nodes: [], edges: [] };
    const team = (g: Graph, id: string) => {
      const add = teamToAdd(g, TEAMS.find((t) => t.id === id)!, (g.nodes.find((n) => n.kind === "model") ?? null) as Extract<GraphNode, { kind: "model" }> | null, newModel);
      return { g: { ...g, nodes: [...g.nodes, ...add.nodes], edges: [...g.edges, ...add.edges] }, lead: add.lead };
    };
    const one = team(empty, "research");
    const two = team(one.g, "studio");
    const desk = team(two.g, "front");
    const later = team(desk.g, "content");
    const { bundles, issues } = resolveGraph(later.g);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    const assistant = bundles.find((b) => b.agent.id === desk.lead)!;
    expect(assistant.agent.data.name).toBe("front-desk");
    expect(assistant.team.map((t) => t.id).sort()).toEqual([one.lead, two.lead, later.lead].sort());
    expect(compile(later.g).files.find((f) => f.path === "profiles/front-desk/SOUL.md")!.content).toContain("## Team");
    // Chat points a member that works alone to the top of its hand-offs: the Assistant.
    const coder = later.g.nodes.find((n) => n.kind === "agent" && n.data.name === "coder")!;
    expect(leadOf(later.g, coder.id)?.id).toBe(desk.lead);
    expect(leadOf(later.g, two.lead)).toBeNull();
    expect(leadOf(one.g, one.g.nodes.find((n) => n.kind === "agent" && n.data.name === "writer")!.id)?.id).toBe(one.lead);
    // A team added before any front desk joins no one.
    expect(two.g.edges.filter((e) => e.target === two.lead && e.source !== two.g.nodes.find((n) => n.kind === "model")!.id)).toEqual([]);
  });

  it("joins a board that already has agents with the same names, and uses its model", () => {
    const graph: Graph = { schema: GRAPH_SCHEMA, id: "b", name: "B", nodes: [model, { id: "a", kind: "agent", position: { x: 0, y: 0 }, data: { name: "writer", displayName: "", description: "", soul: "", skills: [], capabilities: null } } as GraphNode], edges: [{ id: "e", source: "m", target: "a", order: 0 }] };
    const add = teamToAdd(graph, research, model as Extract<GraphNode, { kind: "model" }>, newModel);
    expect(add.nodes.filter((n) => n.kind === "agent").map((n) => n.data.name)).toEqual(["lead", "researcher", "writer-2"]);
    const g = { ...graph, nodes: [...graph.nodes, ...add.nodes], edges: [...graph.edges, ...add.edges] };
    expect(resolveGraph(g).issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("names a second team's members so no two agents show the same name", () => {
    const graph: Graph = { schema: GRAPH_SCHEMA, id: "b", name: "B", nodes: [], edges: [] };
    const first = teamToAdd(graph, research, null, newModel);
    const once = { ...graph, nodes: first.nodes, edges: first.edges };
    const second = teamToAdd(once, research, null, newModel);
    const shown = [...first.nodes, ...second.nodes].filter((n) => n.kind === "agent").map((n) => String(n.data.displayName));
    expect(new Set(shown).size).toBe(shown.length);
    expect(shown).toContain(`${research.members[1]!.displayName} 2`);
  });

  it("members bring only skills Hermes' library ships, under the profile name they got", async () => {
    const { LIBRARY } = await import("../../contracts/library.generated");
    const ids = new Set(LIBRARY.map((s) => s.id));
    for (const team of TEAMS) for (const m of team.members) for (const id of m.skills ?? []) expect(ids.has(id), `${team.id}/${m.name}: ${id}`).toBe(true);
    const graph: Graph = { schema: GRAPH_SCHEMA, id: "b", name: "B", nodes: [model, { id: "a", kind: "agent", position: { x: 0, y: 0 }, data: { name: "researcher", displayName: "", description: "", soul: "", skills: [], capabilities: null } } as GraphNode], edges: [] };
    expect(teamToAdd(graph, research, null, newModel).skills.map((s) => s.profile)).toEqual(["researcher-2"]);
  });

  it("wires the tools and makers members use, so a designer makes the images itself", () => {
    const cloud = { id: "c", kind: "model", position: { x: 0, y: 0 }, data: { name: "cloud", label: "OpenAI", endpoint: "cloud", baseUrl: "https://api.openai.com/v1", model: "gpt-5", apiKeyEnv: "OPENAI_API_KEY", pricing: null } } as GraphNode;
    const graph: Graph = { schema: GRAPH_SCHEMA, id: "b", name: "B", nodes: [cloud], edges: [] };
    expect(makerProvider(graph, "image")).toBe("openai");
    expect(makerProvider(graph, "video")).toBe("openrouter");
    const social = TEAMS.find((t) => t.id === "social")!;
    const add = teamToAdd(graph, social, cloud as Extract<GraphNode, { kind: "model" }>, newModel);
    const g = { ...graph, nodes: [...graph.nodes, ...add.nodes], edges: [...graph.edges, ...add.edges] };
    const { bundles, issues } = resolveGraph(g);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    const designer = bundles.find((b) => b.agent.data.name === "designer")!;
    expect(designer.image?.data).toMatchObject({ media: "image", provider: "openai" });
    expect(bundles.find((b) => b.agent.data.name === "marketing")!.tools.map((t) => t.data.name)).toEqual(["exa"]);
    const config = compile(g).files.find((f) => f.path === "profiles/designer/config.yaml")!.content;
    expect(config).toContain("image_gen:");
  });

  it("names only tools and makers that exist", async () => {
    const { CATALOG, CONNECTOR_TOOLS } = await import("./catalog");
    const tools = new Set([...CATALOG, ...CONNECTOR_TOOLS].map((t) => t.id));
    for (const team of TEAMS) for (const m of team.members) for (const id of m.tools ?? []) expect(tools.has(id), `${team.id}/${m.name}: ${id}`).toBe(true);
  });
});
