import type Phaser from "phaser";
import { ComponentRegistry, ProjectSceneLoader, type ProjectDocumentV1 } from "@codogma/cge";
import { createPhaserRuntimeSceneLoader } from "@codogma/runtime-phaser";
import projectDocumentJson from "../../../../../../packages/cge/tests/fixtures/acceptance-project/project.json";
import sceneDocumentText from "../../../../../../packages/cge/tests/fixtures/acceptance-project/scenes/Level.cge-scene.json?raw";
import { componentDefinition } from "../../../../../../packages/cge/tests/fixtures/acceptance-project/src/FollowTarget";
import playerSpriteUrl from "../../../../../../packages/cge/tests/fixtures/acceptance-project/assets/player.svg?url";
import phaserVendorUrl from "../../../../../../scripts/phaser.min.js?url";

type PhaserNamespace = typeof Phaser;

declare global {
  interface Window {
    Phaser?: PhaserNamespace;
  }
}

const SCENE_KEY = "acceptance-scene";
const PLAYER_TEXTURE_KEY = "acceptance-player";

function countNodes(nodes: readonly { readonly children: readonly unknown[] }[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children as typeof nodes), 0);
}

function loadPhaserVendor(): Promise<PhaserNamespace> {
  if (window.Phaser) return Promise.resolve(window.Phaser);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = phaserVendorUrl;
    script.async = true;
    script.addEventListener("load", () => {
      if (window.Phaser) resolve(window.Phaser);
      else reject(new Error("The vendored Phaser 4.2.1 bundle did not expose window.Phaser."));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load the vendored Phaser 4.2.1 bundle.")), { once: true });
    document.head.append(script);
  });
}

function startGame(PhaserRuntime: PhaserNamespace, root: HTMLElement): void {
  class AcceptanceScene extends PhaserRuntime.Scene {
    constructor() {
      super({ key: SCENE_KEY });
    }

    preload(): void {
      this.load.svg(PLAYER_TEXTURE_KEY, playerSpriteUrl);
    }

    create(): void {
      void this.loadProjectScene().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.add.text(12, 12, "Scene load failed: " + message, {
          color: "#ff8f8f",
          fontFamily: "sans-serif",
          fontSize: "14px",
          wordWrap: { width: 440 },
        });
        this.game.canvas.dataset.codogmaRuntimeError = message;
      });
    }

    private async loadProjectScene(): Promise<void> {
      const project = projectDocumentJson as ProjectDocumentV1;
      const sceneReference = project.scenes.find((scene) => scene.id === "scene-level");
      if (!sceneReference) throw new Error("Acceptance Project has no registered Scene.");

      const registry = new ComponentRegistry();
      registry.register(componentDefinition);
      const coreLoader = new ProjectSceneLoader({
        project,
        registry,
        readAssetDocument: async (asset) => {
          if (asset.id !== sceneReference.assetId || asset.kind !== "scene") {
            throw new Error("Unexpected fixture asset request: " + asset.id);
          }
          return sceneDocumentText;
        },
      });

      const runtimeLoader = createPhaserRuntimeSceneLoader(this, coreLoader, {
        projectId: project.id,
        componentViewFactories: {
          [componentDefinition.schema.typeId]: ({ scene, document }) => {
            const sprite = document.properties.sprite;
            if (
              typeof sprite !== "object" ||
              sprite === null ||
              !("assetId" in sprite) ||
              sprite.assetId !== "asset-player-sprite"
            ) {
              throw new Error("Follow Target requires the registered player sprite asset.");
            }
            return scene.add.image(0, 0, PLAYER_TEXTURE_KEY);
          },
        },
      });

      const session = await runtimeLoader.load({
        sceneId: sceneReference.id,
        signal: new AbortController().signal,
      });
      await session.activate();

      const canvas = this.game.canvas;
      canvas.dataset.codogmaRuntime = "phaser";
      canvas.dataset.codogmaSceneId = session.sceneId;
      canvas.dataset.codogmaNodeCount = String(countNodes(session.coreSession.graph.rootNodes));
      canvas.dataset.codogmaComponentCount = String(session.coreSession.world.listComponents().length);
      performance.mark("codogma-scene-ready");
    }
  }

  new PhaserRuntime.Game({
    type: PhaserRuntime.AUTO,
    parent: root,
    width: 480,
    height: 320,
    backgroundColor: "#20242b",
    scene: [AcceptanceScene],
  });
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("HTML5 fixture root element is missing.");

root.dataset.buildProfile = String(import.meta.env.MODE) + "|" + String(import.meta.env.DEV) + "|" + String(import.meta.env.PROD);
root.replaceChildren();

void loadPhaserVendor().then((PhaserRuntime) => startGame(PhaserRuntime, root)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  root.dataset.runtimeError = message;
  root.textContent = message;
});
