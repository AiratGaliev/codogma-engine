/**
 * dependency-cruiser rules — scoped to the modules owned by the
 * editor-priority branch (server + mini-services + tests). Run via
 * `npm run deps:check`. Legacy editor sources are not part of this scope.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: "no-circular",
            severity: "error",
            comment: "Circular dependencies among the server modules make the security-critical path harder to reason about.",
            from: {},
            to: { circular: true }
        },
        {
            name: "server-must-not-import-editor",
            severity: "error",
            comment: "The local server is standalone Node code; it must not depend on editor plugin sources.",
            from: { path: "^server/" },
            to: { path: "^source/" }
        },
        {
            name: "mini-services-standalone",
            severity: "error",
            comment: "Mini-services are independently deployable; they may not import server code.",
            from: { path: "^mini-services/" },
            to: { path: "^server/" }
        },
        {
            name: "tests-standalone",
            severity: "error",
            comment: "Tests exercise the public surface (HTTP) and pure extracted modules (path-security, request-origin); they must not reach into other server internals.",
            from: { path: "^tests/" },
            to: {
                path: "^server/(?!path-security\\.mjs$|request-origin\\.mjs$)",
                pathNot: "^server/(?:path-security|request-origin)\\.mjs$"
            }
        }
    ],
    options: {
        doNotFollow: { path: "node_modules" },
        tsConfig: undefined,
        enhancedResolveOptions: { exportsFields: ["exports"] },
        moduleSystems: ["es6", "cjs"],
        reporterOptions: {
            text: { highlightFocused: true }
        }
    }
}
