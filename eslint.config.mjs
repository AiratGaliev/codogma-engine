/*
 * ESLint flat config — scoped to files touched by the editor-priority
 * implementation branch. Legacy code is deliberately NOT linted (no mass
 * reformatting, no repo-wide enforcement), so this config lists the exact
 * files each block covers. New server/tests work should extend these lists.
 *
 *   - Node ESM sources (server, mini-services, tests): eslint recommended.
 *   - TypeScript editor sources changed by this branch: typescript-eslint
 *     recommended (non-type-aware; the editor build uses project references).
 *   - eslint-config-prettier last: formatting stays with Prettier.
 */

import js from "@eslint/js"
import tseslint from "typescript-eslint"
import globals from "globals"
import prettier from "eslint-config-prettier"

const nodeSources = [
    "server/server.mjs",
    "server/path-security.mjs",
    "server/mcp.mjs",
    "mini-services/ai-chat/index.mjs",
    "mini-services/phaser-editor-mcp/index.mjs",
    "tests/security-smoke-test.mjs",
    "tests/mini-services-security-test.mjs",
    "tests/path-security.test.mjs",
    "packages/localization/tests/*.test.mjs",
    "packages/localization/bin/validate-localization.mjs"
]

const localizationTypeScriptSources = [
    "packages/localization/src/**/*.ts"
]

const editorTypeScriptSources = [
    "source/editor/plugins/colibri/src/Plugin.ts",
    "source/editor/plugins/colibri/src/ui/controls/properties/FormBuilder.ts",
    "source/editor/plugins/colibri/src/ui/ide/actions/ColibriCommands.ts",
    "source/editor/plugins/phasereditor2d.ide/src/IDEPlugin.ts",
    "source/editor/plugins/phasereditor2d.ide/src/core/json/SceneFinder.ts",
    "source/editor/plugins/phasereditor2d.ide/src/ui/actions/AIActions.ts",
    "source/editor/plugins/phasereditor2d.ide/src/ui/actions/IDEActions.ts",
    "source/editor/plugins/phasereditor2d.ide/src/ui/actions/UpdateActions.ts",
    "source/editor/plugins/phasereditor2d.resources/src/ResourcesPlugin.ts",
    "source/editor/plugins/phasereditor2d.scene/src/ui/sceneobjects/object/properties/SceneObjectSection.ts"
]

export default tseslint.config(
    {
        // Vendored third-party code and test fixtures are never linted.
        ignores: [
            "node_modules/**",
            "tests/workspace/**",
            "source/editor/plugins/colibri/scripts/**",
            "source/editor/plugins/phasereditor2d.phaser/scripts/**"
        ]
    },
    {
        files: nodeSources,
        extends: [js.configs.recommended],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: "module",
            globals: {
                ...globals.node
            }
        },
        rules: {
            // The codebase's established error-swallowing style is
            // `catch (e) { }`; flagging it would mean churning legacy catch
            // blocks in files this branch only partially touched.
            "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }]
        }
    },
    {
        files: localizationTypeScriptSources,
        extends: [tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: "module"
        },
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }
            ]
        }
    },
    {
        files: editorTypeScriptSources,
        extends: [tseslint.configs.recommended],
        languageOptions: {
            globals: {
                ...globals.browser
            }
        },
        rules: {
            // The editor codebase targets ES5-era output and uses namespaces;
            // these rules would flag the surrounding (unchanged) API style.
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-empty-object-type": "off",
            // `any` is the established style of these plugin APIs; enforcing
            // stricter typing is a follow-up for new code, not a mass change.
            "@typescript-eslint/no-explicit-any": "off",
            // colibri uses namespace + triple-slash module wiring by design.
            "@typescript-eslint/triple-slash-reference": "off",
            // Handler signatures are fixed by the framework interface.
            "@typescript-eslint/no-unused-vars": [
                "error",
                { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }
            ]
        }
    },
    prettier,
    {
        // `namespace colibri` in the framework's Plugin.ts is a global ambient
        // namespace whose identifier is intentionally unreferenced inside the
        // file — a typescript-eslint false positive for this codebase style.
        files: ["source/editor/plugins/colibri/src/Plugin.ts"],
        rules: {
            "@typescript-eslint/no-unused-vars": "off"
        }
    }
)
