import type Phaser from "phaser";
import {
  ProjectSceneLoader,
  resolveProjectComponentRegistry,
  type ProjectDocumentV1,
  type SceneDocumentV1,
} from "@codogma/cge";
import { createPhaserRuntimeSceneLoader } from "@codogma/runtime-phaser";
import projectDocumentJson from "../../../../../../packages/cge/tests/fixtures/acceptance-project/project.json";
import sceneDocumentText from "../../../../../../packages/cge/tests/fixtures/acceptance-project/scenes/Level.cge-scene.json?raw";
import playerSpriteUrl from "../../../../../../packages/cge/tests/fixtures/acceptance-project/assets/player.svg?url";

export type PhaserNamespace = typeof Phaser;

const SCENE_KEY = "acceptance-scene";
const PLAYER_TEXTURE_KEY = "acceptance-player";

export function loadPhaserUmd(url: string): Promise<PhaserNamespace> {
  const phaserWindow = window as unknown as { Phaser?: PhaserNamespace };
  if (phaserWindow.Phaser) return Promise.resolve(phaserWindow.Phaser);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.addEventListener("load", () => {
      if (phaserWindow.Phaser) resolve(phaserWindow.Phaser);
      else reject(new Error("The Phaser UMD bundle did not expose window.Phaser."));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load the Phaser UMD bundle.")), { once: true });
    document.head.append(script);
  });
}

function collectRequiredComponentTypeIds(nodes: SceneDocumentV1["rootNodes"]): string[] {
  const result: string[] = [];
  const visit = (items: SceneDocumentV1["rootNodes"]): void => {
    for (const node of items) {
      for (const component of node.components) result.push(component.typeId);
      visit(node.children);
    }
  };
  visit(nodes);
  return [...new Set(result)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function countNodes(nodes: readonly { readonly children: readonly unknown[] }[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children as typeof nodes), 0);
}

export function startRuntime(
  PhaserRuntime: PhaserNamespace,
  root: HTMLElement,
  variant: "full" | "arcade-only",
): void {
  (window as unknown as { Phaser?: PhaserNamespace }).Phaser = PhaserRuntime;
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
      let arcadeBodyCreated = false;
      const sceneReference = project.scenes.find((scene) => scene.id === "scene-level");
      if (!sceneReference) throw new Error("Acceptance Project has no registered Scene.");
      const sceneDocument = JSON.parse(sceneDocumentText) as SceneDocumentV1;

      // Component typeId → script Asset resolution is shared with Preview through Core.
      // The host-owned loader controls which source modules are importable for this build.
      const moduleResolution = await resolveProjectComponentRegistry({
        project,
        requiredTypeIds: collectRequiredComponentTypeIds(sceneDocument.rootNodes),
        signal: new AbortController().signal,
        loadModule: async (asset) => {
          if (asset.path !== "src/FollowTarget.ts") {
            throw new Error("No pinned fixture module loader is registered for " + asset.path);
          }
          const module = await import("../../../../../../packages/cge/tests/fixtures/acceptance-project/src/FollowTarget");
          return module.componentDefinition;
        },
      });
      if (!moduleResolution.valid || !moduleResolution.registry) {
        throw new Error("Project Component resolution failed: " + JSON.stringify(moduleResolution.diagnostics));
      }

      const coreLoader = new ProjectSceneLoader({
        project,
        registry: moduleResolution.registry,
        readAssetDocument: async (asset) => {
          if (asset.id !== sceneReference.assetId || asset.kind !== "scene") {
            throw new Error("Unexpected fixture asset request: " + asset.id);
          }
          return sceneDocumentText;
        },
      });

      const componentTypeId = project.componentModules.find(
        (module) => module.moduleAssetId === project.assets.find((asset) => asset.path === "src/FollowTarget.ts")?.id,
      )?.typeId;
      if (!componentTypeId) throw new Error("Project manifest does not register the Follow Target Component type.");

      const runtimeLoader = createPhaserRuntimeSceneLoader(this, coreLoader, {
        projectId: project.id,
        componentViewFactories: {
          [componentTypeId]: ({ scene, document }) => {
            const sprite = document.properties.sprite;
            if (
              typeof sprite !== "object" ||
              sprite === null ||
              !("assetId" in sprite) ||
              sprite.assetId !== "asset-player-sprite"
            ) {
              throw new Error("Follow Target requires the registered player sprite asset.");
            }
            const image = scene.add.image(0, 0, PLAYER_TEXTURE_KEY);
            scene.physics.add.existing(image);
            arcadeBodyCreated = Boolean(
              (image as unknown as { body?: unknown }).body,
            );
            if (!arcadeBodyCreated) {
              throw new Error("The selected Phaser distribution did not attach an Arcade Physics Body.");
            }
            return image;
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
      canvas.dataset.codogmaResolvedComponentTypes = moduleResolution.loadedTypeIds.join(",");
      const apiCoverage = [
        ["Game", typeof PhaserRuntime.Game === "function"],
        ["Scene", typeof PhaserRuntime.Scene === "function"],
        ["AUTO", typeof PhaserRuntime.AUTO === "number"],
        ["Scene.load.svg", typeof this.load.svg === "function"],
        ["Scene.add.image", typeof this.add.image === "function"],
        ["Arcade.add.existing", typeof this.physics?.add?.existing === "function"],
        ["Arcade.Body", arcadeBodyCreated],
      ] as const;
      const missingApi = apiCoverage.filter(([, available]) => !available).map(([name]) => name);
      if (missingApi.length > 0) {
        throw new Error("The selected Phaser distribution is missing runtime APIs: " + missingApi.join(", "));
      }
      canvas.dataset.codogmaRuntimeApiCoverage = apiCoverage.map(([name]) => name).join(",");
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
    physics: {
      default: "arcade",
      arcade: { gravity: { y: 0 } },
    },
    scene: [AcceptanceScene],
  });
}
