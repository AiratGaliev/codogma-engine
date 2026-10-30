/**
 * Report-only dependency rules for the strict localization package pilot.
 * Current findings are advisory; promote rules to blocking severity only
 * after reviewing baseline/false positives in a dedicated change.
 */
module.exports = {
    forbidden: [
        {
            name: "no-circular",
            severity: "warn",
            comment: "Circular dependencies are reported during the pilot but do not yet block the package build.",
            from: {},
            to: { circular: true }
        },
        {
            name: "source-must-not-import-tests",
            severity: "warn",
            comment: "Runtime localization modules must remain independent from test code; report first, then ratchet.",
            from: { path: "^src/" },
            to: { path: "^tests/" }
        }
    ],
    options: {
        doNotFollow: { path: "node_modules" },
        tsConfig: { fileName: "tsconfig.json" },
        moduleSystems: ["es6", "cjs"],
        enhancedResolveOptions: { exportsFields: ["exports"] }
    }
}
