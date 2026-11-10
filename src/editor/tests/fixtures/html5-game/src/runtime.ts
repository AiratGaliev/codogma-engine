import type Phaser from "phaser";
import { ComponentRegistry, ProjectSceneLoader, type ProjectDocumentV1 } from "@codogma/cge";
import { createPhaserRuntimeSceneLoader } from "@codogma/runtime-phaser";
import projectDocumentJson from "../../../../../../packages/cge/tests/fixtures/acceptance-project/project.json";
import sceneDocumentText from "../../../../../../packages/cge/tests/fixtures/acceptance-project/scenes/Level.cge-scene.json?raw";
import { componentDefinition } from "../../../../../../packages/cge/tests/fixtures/acceptance-project/src/FollowTarget";
import playerSpriteUrl from "../../../../../../packages/cge/tests/fixtures/acceptance-project/assets/player.svg?url";

export type PhaserNamespace = typeof Phaser;

declare global {
  interface Window {
    Phaser?: PhaserNamespace;
  }
}

const SCENE_KEY = "acceptance-scene";
const PLAYER_TEXTURE_KEY = "acceptance-player";

export function loadPhaserUmd(url: string): Promise<PhaserNamespace> {
  if (window.Phaser) return Promise.resolve(window.Phaser);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.addEventListener("load", () => {
      if (window.Phaser) resolve(window.Phaser);
      else reject(new Error("The Phaser UMD bundle did not expose window.Phaser."));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load the Phaser UMD bundle.")), { once: true });
    document.head.append(script);
  });
}

function countNodes(nodes: readonly { readonly children: readonly unknown[] }[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children as typeof nodes), 0);
}

export function startRuntime(
  PhaserRuntime: PhaserNamespace,
  root: HTMLElement,
  variant: "full" | "arcade-only",
): void {
  window.Phaser = PhaserRuntime;
  root.dataset.phaserVariant = variant;
  const physics = PhaserRuntime.Physics as unknown as { Arcade?: unknown; Matter?: unknown };
  root.dataset.phaserArcade = String(Boolean(physics?.Arcade));
  root.dataset.phaserMatter = String(Boolean(physics?.Matter));

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
      requestAnimationFrame(() => requestAnimationFrame(() => performance.mark("codogma-first-frame")));
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
