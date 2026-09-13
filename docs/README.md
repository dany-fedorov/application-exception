# Documentation map

| Document | Purpose | Shipped in the package |
| --- | --- | --- |
| [README](../README.md) | What the library does, install, quick start, report shapes | yes |
| [AGENTS.md](../AGENTS.md) | Rules for coding agents, report shapes, layout, checks | yes |
| [API card](agent/api-card.md) | Generated signatures, summaries, and examples for every export | yes |
| [Recipes](agent/recipes.md) | Six complete tasks, each a compiling snippet | yes |
| [Errors](agent/errors.md) | One section per `APPEX_*` code: when, cause, fix | yes |
| [Schemas](../schemas) | JSON Schemas for both reports | yes |
| [Changelog](../CHANGELOG.md) | Changes by release | yes |
| [Vocabulary](../CONTEXT.md) | The terms the code and docs use | no |
| [Specs and plans](superpowers) | Design decisions and implementation plans | no |

## Where a fact lives

| Fact | Home |
| --- | --- |
| A rule an agent must follow | `AGENTS.md`; the JSDoc of the API it concerns repeats it in one sentence |
| What an export does and one example | its JSDoc in `src/`; the API card is generated from it |
| One way per task | `TASKS` in `tools/docs/api-card.cjs` |
| A library error, its cause, and its fix | `docs/agent/errors.md`; error messages carry the section URL |
| corj field meanings | the caught-object-report-json README and schema |
| Extension and public field meanings | `README.md` and the schema descriptions |
| Vocabulary | `CONTEXT.md` |

## Checks

`npm run docs:generate` rewrites the API card from JSDoc. `npm run docs:check`
regenerates it in memory and fails on drift, type-checks every fenced `ts`
block in `README.md`, `AGENTS.md`, and `docs/agent/*.md` against `src`,
enforces the size budgets (`AGENTS.md` 150 lines, the card 400), requires one
errors.md section per code, and resolves every relative link. Use `json` or
`text` fences for fragments that are not complete programs; a first line
`// expect-error: <fragment>` marks a block that must fail to compile with a
diagnostic containing the fragment.
