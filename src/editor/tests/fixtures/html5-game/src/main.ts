import { loadPhaserUmd, startRuntime } from "./runtime";
import fullBundleUrl from "../../../../../../node_modules/phaser/dist/phaser.min.js?url";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("HTML5 fixture root element is missing.");
root.dataset.buildProfile = `${import.meta.env.MODE}|${import.meta.env.DEV}|${import.meta.env.PROD}`;
root.replaceChildren();

void loadPhaserUmd(fullBundleUrl)
  .then((PhaserRuntime) => startRuntime(PhaserRuntime, root, "full"))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    root.dataset.runtimeError = message;
    root.textContent = message;
  });
