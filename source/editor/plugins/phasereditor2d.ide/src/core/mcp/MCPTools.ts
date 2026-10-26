namespace phasereditor2d.ide.core.mcp {

    import io = colibri.core.io;
    import FileUtils = colibri.ui.ide.FileUtils;

    /**
     * One MCP content item, as expected by the official @phaserjs/editor-mcp-server:
     * the editor answers HTTP tool calls with an ARRAY of these items and the official
     * bridge returns them as the MCP tool `content` verbatim (see official bridge.ts).
     */
    export interface IMCPContentItem {
        type: "text" | "image";
        text?: string;
        data?: string;
        mimeType?: string;
    }

    export interface IMCPSceneInfo {
        id: string;
        sceneKey: string;
        path: string;
        sceneType: string;
    }

    const CONTENT_TYPE_SCENE = "phasereditor2d.core.scene.SceneContentType";

    /**
     * Client-side registry of the MCP tools supported by this editor build.
     *
     * This class lives in the ide plugin (which cannot compile-time reference the
     * scene/pack plugins), so scene/pack specific features are accessed through the
     * runtime global namespace objects (`window["phasereditor2d"]["scene"|"pack"]`),
     * with graceful degradation when they are not available.
     */
    export class MCPTools {

        private static _instance = new MCPTools();

        static getInstance() {

            return this._instance;
        }

        private constructor() {
        }

        async executeTool(tool: string, args: any): Promise<IMCPContentItem[]> {

            args = args ?? {};

            try {

                switch (tool) {

                    case "ide-get-all-scenes-in-project":
                        return this.text(JSON.stringify({
                            scenes: await this.getAllScenes()
                        }, null, 2));

                    case "ide-get-active-scene":
                        return this.text(JSON.stringify({
                            scene: this.getActiveScene()
                        }, null, 2));

                    case "ide-open-scene":
                        return await this.openScene(args.sceneId);

                    case "ide-create-new-scene":
                        return await this.createNewScene(args.name);

                    case "ide-save-scene":
                        return await this.saveScene(args.sceneId);

                    case "scene-get-scene-data":
                        return await this.getSceneData(args.sceneId);

                    case "scene-get-scene-dimension":
                        return await this.getSceneDimension(args.sceneId);

                    case "scene-clear-scene":
                        return await this.clearScene(args.sceneId);

                    case "scene-get-screenshot":
                        return await this.getSceneScreenshot(args);

                    case "assets-get-available-asset-packs":
                        return this.text(JSON.stringify({
                            assetPacks: await this.getAssetPacksInfo()
                        }, null, 2));

                    case "assets-get-available-textures":
                        return this.text(JSON.stringify({
                            textures: await this.getAvailableTextures()
                        }, null, 2));

                    case "assets-get-texture-size":
                        return await this.getTextureSize(args.texture);

                    case "assets-get-available-animations":
                        return this.text(JSON.stringify({
                            animations: await this.getAvailableAnimations()
                        }, null, 2));

                    case "assets-get-available-tilemaps":
                        return this.text(JSON.stringify({
                            tilemaps: await this.getAvailableAssets("tilemap")
                        }, null, 2));

                    case "assets-get-available-bitmapfonts":
                        return this.text(JSON.stringify({
                            bitmapFonts: await this.getAvailableAssets("bitmapFont")
                        }, null, 2));

                    case "assets-get-available-spine-skeletons":
                        return this.text(JSON.stringify({
                            skeletons: await this.getAvailableAssets("spine")
                        }, null, 2));

                    case "assets-get-available-spine-atlases":
                        return this.text(JSON.stringify({
                            atlases: await this.getAvailableAssets("spineAtlas")
                        }, null, 2));

                    case "assets-get-tilemap-data":
                        return await this.getTilemapData(args.key);

                    default:
                        return this.text(`Tool '${tool}' is not supported by this editor build yet.`);
                }

            } catch (e) {

                return this.text(`Tool '${tool}' error: ${(e as Error).message}`);
            }
        }

        private text(text: string): IMCPContentItem[] {

            return [{ type: "text", text }];
        }

        private image(dataUrl: string): IMCPContentItem[] {

            const marker = "base64,";

            const i = dataUrl.indexOf(marker);

            return [{
                type: "image",
                data: i >= 0 ? dataUrl.substring(i + marker.length) : dataUrl,
                mimeType: "image/png"
            }];
        }

        ///////////////////////////////////////////////////////////////////////////////
        // scene files
        ///////////////////////////////////////////////////////////////////////////////

        private isProjectOpen(): boolean {

            try {

                return colibri.Platform.getWorkbench().getProjectRoot() !== null
                    && colibri.Platform.getWorkbench().getProjectRoot() !== undefined;

            } catch (e) {

                return false;
            }
        }

        private assertProjectOpen() {

            if (!this.isProjectOpen()) {

                throw new Error("There is no project open in the editor yet.");
            }
        }

        private getSceneFiles(): io.FilePath[] {

            const reg = colibri.Platform.getWorkbench().getContentTypeRegistry();

            return FileUtils.getAllFiles().filter(file => {

                if (file.getExtension() !== "scene") {

                    return false;
                }

                // prefer the registered content type; fall back to the extension

                try {

                    return reg.getCachedContentType(file) === CONTENT_TYPE_SCENE;

                } catch (e) {

                    return true;
                }
            });
        }

        private async readSceneData(file: io.FilePath): Promise<any> {

            await FileUtils.preloadFileString(file);

            return JSON.parse(FileUtils.getFileString(file));
        }

        private async getAllScenes(): Promise<IMCPSceneInfo[]> {

            this.assertProjectOpen();

            const scenes: IMCPSceneInfo[] = [];

            for (const file of this.getSceneFiles()) {

                try {

                    const data = await this.readSceneData(file);

                    scenes.push({
                        id: data["id"] ?? "",
                        sceneKey: data["settings"]?.["sceneKey"] || file.getNameWithoutExtension(),
                        path: file.getFullName(),
                        sceneType: data["sceneType"] ?? "SCENE",
                    });

                } catch (e) {
                    // ignore broken scene files
                }
            }

            return scenes;
        }

        private async findSceneFile(sceneId: string): Promise<{ file: io.FilePath, data: any }> {

            this.assertProjectOpen();

            if (!sceneId) {

                throw new Error(`Missing "sceneId". Available scenes: `
                    + (await this.getAllScenes()).map(s => `${s.path} (${s.id})`).join(", "));
            }

            for (const file of this.getSceneFiles()) {

                try {

                    const data = await this.readSceneData(file);

                    if (data["id"] === sceneId
                        || file.getNameWithoutExtension() === sceneId
                        || file.getFullName() === sceneId) {

                        return { file, data };
                    }

                } catch (e) {
                    // ignore broken scene files
                }
            }

            throw new Error(`Scene "${sceneId}" not found. Available scenes: `
                + (await this.getAllScenes()).map(s => `${s.path} (${s.id})`).join(", "));
        }

        private getActiveScene(): IMCPSceneInfo | null {

            const editor = colibri.Platform.getWorkbench().getActiveEditor();

            if (!editor) {

                return null;
            }

            const file = editor.getInput();

            if (!file || !(file instanceof io.FilePath) || file.getExtension() !== "scene") {

                return null;
            }

            let data: any = {};

            try {

                data = JSON.parse(FileUtils.getFileString(file));

            } catch (e) {
                // ignore
            }

            return {
                id: data["id"] ?? "",
                sceneKey: data["settings"]?.["sceneKey"] || file.getNameWithoutExtension(),
                path: file.getFullName(),
                sceneType: data["sceneType"] ?? "SCENE",
            };
        }

        private async openScene(sceneId: string): Promise<IMCPContentItem[]> {

            const { file } = await this.findSceneFile(sceneId);

            colibri.Platform.getWorkbench().openEditor(file);

            return this.text(`Scene opened in the editor: ${file.getFullName()}`);
        }

        private async createNewScene(nameArg: string): Promise<IMCPContentItem[]> {

            this.assertProjectOpen();

            let name = (nameArg ?? "Scene").trim();

            if (name.length === 0) {

                name = "Scene";
            }

            // strip the extension, if any

            name = name.replace(/\.scene$/i, "");

            const root = FileUtils.getRoot();

            // find a unique file name

            let fileName = `${name}.scene`;

            let i = 2;

            while (root.getFile(fileName)) {

                fileName = `${name}${i}.scene`;
                i++;
            }

            const sceneName = FileUtils.getFileNameWithoutExtension(fileName);

            // minimal valid scene file, same structure the editor's new-scene wizard creates

            const sceneData = {
                id: this.createUUID(),
                settings: {
                    compilerOutputLanguage: "JAVA_SCRIPT",
                    javaScriptInitFieldsInConstructor: false,
                    exportClass: false,
                    autoImport: false,
                    createMethodName: "editorCreate",
                    compilerInsertSpaces: false,
                    compilerTabSize: 4,
                    borderWidth: 800,
                    borderHeight: 600,
                    borderX: 0,
                    borderY: 0,
                    sceneKey: sceneName,
                },
                sceneType: "SCENE",
                displayList: [],
                meta: {
                    app: "Codogma Engine - Scene Editor",
                    url: "https://codogma.com",
                    contentType: CONTENT_TYPE_SCENE
                }
            };

            const file = await FileUtils.createFile_async(
                root, fileName, JSON.stringify(sceneData, null, 2));

            return this.text(`Scene created: ${file.getFullName()} (id: ${sceneData.id}). `
                + `Use the ide-open-scene tool to open it in the editor.`);
        }

        private createUUID(): string {

            try {

                const uuid = (window as any)["Phaser"]?.["Utils"]?.["String"]?.["UUID"];

                if (uuid) {

                    return uuid();
                }

            } catch (e) {
                // fallthrough
            }

            // RFC4122 version 4 fallback

            return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {

                const r = Math.random() * 16 | 0;

                const v = c === "x" ? r : (r & 0x3 | 0x8);

                return v.toString(16);
            });
        }

        private async saveScene(sceneId: string): Promise<IMCPContentItem[]> {

            const { file } = await this.findSceneFile(sceneId);

            const wb = colibri.Platform.getWorkbench();

            const editor = wb.getOpenEditorsWithInput(file)[0];

            if (!editor) {

                return this.text(`Scene "${file.getFullName()}" is not open in the editor. `
                    + `The scene file on disk is already in sync.`);
            }

            await editor.save();

            return this.text(`Scene saved: ${file.getFullName()}`);
        }

        ///////////////////////////////////////////////////////////////////////////////
        // scene data
        ///////////////////////////////////////////////////////////////////////////////

        private async getSceneData(sceneId: string): Promise<IMCPContentItem[]> {

            const { file, data } = await this.findSceneFile(sceneId);

            return this.text(JSON.stringify({
                id: data["id"],
                sceneKey: data["settings"]?.["sceneKey"],
                sceneType: data["sceneType"],
                displayList: data["displayList"] ?? [],
                lists: data["lists"] ?? [],
                plainObjects: data["plainObjects"] ?? [],
                file: file.getFullName(),
            }, null, 2));
        }

        private async getSceneDimension(sceneId: string): Promise<IMCPContentItem[]> {

            const { data } = await this.findSceneFile(sceneId);

            const settings = data["settings"] ?? {};

            return this.text(JSON.stringify({
                borderX: settings["borderX"] ?? 0,
                borderY: settings["borderY"] ?? 0,
                width: settings["borderWidth"] ?? 800,
                height: settings["borderHeight"] ?? 600,
            }, null, 2));
        }

        private async openAndGetSceneEditor(sceneId: string)
            : Promise<{ file: io.FilePath, editor: any }> {

            const { file } = await this.findSceneFile(sceneId);

            const wb = colibri.Platform.getWorkbench();

            let editor = wb.getOpenEditorsWithInput(file)[0];

            if (!editor) {

                wb.openEditor(file);

                editor = wb.getOpenEditorsWithInput(file)[0];
            }

            if (!editor) {

                return null;
            }

            // the scene/game of a freshly opened editor takes a moment to boot

            const start = Date.now();

            while (Date.now() - start < 10000) {

                const scene = editor["getScene"]?.();

                if (scene && editor["getGame"]?.()) {

                    return { file, editor };
                }

                await new Promise(resolve => setTimeout(resolve, 250));
            }

            return { file, editor };
        }

        private async clearScene(sceneId: string): Promise<IMCPContentItem[]> {

            const opened = await this.openAndGetSceneEditor(sceneId);

            if (!opened) {

                return this.text(`Could not open the scene editor of "${sceneId}".`);
            }

            const { file, editor } = opened;

            const sceneNs = this.getSceneNamespace();

            const scene = editor["getScene"]?.();

            if (!sceneNs || !scene) {

                return this.text(`The Scene Editor is not ready for "${file.getFullName()}".`);
            }

            // reuse the editor's own delete operation (it supports undo):

            const undoNs = sceneNs["ui"]?.["editor"]?.["undo"];

            const objects = scene["getGameObjects"]();

            if (!objects || objects.length === 0) {

                return this.text(`The scene "${file.getFullName()}" is empty already.`);
            }

            editor["setSelection"](objects);

            const op = new undoNs["DeleteOperation"](editor);

            await editor["getUndoManager"]()["add"](op);

            return this.text(`Deleted ${objects.length} game object(s) from "${file.getFullName()}". `
                + `The change is undoable in the editor. `
                + `Use the ide-save-scene tool to persist it.`);
        }

        private async getSceneScreenshot(args: any): Promise<IMCPContentItem[]> {

            const opened = await this.openAndGetSceneEditor(args.sceneId);

            if (!opened) {

                return this.text(`Could not open the scene editor of "${args.sceneId}".`);
            }

            const { file, editor } = opened;

            const game = editor["getGame"]?.();

            const canvas: HTMLCanvasElement | undefined = game?.["canvas"];

            if (!game || !canvas) {

                return this.text(`The scene game canvas is not ready for "${file.getFullName()}".`);
            }

            const x = Math.max(0, Math.floor(args.x ?? 0));
            const y = Math.max(0, Math.floor(args.y ?? 0));
            const width = Math.max(1, Math.floor(args.width ?? canvas.width));
            const height = Math.max(1, Math.floor(args.height ?? canvas.height));

            const renderer = game["renderer"];

            if (typeof renderer?.["snapshotArea"] === "function") {

                // WebGL renderer: snapshotArea reads the pixels correctly even
                // without preserveDrawingBuffer.

                const dataUrl = await new Promise<string>((resolve, reject) => {

                    const timer = setTimeout(
                        () => reject(new Error("Scene snapshot timed out.")), 5000);

                    renderer["snapshotArea"](x, y, width, height, (image: HTMLImageElement) => {

                        clearTimeout(timer);

                        resolve(image.src);

                    }, "image/png");
                });

                return this.image(dataUrl);
            }

            // canvas renderer fallback: crop the 2D canvas

            const crop = document.createElement("canvas");

            crop.width = width;
            crop.height = height;

            const ctx = crop.getContext("2d");

            ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);

            return this.image(crop.toDataURL("image/png"));
        }

        ///////////////////////////////////////////////////////////////////////////////
        // assets (asset packs, accessed through the runtime pack namespace)
        ///////////////////////////////////////////////////////////////////////////////

        private getPackNamespace(): any {

            return (window as any)["phasereditor2d"]?.["pack"]?.["core"];
        }

        private async getAssetPacks(): Promise<any[]> {

            this.assertProjectOpen();

            const packCore = this.getPackNamespace();

            if (!packCore) {

                throw new Error("The Asset Pack core module is not loaded yet.");
            }

            return await packCore["AssetPackUtils"]["getAllPacks"]();
        }

        private async getAssetPackItems(): Promise<any[]> {

            const packs = await this.getAssetPacks();

            return packs.flatMap(pack => pack.getItems());
        }

        private async getAssetPacksInfo(): Promise<any[]> {

            return (await this.getAssetPacks()).map(pack => ({
                file: pack.getFile().getFullName(),
                items: pack.getItems().length,
            }));
        }

        private itemToJSON(item: any) {

            const data = item.getData ? item.getData() : {};

            const json: any = {
                key: item.getKey(),
                type: item.getType(),
            };

            if (typeof data["url"] === "string") {

                json.url = data["url"];
            }

            return json;
        }

        private async getAvailableTextures(): Promise<any[]> {

            const items = await this.getAssetPackItems();

            const textures = [];

            for (const item of items) {

                const type: string = item.getType() ?? "";

                const isTexture =
                    type === "image"
                    || type === "spritesheet"
                    || type === "aseprite"
                    || type === "multiatlas"
                    || type === "unityAtlas"
                    || type === "atlasXML"
                    || type.endsWith("atlas");

                if (!isTexture) {

                    continue;
                }

                const json = this.itemToJSON(item);

                // frame count + (for plain images) pixel size, best-effort

                try {

                    if (typeof item.getFrames === "function") {

                        json.frames = item.getFrames().length;
                    }

                    if (type === "image") {

                        const url: string | undefined = item.getData()["url"];

                        const pack = item.getPack();

                        const packCore = this.getPackNamespace();

                        const file = packCore["AssetPackUtils"]["getFileFromPackUrl"](pack, url);

                        if (file) {

                            await FileUtils.preloadImageSize(file);

                            const size = FileUtils.getImageSize(file);

                            if (size) {

                                json.width = size.width;
                                json.height = size.height;
                            }
                        }
                    }

                } catch (e) {
                    // best-effort only
                }

                textures.push(json);
            }

            return textures;
        }

        private async getTextureSize(texture: any): Promise<IMCPContentItem[]> {

            const key = texture?.["key"];

            if (!key) {

                throw new Error(`Missing "texture" argument with a "key" field.`);
            }

            const items = await this.getAssetPackItems();

            const item = items.find(i => i.getKey() === key);

            if (!item) {

                throw new Error(`Texture "${key}" not found in the project asset packs.`);
            }

            const result: any = { key };

            try {

                if (typeof item.getFrames === "function") {

                    const frames = item.getFrames();

                    const frameName = texture["frame"];

                    const frame = frameName !== undefined
                        ? frames.find((f: any) => f.getName() === frameName)
                        : frames[0];

                    if (frame) {

                        result.frame = frame.getName();
                        result.width = frame.getWidth();
                        result.height = frame.getHeight();
                    }

                } else if (item.getType() === "image") {

                    const url: string = item.getData()["url"];

                    const packCore = this.getPackNamespace();

                    const file = packCore["AssetPackUtils"]
                        .getFileFromPackUrl(item.getPack(), url);

                    if (file) {

                        await FileUtils.preloadImageSize(file);

                        const size = FileUtils.getImageSize(file);

                        result.width = size?.width;
                        result.height = size?.height;
                    }
                }

            } catch (e) {
                // best-effort
            }

            return this.text(JSON.stringify(result, null, 2));
        }

        private async getAvailableAnimations(): Promise<any[]> {

            const items = await this.getAssetPackItems();

            const animations: any[] = [];

            for (const item of items) {

                if (typeof item.getAnimations !== "function") {

                    continue;
                }

                for (const anim of item.getAnimations()) {

                    animations.push({
                        key: anim.getKey(),
                        assetPackItem: item.getKey(),
                    });
                }
            }

            return animations;
        }

        private async getAvailableAssets(typePrefix: string): Promise<any[]> {

            const items = await this.getAssetPackItems();

            return items
                .filter(item => (item.getType() ?? "").startsWith(typePrefix))
                .map(item => this.itemToJSON(item));
        }

        private async getTilemapData(key: string): Promise<IMCPContentItem[]> {

            if (!key) {

                throw new Error(`Missing "key" argument with the tilemap asset pack item key.`);
            }

            const items = await this.getAssetPackItems();

            const item = items.find(i => i.getKey() === key);

            if (!item) {

                throw new Error(`Asset "${key}" not found in the project asset packs.`);
            }

            const url: string = item.getData()["url"];

            const packCore = this.getPackNamespace();

            const file = packCore["AssetPackUtils"].getFileFromPackUrl(item.getPack(), url);

            if (!file) {

                throw new Error(`Cannot resolve the tilemap file of "${key}".`);
            }

            const content = await FileUtils.preloadAndGetFileString(file);

            return this.text(JSON.stringify({
                key,
                file: file.getFullName(),
                data: JSON.parse(content),
            }, null, 2));
        }

        private getSceneNamespace(): any {

            return (window as any)["phasereditor2d"]?.["scene"];
        }
    }
}
