namespace phasereditor2d.scene.core.json {

    import read = colibri.core.json.read;
    import write = colibri.core.json.write;

    export class SceneSettings {

        constructor(
            public compilerEnabled = true,
            public compilerInsertSpaces = false,
            public compilerTabSize = 4,
            public snapEnabled = false,
            public snapWidth = 16,
            public snapHeight = 16,
            public onlyGenerateMethods = false,
            public prefabObjDisplayFmt: string = undefined,
            public displayName: string = undefined,
            public superClassName = "",
            public preloadMethodName = "preload",
            public preloadPackFiles: string[] = [],
            public createMethodName = "create",
            public javaScriptInitFieldsInConstructor = false,
            public sceneKey = "",
            public exportClass = false,
            public autoImport = false,
            public generateAwakeHandler = false,
            public compilerOutputLanguage = ide.core.code.SourceLang.JAVA_SCRIPT,
            public scopeBlocksToFolder: boolean = false,
            public borderX = 0,
            public borderY = 0,
            public borderWidth = 800,
            public borderHeight = 600,
            public box2dEnabled = false,
            public box2dGravityX = 0,
            public box2dGravityY = 10,
            public box2dAllowSleep = true,
            public box2dDebugDraw = false,
            public box2dWorld_scale = 30
        ) {

        }

        toJSON() {

            const data = {};

            write(data, "compilerEnabled", this.compilerEnabled, true);
            write(data, "compilerInsertSpaces", this.compilerInsertSpaces, false);
            write(data, "compilerTabSize", this.compilerTabSize, 4);
            write(data, "snapEnabled", this.snapEnabled, false);
            write(data, "snapWidth", this.snapWidth, 16);
            write(data, "snapHeight", this.snapHeight, 16);
            write(data, "onlyGenerateMethods", this.onlyGenerateMethods, false);
            write(data, "javaScriptInitFieldsInConstructor", this.javaScriptInitFieldsInConstructor, false);
            write(data, "exportClass", this.exportClass, false);
            write(data, "autoImport", this.autoImport, false);
            write(data, "generateAwakeHandler", this.generateAwakeHandler, false);
            write(data, "prefabObjDisplayFmt", this.prefabObjDisplayFmt, undefined);
            write(data, "displayName", this.displayName, undefined);
            write(data, "superClassName", this.superClassName, "");
            write(data, "preloadMethodName", this.preloadMethodName, "preload");
            write(data, "preloadPackFiles", this.preloadPackFiles, []);
            write(data, "createMethodName", this.createMethodName, "create");
            write(data, "sceneKey", this.sceneKey, "");
            write(data, "compilerOutputLanguage", this.compilerOutputLanguage, ide.core.code.SourceLang.JAVA_SCRIPT);
            write(data, "scopeBlocksToFolder", this.scopeBlocksToFolder, false);
            write(data, "borderX", this.borderX, 0);
            write(data, "borderY", this.borderY, 0);
            write(data, "borderWidth", this.borderWidth, 800);
            write(data, "borderHeight", this.borderHeight, 600);
            write(data, "box2dEnabled", this.box2dEnabled, false);
            write(data, "box2dGravityX", this.box2dGravityX, 0);
            write(data, "box2dGravityY", this.box2dGravityY, 10);
            write(data, "box2dAllowSleep", this.box2dAllowSleep, true);
            write(data, "box2dDebugDraw", this.box2dDebugDraw, false);
            write(data, "box2dWorld_scale", this.box2dWorld_scale, 30);

            return data;
        }

        readJSON(data: object) {

            this.compilerEnabled = read(data, "compilerEnabled", true);
            this.compilerInsertSpaces = read(data, "compilerInsertSpaces", false);
            this.compilerTabSize = read(data, "compilerTabSize", 4);
            this.snapEnabled = read(data, "snapEnabled", false);
            this.snapWidth = read(data, "snapWidth", 16);
            this.snapHeight = read(data, "snapHeight", 16);
            this.onlyGenerateMethods = read(data, "onlyGenerateMethods", false);
            this.javaScriptInitFieldsInConstructor = read(data, "javaScriptInitFieldsInConstructor", false);
            this.exportClass = read(data, "exportClass", false);
            this.autoImport = read(data, "autoImport", false);
            this.generateAwakeHandler = read(data, "generateAwakeHandler", false);
            this.prefabObjDisplayFmt = read(data, "prefabObjDisplayFmt", undefined);
            this.displayName = read(data, "displayName", undefined);
            this.superClassName = read(data, "superClassName", "");
            this.preloadMethodName = read(data, "preloadMethodName", "preload");
            this.preloadPackFiles = read(data, "preloadPackFiles", []);
            this.createMethodName = read(data, "createMethodName", "create");
            this.sceneKey = read(data, "sceneKey", "");
            this.compilerOutputLanguage = read(data, "compilerOutputLanguage", ide.core.code.SourceLang.JAVA_SCRIPT);
            this.scopeBlocksToFolder = read(data, "scopeBlocksToFolder", false);
            this.borderX = read(data, "borderX", 0);
            this.borderY = read(data, "borderY", 0);
            this.borderWidth = read(data, "borderWidth", 800);
            this.borderHeight = read(data, "borderHeight", 600);
            this.box2dEnabled = read(data, "box2dEnabled", false);
            this.box2dGravityX = read(data, "box2dGravityX", 0);
            this.box2dGravityY = read(data, "box2dGravityY", 10);
            this.box2dAllowSleep = read(data, "box2dAllowSleep", true);
            this.box2dDebugDraw = read(data, "box2dDebugDraw", false);
            this.box2dWorld_scale = read(data, "box2dWorld_scale", 30);
        }
    }
}