# @codogma/localization

Optional Codogma Engine localization support: versioned locale tables
(contract v1), deterministic fallback, named parameter substitution and
structured diagnostics shared between project data, validation and the game
runtime.

Implemented in [COD-62](https://linear.app/codogma-engine/issue/COD-62/).
The full contract, fallback rules, validation table and known limitations are
documented in [`docs/localization.md`](../../docs/localization.md).

## Scope and boundaries

- Pure TypeScript, zero runtime dependencies; strict compiler profile per
  `docs/decisions/ADR-0002-typescript-toolchain.md`.
- The ESM runtime module has no Node-only or DOM dependencies. The root Node consumer, CLI, and tests are covered. Importing the bare specifier from a browser game project is not yet wired through an import map/bundler or verified by browser acceptance; do not treat browser integration as complete.
- Optional: games that do not use localization are not affected; the editor
  serialization and text components are unchanged by this module.
- RTL, complex text shaping, ICU message format and pluralization are **not**
  claimed or implemented.

## Usage

~~~js
import { LocalizationService, parseLocalizationTable } from "@codogma/localization"

const en = parseLocalizationTable(enUsJsonText, "locale/en-US.json")
const ru = parseLocalizationTable(ruRuJsonText, "locale/ru-RU.json")

const service = new LocalizationService({
    tables: [en.table, ru.table],
    locale: "en-US",
    fallbackLocale: "en-US"
})

service.t("menu.play")                            // "Play"
service.t("profile.welcome", { name: "Alex" })    // "Hello, Alex!"
service.setLocale("ru-RU")                        // deterministic locale switch
service.getDiagnostics()                          // deduplicated project diagnostics
~~~

Table format (contract v1):

~~~json
{
    "schemaVersion": 1,
    "locale": "en-US",
    "messages": [
        { "id": "menu.play", "text": "Play" },
        { "id": "profile.welcome", "text": "Hello, {name}!" }
    ]
}
~~~

Tables live in the game project under `locale/<locale>.json`. Message ids are
stable keys shared by all locales; the object form of `messages` is rejected so
duplicate ids are always detectable.

## Development commands

~~~bash
cd packages/localization
npm ci          # package-lock: TypeScript 5.3.3
npm run build   # strict typecheck + emit dist/
npm test        # build + node --test contract/service/validation/fixture/CLI tests
npm run quality:check  # strict typecheck, scoped ESLint, package format check and unit tests
npm run quality:report # non-blocking Knip + dependency-cruiser reports
~~~

The quality pilot deliberately uses root-locked ESLint, Prettier, Knip and
dependency-cruiser versions rather than duplicating tool dependencies in this
package's lockfile. Prettier checks the complete package-owned source, test and
CLI scope together with its manifest and tooling configuration. This keeps
formatting changes local to the strict package boundary. Run the root `npm ci`
first, then `npm ci` here for the package's pinned TypeScript compiler. The
strict TypeScript compiler options remain package-local; no lint/type/format
gate is enabled across the legacy editor tree.

`quality:report` is report-only: Knip uses `--no-exit-code`; dependency-cruiser
rules use warning severity. Review findings before promoting either report to a
blocking gate. Explicit Knip entries cover the public ESM entry, CLI and tests;
generated `dist/` and fixtures are excluded from unused-file findings. The four shared tool binaries are explicitly ignored because their versions are owned by the root manifest/lockfile rather than duplicated in this package.

Repository-level commands (from the root):

~~~bash
npm run test:localization               # build + unit tests
npm run test:localization:acceptance    # boots the editor server, loads fixture
                                        # tables via /editor/external/, exercises
                                        # the compiled runtime service
~~~

## Integration and public entry point (COD-64)

The package is installed as a dependency of the root repository (`file:` link);
its compiled `dist/` is produced by the documented build command. A clean
checkout must run `npm run build:localization` (or `npm ci` followed by
`npm run prepare` in the package directory) before importing from
`@codogma/localization`.

Project-level diagnostics entry point:

~~~bash
npm run build:localization
node packages/localization/bin/validate-localization.mjs <projectDir> --fallback <locale>
~~~

This entry point reads `<projectDir>/locale/*.json`, applies the structural
parser (`parseLocalizationTable` with the file path preserved in diagnostics),
then runs cross-locale validation (`validateLocalizationSources`). Error diagnostics,
including invalid structure, invalid/unknown fallback configuration and placeholder
mismatches, produce exit code 1. Missing/extra-key warnings are non-blocking and
produce exit code 0. File-system/CLI failures produce exit code 2.

## Test fixtures

- `tests/workspace/test-typescript/locale/` — valid fixture tables of the game
  project (`en-US`, `ru-RU`, sparse `en-GB` for the fallback path).
- `tests/fixtures/` — deliberately invalid tables (broken JSON, missing and
  unsupported versions, duplicate ids, object form, invalid locale tag,
  invalid entries/ids/texts).
