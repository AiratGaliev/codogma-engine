# Editor Host browser acceptance

Run from `src/editor/`:

```bash
npm install
npx playwright install chromium
npm run test:browser
```

The Playwright config starts the existing Node backend against a fresh read/write fixture
directory and starts the Vite Host at `127.0.0.1:5173`. The browser tests exercise
scene open/edit/save/reopen, Undo/Redo, Phaser iframe lifecycle, theme persistence,
command routing, Inspector state and splitter interaction.

The test fixture is the repository's canonical `tests/workspace/test-typescript`
project. The tests never point the backend at a developer's project directory.
