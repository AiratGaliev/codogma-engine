import { ComponentRegistry, ProjectSceneLoader, type ProjectDocumentV1 } from "@codogma/cge";
import projectDocumentJson from "../../../../../../packages/cge/tests/fixtures/acceptance-project/project.json";
import sceneDocumentText from "../../../../../../packages/cge/tests/fixtures/acceptance-project/scenes/Level.cge-scene.json?raw";
import { componentDefinition } from "../../../../../../packages/cge/tests/fixtures/acceptance-project/src/FollowTarget";
import playerSpriteUrl from "../../../../../../packages/cge/tests/fixtures/acceptance-project/assets/player.svg?url";

async function startFixture(): Promise<void> {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) throw new Error("HTML5 fixture root element is missing.");
  const project = projectDocumentJson as ProjectDocumentV1;
  const sceneReference = project.scenes[0];
  if (!sceneReference) throw new Error("Acceptance Project has no registered Scene.");
  const registry = new ComponentRegistry();
  registry.register(componentDefinition);
  const loader = new ProjectSceneLoader({
    project,
    registry,
    readAssetDocument: async (asset) => {
      if (asset.id !== sceneReference.assetId || asset.kind !== "scene") {
        throw new Error("Unexpected fixture asset request: " + asset.id);
      }
      return sceneDocumentText;
    },
  });
  const session = await loader.load({
    sceneId: sceneReference.id,
    signal: new AbortController().signal,
  });
  try {
    session.activate();
    const heading = document.createElement("h1");
    heading.textContent = "Loaded Scene: " + session.graph.sceneId;
    const detail = document.createElement("p");
    detail.textContent = session.graph.rootNodes.length + " root Nodes; " +
      session.world.listComponents().length + " registered Component instances";
    const sprite = document.createElement("img");
    sprite.src = playerSpriteUrl;
    sprite.alt = "Acceptance project player sprite";
    app.replaceChildren(heading, detail, sprite);
  } finally {
    await session.dispose();
  }
}

void startFixture().catch((error: unknown) => {
  const app = document.querySelector<HTMLElement>("#app");
  if (app) app.textContent = error instanceof Error ? error.message : String(error);
});
