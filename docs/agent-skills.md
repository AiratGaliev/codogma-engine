# Third-party agent skills

This document records the curated third-party skills used while developing Codogma Engine itself. It does not define the future Codogma skills that may later help game developers build games with the engine.

Project-wide agent instructions are in the repository-root AGENTS.md. The skill snapshots are stored in .agents/skills/; the Skills CLI source/hash manifest is skills-lock.json.

## Selection policy

The goal is to provide focused, version-aware guidance for the repository's actual stack and engineering workflows, not to maximize the number of installed skills.

Preferred discovery and source workflow:

1. Use [skills.sh](https://www.skills.sh/) as the primary discovery and installation interface. Its Skills CLI is also used to install, list and update project skills.
2. Use [agentskill.sh](https://agentskill.sh/) as a secondary discovery and comparison catalogue. Install counts, quality labels and security-audit indicators are useful triage signals, not proof that a skill is safe or correct.
3. Prefer the original maintainer's GitHub repository (or the technology project's official repository) as the source of truth. Review the actual SKILL.md, referenced files, commands, scripts and licence before installation.
4. Use the [Agent Skills specification](https://agentskills.io/specification) as the format reference. It standardizes skill packaging; it does not certify skill quality.

A high install count is not a quality guarantee. Reject skills that are stack-incompatible, stale, duplicated, unlicensed or unclear in licensing, introduce unnecessary dependencies, require unrelated integrations, or ask the agent to execute unexplained commands.

## Curated skill set

The selected set is stored as local copies, not symlinks. There are currently 78 skill snapshots across general engineering, editor/web, Phaser, PixiJS, SolidJS, Yandex Games and MCP/browser domains. Skills are loaded selectively by task; an agent should not read all 78 skills for every change.

### General engineering, architecture and quality

| Skill | Upstream source | Intended use / limitation |
|---|---|---|
| codebase-architecture | [mblode/agent-skills](https://github.com/mblode/agent-skills) | Architecture, module boundaries, deepening and guardrails. Use existing-codebase modes; ignore Next.js scaffolding defaults. |
| api-and-interface-design | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | API, module and type contracts. |
| typescript-advanced-types | [wshobson/agents](https://github.com/wshobson/agents) | Advanced type modelling; use only when the code needs it. |
| nodejs-backend-patterns | [wshobson/agents](https://github.com/wshobson/agents) | Node.js service patterns. The project uses Node built-ins; do not introduce Express/Fastify from examples. |
| debugging-and-error-recovery | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | Root-cause debugging, not guess-and-patch. |
| test-driven-development | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | Red-green-refactor workflow; adapt commands to this repository's test runner. |
| javascript-testing-patterns | [wshobson/agents](https://github.com/wshobson/agents) | JavaScript/Node testing practices; current root tests use node:test. |
| code-review-and-quality | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | Multi-axis review before integration. |
| code-simplification | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | Simplify without changing behavior or weakening correctness. |
| documentation-and-adrs | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | Technical documentation and architecture decisions. |
| security-and-hardening | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | Trust boundaries, validation, server security and dependency risks. |

### Editor UI, design system and web quality

| Skill | Upstream source | Intended use / limitation |
|---|---|---|
| frontend-design | [anthropics/skills](https://github.com/anthropics/skills) | Visual direction and UI critique. Ground every design in Codogma's existing Workbench and Pencil source. |
| tailwind-design-system | [wshobson/agents](https://github.com/wshobson/agents) | Tailwind CSS 4 tokens, CSS-first configuration and reusable styling. Its React/Radix examples are not SolidJS implementation guidance. |
| vite | [antfu/skills](https://github.com/antfu/skills) | Vite configuration and plugin API. The skill snapshot describes Vite 8.3.1; verify the actual project version before applying advice. |
| accessibility | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | WCAG-oriented accessibility review. |
| best-practices | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | Web security, compatibility and quality checks; validate recommendations against the existing architecture. |
| seo | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | Use for public-facing product/docs pages, not for the editor's internal workspace. |
| web-quality-audit | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | Broad web quality audit; use with real rendered evidence. Its bundled HTML analyzer is read-only but requires Bash and jq. |
| performance | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | Evidence-led performance investigation. Do not apply generic budgets without calibrating to the editor workload and target devices. |
| core-web-vitals | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | LCP, INP and CLS context for web-facing surfaces. Field-data claims require actual field data. |

### Phaser 4 reference skills

These 28 skills are sourced from the official [phaserjs/phaser](https://github.com/phaserjs/phaser) repository. They cover the feature areas that Codogma's editor/runtime integration may expose:

actions-and-utilities, animations, audio-and-sound, cameras, curves-and-paths, data-manager, events-system, filters-and-postfx, game-object-components, game-setup-and-config, geometry-and-math, graphics-and-shapes, groups-and-containers, input-keyboard-mouse-touch, loading-assets, particles, physics-arcade, physics-matter, render-textures, scale-and-responsive, scenes, sprites-and-images, text-and-bitmaptext, tilemaps, time-and-timers, tweens, v3-to-v4-migration and v4-new-features.

The current engine integration is Phaser 4.2.1. The skills are reference material, not a substitute for checking the vendored 4.2.1 source and type definitions. Use v3-to-v4-migration only for migration work.

### SolidJS Editor Host

| Skill | Upstream source | Intended use / limitation |
|---|---|---|
| solid-js-best-practices | [richardcarls/solid-js-best-practices](https://github.com/richardcarls/solid-js-best-practices) | 71 detailed rules for Solid reactivity, components, state, DOM, performance, accessibility and testing. Community-maintained and based on Solid 1.x; inspect the installed `solid-js` version first. Testing examples assume Vitest; do not add Vitest, router, TanStack Query or web-component libraries from its examples unless separately justified and approved. Official SolidJS docs and actual package types remain authoritative. |

### PixiJS renderer-adapter reference

These 26 skills come from the official [pixijs/pixijs-skills](https://github.com/pixijs/pixijs-skills) collection for PixiJS v8. They cover Application lifecycle, render pipeline, scene graph, sprites, graphics, text, assets, input/events, ticker, shaders, filters, particles, accessibility, environment and performance. Start with the `pixijs` router, then load only the relevant `pixijs-*` reference.

**Strict scope:** PixiJS is a possible future rendering-adapter reference in the technical specification, not the selected engine runtime and not part of the first Editor Host migration slice. Do not add PixiJS dependencies, replace Phaser or adopt its `create-pixi` React templates. Any adapter proposal requires an explicit task, a neutral engine contract, compatibility/prototype evidence and a separate architecture decision. Phaser 4.2.1 remains the current integration.

### Game platform integration

| Platform / skill | Upstream source | Intended use / limitation |
|---|---|---|
| Yandex Games — `yandex-games-dev` | [ayubjon/yandex-games-skill](https://github.com/ayubjon/yandex-games-skill) | Yandex Games SDK startup, readiness, language, pause/resume, optional ads/storage/IAP and submission evidence. Its bundled 93-check checker is third-party and unofficial; use current official Yandex requirements as the authority. Adapt its browser/Three.js/Unity/Godot examples to Codogma's platform-neutral service contracts and the real target runtime. Do not add optional monetization by default or submit/publish without authorization. |
| VK Games | No dedicated skill found in the skills.sh search | Use the [official VK Games developer documentation](https://dev.vk.com/ru/games/overview) and Codogma's own technical specification when this roadmap P2 / phase 4 work begins. Reuse API-contract, TypeScript, security and testing skills. Keep its adapter separate from Yandex Games. Do not substitute the [VKCOM/vk-bridge](https://github.com/VKCOM/vk-bridge) library: its stated scope is VK Mini Apps integration. Do not confuse VK Games with VK Play; GamePush lists VK Games and VK Play as separate supported platform targets. |

**Do not install an unrelated VK skill just because its name contains `vk`.** The catalogue search returned VK social/app skills and VK Bridge-related material, but no reviewed VK Games integration skill. The platform's official documentation and actual SDK/API contracts are more important than a generic skill. GamePush documents a third-party unified SDK for several platforms, including VK Games, Yandex Games and VK Play; it may be evaluated as an optional integration/provider, but it is not an official VK Games skill or an automatic architectural choice for Codogma.

### MCP and browser automation

| Skill | Upstream source | Intended use / limitation |
|---|---|---|
| mcp-builder | [anthropics/skills](https://github.com/anthropics/skills) | MCP server/tool design for Node and TypeScript. Preserve Codogma's existing engine-owned MCP registry and contracts. Its evaluation harness calls the Anthropic API and can execute a configured MCP subprocess/endpoint; do not run without explicit approval and review of data/tool effects. |
| playwright-cli | [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) | Browser inspection, snapshots, interaction, screenshots and tracing. The skill is instructions only; the CLI executable and browsers are separate installations. At this setup, the CLI was not available on PATH and the root project had no Playwright Test configuration. |

## Installation and maintenance

The project uses the official Skills CLI with explicit project scope and physical copies:

~~~powershell
npx --yes skills add <owner/repo> --skill <skill-name> --agent codex --copy --yes
npx --yes skills list --json
~~~

The CLI updates skills-lock.json when a skill is added or removed. Keep the lock file and the corresponding .agents/skills/<skill-name>/ directory in the same change.

To update project skills, run npx --yes skills update --project --yes deliberately, then review the complete diff, hashes, references and changed behavior before accepting it. Do not update skills automatically as part of ordinary builds or CI.

skills-lock.json is not an npm dependency lockfile and does not replace the checked-in snapshots. It records source paths and content hashes; the committed files under .agents/skills/ are what make this repository reproducible without relying on the experimental skills experimental_install command.

The project deliberately does not ignore .agents/. Selected skill files, their references and the lock manifest are reviewable and should be committed together. Do not add an unconditional /.agents/ ignore rule.

## Licence and attribution

Third-party licence texts and the upstream mapping are kept in [docs/licenses/agent-skills/](licenses/agent-skills/README.md). Anthropic's two installed skills include their own Apache-2.0 LICENSE.txt files. The Microsoft Playwright CLI also uses Apache-2.0. The remaining listed source repositories declare MIT for their installed materials. The Antfu skills repository declares MIT in its README and the Vite skill is generated from the MIT-licensed Vite project documentation; see the accompanying notice for this distinction.

## Non-installed tools and rejected skill categories

- **pen.dev workflow:** no trustworthy dedicated Agent Skill for the `.pen` design format was found in the catalogue search. The project therefore documents the official pen.dev editor/CLI workflow and its own local validation test instead of installing an unrelated Penpot/PencilKit skill. See the next section and [official CLI docs](https://docs.pencil.dev/for-developers/pen-cli).
- **Playwright test framework:** `playwright-cli` provides manual browser-control instructions, not a test runner. A second Playwright skill was not added because the project currently has no Playwright Test application suite and its actual test runner is Node `node:test`; reconsider when ADR-0006's browser QA package is implemented.
- **Rapier / additional physics:** discovered skills were primarily Three.js/R3F integrations. No suitable generic TypeScript/2D adapter skill passed the fit check; rely on the physics ADR, official backend documentation, and API-contract skills when that work is scoped.
- **Generic game-engine/game-design skills:** available examples were largely introductory HTML canvas, unrelated 3D/multiplayer/monetization workflows and duplicate the official Phaser references. They add little value for Codogma's existing engine codebase.
- **VK Games-specific skill:** none passed discovery because no suitable dedicated skill was found. Do not substitute unrelated `vk-bridge` or general VK social-app skills; use the official VK Games documentation when platform integration reaches its roadmap phase.
- **Yandex Playables or unrelated portal skills:** not installed; the selected Yandex Games skill is scoped to the platform explicitly named by the technical specification. Other portals require a separate requirement and evidence review.
- **React/Next.js-only performance rules:** not active Codogma UI guidance; the new Host target is SolidJS. Framework-neutral ideas can still be used selectively.
- **Vercel web-design-guidelines:** omitted because the upstream repository did not provide a clear standalone licence file for redistribution; Addy Osmani's MIT-licensed web-quality-audit and accessibility skills cover the relevant review work.
- **OpenAI's old security-threat-model skill:** removed because its source skills repository is deprecated; the active security-and-hardening skill is retained.
- **Phaser 3-only or unrelated stacks (Next.js, Nuxt, Vue, Tauri, React):** not installed as active project guidance.

## `.pen` design source workflow

`src/editor/codogma-editor.pen` is a structured visual design document. For interactive editing use pen.dev's editor, or the official authenticated CLI/MCP workflow. Do not make ad hoc edits to the serialized JSON or manually regenerate IDs and node relationships. For CLI agent edits preserve the source with `--in` and write a reviewed copy with `--out`; export a PNG/JPEG/WEBP/PDF and inspect the visual result. CLI agent/export/interactive operations require authentication and Node.js 22.19 or later; installation is a global tool change, so it is not performed automatically. See [pen.dev CLI](https://docs.pencil.dev/for-developers/pen-cli), [`.pen` file guidance](https://docs.pencil.dev/core-concepts/pen-files) and `AGENTS.md`.

The deterministic `scripts/apply-design-tokens-to-pen.mjs` and `scripts/import-godot-svg-icons-to-pen.mjs` are narrow, project-owned transforms, not general-purpose `.pen` editing APIs. After changing the document or these scripts run `node --test tests/codogma-editor-pen-assets.test.mjs`, the SVG asset test, and visually inspect the result in pen.dev. A structural test cannot prove visual fidelity.
