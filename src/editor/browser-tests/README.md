# Editor Host browser acceptance

Run from `src/editor/`:

```bash
npm ci --no-audit --no-fund
npx playwright install chromium
npm run typecheck
npm run test
npm run test:browser
```

The Editor Host source, domain models, unit/integration tests, Playwright specs, Playwright configuration and its backend fixture launcher are TypeScript. The UI uses SolidJS TSX. Vitest runs `tests/**/*.test.ts`; Playwright runs `browser-tests/**/*.spec.ts` against Chromium.

The Playwright config starts the existing Node backend against a fresh read/write fixture
directory and starts the Vite Host at `127.0.0.1:5173`. The browser tests exercise
scene open/edit/save/reopen, Undo/Redo, Phaser iframe lifecycle, theme persistence,
command routing, Inspector state, native Browser Preview Host session lifecycle and splitter interaction.

Workspace-layout acceptance covers cross-zone panel grouping, unified pointer interaction, previews/insertion indicators, Escape/pointer cancellation, Hierarchy/Inspector/Console/Project/Animation/Components close and reopen, outside-click menu dismissal, checkable View visibility and Window active-tab states, v0/v1/v2-to-v3 workspace migration,
Bottom Dock collapse when every tab is closed, Console default Bottom docking with reversible explicit Undock, fallback selection when Project is closed, narrow-mode Console-close fallback to transient side panels, restoration after reload, keyboard-driven tab navigation, splitter resizing and double-click size reset,
compact/wide user-size round trips, short-viewport constraints, pointer identity/lost-capture cleanup, Console selection
across compact/wide transitions, and narrow-screen Undock behavior while the Bottom
presentation is transient. The tests
also check that docking does not create duplicate panel or Scene Canvas nodes.

The baseline browser suite uses the repository's canonical `tests/workspace/test-typescript`
project. Runtime Identity acceptance overlays the dedicated
`packages/cge/tests/fixtures/acceptance-project` files in the same isolated backend
fixture through the project operations API. The tests never point the backend at a
developer's project directory.


## Runtime Identity / Live Inspector

`runtime-identity-live-inspector.spec.ts` belongs to the promotion browser-acceptance gate. It starts the native Browser Preview Host, selects two Component attachments sharing a `typeId` but having different instance IDs, verifies exact Runtime Hierarchy → authoring Inspector mapping, observes a changing runtime-only property, and confirms Restart/Stop cleanup with unchanged serialized Scene data.
