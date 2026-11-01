# Editor Host browser acceptance

Run from `src/editor/`:

```bash
npm install --no-audit --no-fund
npx playwright install chromium
npm run typecheck
npm run test
npm run test:browser
```

The Editor Host source, domain models, unit/integration tests, Playwright specs, Playwright configuration and its backend fixture launcher are TypeScript. The UI uses SolidJS TSX. Vitest runs `tests/**/*.test.ts`; Playwright runs `browser-tests/**/*.spec.ts` against Chromium.

The Playwright config starts the existing Node backend against a fresh read/write fixture
directory and starts the Vite Host at `127.0.0.1:5173`. The browser tests exercise
scene open/edit/save/reopen, Undo/Redo, Phaser iframe lifecycle, theme persistence,
command routing, Inspector state and splitter interaction.

The test fixture is the repository's canonical `tests/workspace/test-typescript`
project. The tests never point the backend at a developer's project directory.
