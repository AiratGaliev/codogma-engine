# Acceptance project fixture

`project.json` is the Project Model v1 root document. Its project-relative asset paths resolve to:

- `scenes/Level.cge-scene.json` — two stable Node IDs, two independent instances of one component type, one shared image asset reference and reciprocal Node references.
- `src/FollowTarget.ts` — explicit `componentDefinition` export with stable type ID, schema version and implementation version. The source is imported by the Core acceptance test to verify the public definition contract and independent factory state; it is not executed as a game runtime module.
- `assets/player.svg` — small original image fixture, checked in with the project.

The folder is a Core contract fixture, not a runnable game. It is intentionally not loaded into `ComponentWorld`: data-driven hydration, Phaser rendering, Preview and standalone HTML5 output remain owned by COD-103, COD-28, COD-30 and COD-33/34/35.

Run the Core acceptance suite from `packages/cge`:

```bash
npm ci
npm run quality:check
```

The separate topic-branch browser/runtime acceptance is not part of this fixture run. Formal functional acceptance is performed on the integrated `test` promotion candidate by the corresponding CODQA issue.
