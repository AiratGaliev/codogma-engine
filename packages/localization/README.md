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
- Runs in Node (validation, tests, tooling) and in the browser (game runtime).
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
npm ci          # locked dev dependencies (TypeScript 5.3.3)
npm run build   # strict typecheck + emit dist/
npm test        # build + node --test contract/service/validation/fixture tests
~~~

Repository-level commands (from the root):

~~~bash
npm run test:localization               # build + unit tests
npm run test:localization:acceptance    # boots the editor server, loads fixture
                                        # tables via /editor/external/, exercises
                                        # the compiled runtime service
~~~

## Test fixtures

- `tests/workspace/test-typescript/locale/` — valid fixture tables of the game
  project (`en-US`, `ru-RU`, sparse `en-GB` for the fallback path).
- `tests/fixtures/` — deliberately invalid tables (broken JSON, missing and
  unsupported versions, duplicate ids, object form, invalid locale tag,
  invalid entries/ids/texts).
