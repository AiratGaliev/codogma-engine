# @codogma/feature-registry

Host-neutral Feature/Capability Registry v1 for Codogma Engine.

## Responsibilities

- Stable feature IDs and declarative built-in/package providers.
- Required/default/optional policy, project selection and target overrides.
- Provider availability against a normalized inventory of exact installed package instances.
- Scope/target checks, explicit multi-provider policies, dependency closure, cycles and conflicts.
- Deterministic machine-readable selection report and snapshots for Core Build Analysis.
- Versioned project selection serialization and validation.

The package does not install packages, resolve npm semver/dependency graphs, execute provider entry points, activate runtime features, or claim byte-level exclusion from game artifacts. npm / Package Manager owns installation; Host lifecycle owns activation; COD-51 owns package.json `codogma` metadata ingestion; COD-35 owns bundler output and physical artifact evidence. ECS provider IDs and architecture remain canonical in ADR-0004.

Run `npm run quality:check` from this workspace.
