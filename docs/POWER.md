# Make McBot powerful: all of Hermes, then objects and actions

Written 2026-11-28, to start on Tuesday 2026-12-01. It sits beside [PLAN.md](PLAN.md) (milestones) and
[STRATEGY.md](STRATEGY.md); when a phase here is done, mark it there.

Two questions from the owner:

1. **Does McBot use everything Hermes can do, and does it stay up to date?** No, not yet (the audit below).
2. **What can we take from Palantir (Ontology, AIP, forward deployed engineers)?** Ideas only, as a
   feature reference: none of Palantir's code, names, look or trade dress (CLAUDE.md, UI invariants). The idea
   that matters is that agents act on **typed business objects through checked actions**, not on prompts and raw
   APIs. That idea is what makes agents useful and keeps upkeep low.

Hard rule 2 holds for every row: each Hermes command or key named here was found in `hermes/` (path given), but
its exact flags and config keys are checked in the source, or with `hermes … --help`, and written into
[HERMES.md](HERMES.md) **before** McBot compiles or calls them.

---

## 1. Is Hermes kept up to date in McBot?

- McBot runs its own fork in `hermes/` (MIT), now **v0.23.1** (`hermes/UPSTREAM.json`, commit of 2026-11-19).
  Upstream is at **v0.23.5** (git tags, 2026-11-28): four patch releases behind.
- `.github/workflows/hermes-sync.yml` merges upstream's newest stable tag **every Monday** and opens a PR with the
  test results. `hermes-upstream.yml` opens an issue when upstream changes a file we patch. The repository moved
  to McBot-Studio/mcbot.studio on 2026-11-26, so the first Monday run there is 2026-11-30. Check that it opened
  a PR.
- Updates reach people only with a McBot release, never on their own (CLAUDE.md). That's right: every sync runs
  the golden tests, patch check and smoke test first.

**Tuesday, first job:** merge the sync PR (or run `npm run engine:sync -- <checkout> v0.23.5`), run `npm test`,
`MCBOT_E2E=1 npm test` and the smoke workflow, and re-check the source lines HERMES.md cites.

## 2. Hermes coverage audit

What Hermes ships (`hermes/hermes_cli/subcommands/`, `hermes/plugins/`, `hermes/tools/`) against what McBot
uses (`engine/`, `src/`). ● used · ◐ partly · ○ not used.

| Hermes feature | Where in Hermes | McBot | Value for people |
|---|---|---|---|
| Runs API, approvals, clarify | `gateway/platforms/api_server_runs.py` | ● | |
| Profiles, SOUL.md, config, skills, plugins | | ● | |
| Model fallback chain | `fallback_providers` | ● (backup wire) | |
| Kanban: create, assign, comment, block, archive | `hermes_cli/kanban.py` | ● | |
| Kanban: **dependencies, links, swarm, dispatch, stats, watch, tail** | `hermes_cli/kanban.py` | ○ | **High**: real multi-step team work, live progress |
| Goal loop (Until done) | `kanban create --goal` | ● | |
| Cron schedules | `hermes cron` | ● | |
| **Webhooks** (HMAC-signed, `/webhooks/<route>`, prompt template with `{dot.notation}` payload refs) | `subcommands/webhook.py`, `gateway/platforms/webhook*.py` | ○ | **High**: the trigger for workflows (GitHub, Stripe, forms, any app) |
| Microsoft Graph webhooks | `gateway/platforms/msgraph_webhook.py` | ○ | Medium: Outlook and Teams events |
| **Mixture of agents** (model slots) | `subcommands/moa.py` | ○ (Council is McBot's own) | High: better answers on hard questions |
| **Emergency stop** (`hermes pause` / `resume`: cron, kanban and new turns) | `subcommands/pause.py` | ○ | **High**: one button to stop everything |
| **Insights** (usage analytics per days and platform) | `subcommands/insights.py` | ○ | Medium: Cost and Home |
| **Journey** (timeline of learned skills and memories) | `subcommands/journey.py` | ○ | Medium: "what my agent learned", Knowledge |
| **Curator** (background skill upkeep: status, run, pause, pin) | `subcommands/curator.py` | ○ | **High** for low upkeep |
| **Checkpoints** (file snapshots agents make) | `subcommands/checkpoints.py` | ○ | **High**: undo an agent's file changes (M8 agent diffs) |
| Shell hooks (`pre_tool_call`, `pre_llm_call`, `subagent_stop`) | `subcommands/hooks.py` | ○ | High: guardrails and automations on events |
| External memory providers (ByteRover, RetainDB) | `plugins/memory/` | ○ | Medium: big shared memory |
| Context engine plugins | `plugins/context_engine/` | ○ | Later |
| Prompt size (bytes of prompt and tool schemas) | `subcommands/prompt_size.py` | ○ | Medium: context meter (BACKLOG M6) |
| Usage / rate-limit windows | `subcommands/usage.py` | ○ | Medium: "your plan has 40% left" |
| Backup / import (zip of a Hermes home) | `subcommands/backup.py`, `import_cmd.py` | ○ | **High**: safety, moving computers |
| Supply-chain audit (OSV.dev over venv, plugins, MCP servers) | `subcommands/security.py` | ○ | High: trust, a doctor finding |
| Egress firewall with credential injection | `subcommands/egress.py` | ○ | Later (M10 safety) |
| Secret sources (1Password, Bitwarden) | `subcommands/secrets.py` | ○ | Medium: keys without secrets.json (M6) |
| Monitoring (gateway health export) | `subcommands/monitoring.py` | ○ | Medium: Always on (M11) |
| Peer gateways (bot to bot across machines) | `subcommands/peer.py` | ○ | Later: teams across computers (M12) |
| Verify (find a project's run recipe and smoke-test it) | `subcommands/verify.py` | ○ | High for App studio: the tester agent |
| ACP server, Codex runtime | `subcommands/acp.py`, `codex_runtime.py` | ○ | High: M9 coding agents, decision 1 |
| Migrate from another agent | `subcommands/migrate.py` | ○ | Medium: M13 import from OpenClaw etc. |
| Skill bundles | `subcommands/bundles.py` | ○ | Medium: Packs (M13) |
| DM pairing codes | `subcommands/pairing.py` | ○ | Medium: approve a new chat-app user from McBot |
| Cron providers (Chronos) | `plugins/cron_providers/` | ○ | Later |
| Meeting notes (Google Meet, Teams pipeline), disk clean-up, security guidance | `plugins/` | ◐ through the Plugins pane | Medium: first-class switches |

**Verdict:** McBot covers Hermes' core well (runs, profiles, skills, kanban basics, cron, chat apps, MCP, makers).
It leaves out about 25 command groups. About ten of them are worth a lot and are cheap to add, because each one
is a CLI call the engine already knows how to make (`hermes -p <agent> …`, as `engine/plugins.ts` does).

---

## 3. What Palantir does, and what McBot takes from it

| Palantir | The idea | McBot version |
|---|---|---|
| **Ontology** | The business as objects (Customer, Order, Lead) with properties and links, and **actions**: typed, checked, approved and logged changes | **Objects and Actions** (phase 3) |
| **AIP Logic** | Functions: typed input → LLM → typed output, checked | **Functions** on an agent: a JSON schema out, `checks` on every answer, retry on the backup model |
| **AIP Automate** | When data changes → function → action, a person approves | **Workflows** (M10) with object triggers and webhooks |
| **AIP Evals** | A test set per function; versions compared | **Eval sets** (M9) and nightly canaries, in History |
| **AIP agents on models of choice** | Any model, governed | Already ours: two providers, fallback, budgets, Training |
| **Forward deployed engineers** | Engineers who map a customer's data and work into the system in days ("bootcamps") | **Field engineer agent**: it interviews you, reads your files and connectors, proposes objects, actions and a first workflow as one board change |

Why this matters for upkeep: an agent that calls `move_lead(lead_id, stage)` doesn't break when a prompt changes;
a wrong call is refused by its schema; every change is logged and undoable; when an API changes, one action
is fixed, not ten souls.

---

## 4. The plan

Each phase ships on its own, with tests, the demo kept in step (CLAUDE.md), the McBot guide skill updated
(`src/compile/mcbotGuide.ts`) and CLAUDE.md changed when an invariant changes.

### Phase 0: up to date (Tue 1 Dec, 1 day)

1. Hermes v0.23.5 in (section 1). Read upstream's changelog for features worth adding to the table above.
2. Merge or close the two Dependabot PRs (McBot-Studio/mcbot.studio#1, McBot-Studio/mcbot.studio#2).

### Phase 1: use all of Hermes, the quick wins (weeks 1–2)

The engine already runs `hermes -p <agent> …` for plugins and skills; each item below is the same shape: one
engine module, one route (host only), one place in the UI. Check every flag first (hard rule 2).

| # | Feature | Hermes | Where in McBot |
|---|---|---|---|
| 1.1 | **Stop everything** | `hermes pause` / `resume` | The island and ⌘K: one switch that stops schedules, the task board and new turns; Home says "Paused" |
| 1.2 | **Undo an agent's file changes** | `hermes checkpoints` | Files and Runs: "Changes by this run", restore a file (M8 agent diffs) |
| 1.3 | **Skills keep themselves tidy** | `hermes curator` | Skills view: status, Run now, Pause, Pin a skill |
| 1.4 | **Back up and restore** | `hermes backup` / `import` | Settings → Engine: Back up all agents (zip into `<workspace>/backups/`), Restore |
| 1.5 | **Security audit** | `hermes security` (OSV.dev) | Doctor finding per vulnerable package, plugin or MCP server, weekly |
| 1.6 | **Context meter** | `hermes prompt-size` | Layers → Context: bytes of soul, skills and tool schemas; warn before it's too big (BACKLOG M6) |
| 1.7 | **What my agent learned** | `hermes journey` | Knowledge → Memory: a timeline of new skills and memories |
| 1.8 | **Insights** | `hermes insights` | Cost: per platform and per day, beside McBot's own numbers (labelled) |
| 1.9 | **Plan limits** | `hermes usage` | Header chip when a plan's window is nearly used up |
| 1.10 | **Approve a new chat user** | `hermes pairing` | Home "Needs you": "Ana wants to message Support on Telegram", Approve |

Done when: each one works in the app against a real Hermes, has a test, and is listed in HERMES.md.

### Phase 2: workflows that start themselves (weeks 3–5, M10)

Built on Hermes, not a second engine (NEXT.md):

1. **Triggers on the board:** schedule (cron ●), **webhook** (`hermes webhook`: route, HMAC secret, prompt
   template; the URL shown with Copy; through the Share tunnel when it must reach the internet), chat message,
   new file in a folder (engine watcher), and (phase 3) an object change.
2. **Steps are kanban tasks** with **dependencies** (`kanban dependency` / `link`): a chain on the board compiles
   to tasks that wait for each other. **Swarm** (`kanban swarm`: parallel workers → verifier → synthesizer) as a
   shape you draw.
3. **Condition and approval nodes:** approval reuses the approval cards; a condition reads a Function's typed
   output (phase 3).
4. **Live:** `kanban watch` / `tail` feed the Tasks view and the island; `kanban stats` on Home.
5. **Hooks** (`hermes hooks`): "before a tool call" and "after a helper finishes" as guardrail or notify steps.
6. First workflows to ship as templates: "write a post, make its image, wait for my OK, publish" (BACKLOG),
   "new GitHub issue → triage → label → reply draft for OK", "weekly report every Monday, waits for OK".

Done when the weekly report runs itself and waits for a person's OK (M10's test), and a GitHub webhook starts a
workflow on a real repository.

### Phase 3: objects and actions (weeks 6–9)

1. **Object types** (`objects` on the board, `mcbot.graph/v1`, additive, a Y.Map keyed by id): name, fields with
   types, a key, links to other types. A block on the board; links are wires.
2. **Sources:** a CSV or JSON file in the shared files folder (first), a folder of Markdown records, then a
   connector already on the board (HubSpot, Sheets, Postgres MCP) mapped field by field.
3. **Actions:** named and typed (`move_lead(lead_id, stage)`), with parameter checks, an approval rule (always,
   above a value, never), a log entry in `<workspace>/actions.jsonl`, and an undo when the source allows it.
4. **How agents reach them:** the engine serves an MCP server on loopback for each board. Agents wired to an
   object type get it as `mcp_servers.mcbot-objects` with `transport: http`, `url` and an `${env:…}` header:
   keys compile already does for hosted tools, so no new Hermes key. Tools: `find_<type>`, `get_<type>`,
   one per action. An action that needs approval waits in the engine and shows as an approval card (McBot's own,
   no Hermes patch).
5. **Objects view** (Knowledge segment): tables per type, linked records, the action log with Undo.
6. **Object triggers** for phase 2: "a new Lead", "an Order unpaid after 7 days".
7. **Functions:** an agent's answer with a JSON schema; `checks` validate it; a failure retries once on the
   backup model, then blocks the task for review (`lib/taskNote.ts` says why).

Done when an agent reads leads from a CSV, scores them with a Function, and moves one with an action a person
approves, all logged and undoable.

### Phase 4: smarter, with less upkeep (weeks 10–12)

1. **Eval sets** (STRATEGY.md, M9): questions with what a good answer contains, per agent; "Run the evals" on two
   versions in History.
2. **Nightly canaries:** the eval set runs on the live version; a drop in quality, or a rise in cost, goes to
   "Needs you".
3. **Model advice from evidence:** History already has success, cost and time per run and model: "Writer does as
   well on the cheaper model", one click to switch; the trained model (Training) joins the comparison.
4. **Mixture of agents** (`hermes moa`): Council uses Hermes' own slots when the board asks for it.
5. **Self-healing doctor:** new findings with one fix: a connector signed out, an action failing again and again,
   a schedule that didn't run, an object source whose columns changed, an audit finding (1.5), a skill the curator
   flagged.
6. **Always on** basics from Hermes: `hermes monitoring` for gateway health (M11).

### Phase 5: the field engineer and packs (weeks 13–15)

1. **Field engineer** starter agent (on Ask McBot's planner, `src/harness/plan.ts`): it asks about the business
   (the setup answers are a start), lists the person's opened folders and connectors, and proposes object types,
   actions and one workflow as one reviewable board change (one ⌘Z).
2. Setup ends with **one real workflow on the person's own data**, not only a team.
3. **Packs** (M13) carry objects, actions and workflows; skill bundles (`hermes bundles`) carry skills.
4. **Coding agents** (M9): `hermes acp` and the Codex runtime, so App studio's coder can be Claude Code or Codex
   on the plan people already pay for (decision 1).
5. **Import** from other agents with `hermes migrate`.

### Later

Egress firewall (`hermes egress`), 1Password and Bitwarden (`hermes secrets`) instead of `secrets.json`, peer
gateways across computers (M12), external memory providers, Microsoft Graph triggers.

---

## 5. Order and why

1. **Up to date first**: every later step is checked against current Hermes source.
2. **Quick wins next**: ten features in two weeks, each a CLI call McBot already knows how to make; safety items
   (stop everything, undo, backup) first, because people trust agents that can be stopped and undone.
3. **Workflows before objects**: they're promised (M10) and give objects their triggers.
4. **Objects and actions**: the biggest step, what turns agents that chat into agents that do work.
5. **Evals and the doctor**: keep it working without anyone looking after it.
6. **The field engineer**: makes all of it reach a new person in minutes.
