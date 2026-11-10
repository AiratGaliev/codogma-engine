import { loadPhaserUmd, startRuntime } from "./runtime";
// The official Arcade-only UMD distribution is a file artifact, not a public package export.
import arcadeBundleUrl from "../../../../../../node_modules/phaser/dist/phaser-arcade.min.js?url";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("HTML5 fixture root element is missing.");
root.dataset.buildProfile = `${import.meta.env.MODE}|${import.meta.env.DEV}|${import.meta.env.PROD}`;
root.replaceChildren();

void loadPhaserUmd(arcadeBundleUrl)
  .then((PhaserRuntime) => startRuntime(PhaserRuntime, root, "arcade-only"))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    root.dataset.runtimeError = message;
    root.textContent = message;
  });
