namespace phasereditor2d.scene.core.code {

    import io = colibri.core.io;
    import ISceneGameObject = ui.sceneobjects.ISceneGameObject;

    export class SceneCodeDOMBuilder {

        private _scene: ui.Scene;
        private _isPrefabScene: boolean;
        private _sceneFile: io.FilePath;
        private _unit: UnitCodeDOM;
        private _fileNameMap: Map<string, io.FilePath>;
        private _requireDeclareVarSet: Set<string>;
        private _objectsToFieldList: ISceneGameObject[];

        constructor(scene: ui.Scene, file: io.FilePath) {

            this._scene = scene;
            this._sceneFile = file;
            this._isPrefabScene = this._scene.isPrefabSceneType();
            this._fileNameMap = new Map();
            this._requireDeclareVarSet = new Set();
            this._objectsToFieldList = [];
        }

        private getCompletePhaserType(obj: ISceneGameObject) {

            const objES = obj.getEditorSupport();
            const objExt = objES.getExtension();

            const typeName = objExt.getPhaserTypeName();

            if (objExt.isThirdPartyLib()) {

                if (this._scene.isESModule()) {

                    this._unit.addImport(`${typeName}`, objExt.getPhaserTypeThirdPartyLibModule(), false);

                    return typeName;
                }

                return objExt.getPhaserTypeThirdPartyLib() + "." + typeName;
            }

            return typeName;
        }

        async build(): Promise<UnitCodeDOM> {

            colibri.ui.ide.Workbench.getWorkbench().getFileStorage().getRoot().visit(file => {

                if (file.isFile()) {

                    this._fileNameMap.set(file.getNameWithoutExtension(), file);
                }
            });

            const settings = this._scene.getSettings();

            const methods: MemberDeclCodeDOM[] = [];

            const unit = new UnitCodeDOM([]);

            this._unit = unit;

            if (settings.onlyGenerateMethods) {

                const createMethodDecl = this.buildCreateMethod();

                await this.buildPreloadMethod(unit.getBody() as any);

                unit.getBody().push(createMethodDecl);

            } else {

                const clsName = this.getClassName();
                const clsDecl = new ClassDeclCodeDOM(clsName);

                clsDecl.setExportClass(settings.exportClass);

                let superCls: string;

                if (this._isPrefabScene) {

                    const obj = this._scene.getPrefabObject();

                    if (!obj) {

                        return null;
                    }

                    const objES = obj.getEditorSupport();

                    if (obj.getEditorSupport().isPrefabInstance()) {

                        superCls = objES.getPrefabName();

                    } else {

                        superCls = this.getCompletePhaserType(obj);
                    }

                    superCls = settings.superClassName.trim().length === 0 ?
                        superCls : settings.superClassName;

                } else {

                    superCls = settings.superClassName.trim().length === 0 ?
                        "Phaser.Scene" : settings.superClassName;
                }

                clsDecl.setSuperClass(superCls);

                if (superCls.startsWith("Phaser.")) {

                    unit.addImport("Phaser", "phaser", true);

                } else {

                    const superClsFile = this._fileNameMap.get(superCls);

                    if (superClsFile) {

                        const { importPath, asDefault } = code.getImportPath(this._sceneFile, superClsFile);

                        unit.addImport(superCls, importPath, asDefault);
                    }
                }

                if (this._isPrefabScene) {

                    // prefab constructor

                    const ctrMethod = this.buildPrefabConstructorMethod();
                    methods.push(ctrMethod);

                } else {

                    // scene constructor

                    const key = settings.sceneKey;

                    if (key.trim().length > 0) {

                        const ctrMethod = this.buildSceneConstructorMethod(key);
                        methods.push(ctrMethod);
                    }

                    // scene preload method

                    await this.buildPreloadMethod(methods);

                    // scene create method

                    const createMethodDecl = this.buildCreateMethod();
                    methods.push(createMethodDecl);
                }

                const fields: MemberDeclCodeDOM[] = [];

                this.buildObjectClassFields(fields, this._scene.getGameObjects());
                this.buildPlainObjectsClassFields(fields);
                this.buildListClassFields(fields);

                if (this._isPrefabScene) {

                    this.buildPrefabPropertiesFields(fields);
                }

                clsDecl.getBody().push(...methods);
                clsDecl.getBody().push(...fields);

                if (this._isPrefabScene) {

                    clsDecl.getBody().push(new UserSectionCodeDOM(
                        "/* START-USER-CODE */", "/* END-USER-CODE */", "\n\n\t// Write your code here.\n\n\t"));

                } else {

                    const defaultContent = [
                        "",
                        "",
                        "// Write your code here",
                        "",
                        "create() {",
                        "",
                        "\tthis.editorCreate();",
                        "}",
                        "",
                        ""].join("\n\t");

                    clsDecl.getBody().push(new UserSectionCodeDOM(
                        "/* START-USER-CODE */", "/* END-USER-CODE */", defaultContent));
                }

                unit.getBody().push(clsDecl);
            }

            return unit;
        }

        private addImportForType(type: string) {

            if (!this._scene.getSettings().autoImport) {

                return;
            }

            if (type) {

                if (type.startsWith("Phaser.")) {

                    this._unit.addImport("Phaser", "phaser", true);

                } else if (this._fileNameMap.has(type)) {

                    const importFile = this._fileNameMap.get(type);

                    const { importPath, asDefault } = code.getImportPath(this._sceneFile, importFile);

                    this._unit.addImport(type, importPath, asDefault);
                }
            }
        }

        private getClassName() {

            return this._sceneFile.getNameWithoutExtension();
        }

        buildPrefabPropertiesFields(fields: MemberDeclCodeDOM[]) {

            const decls = this._scene.getPrefabUserProperties()

                .getProperties()

                .filter(prop => !prop.isCustomDefinition() && !prop.isEditorOnly())

                .flatMap(prop => prop.buildFieldDeclarationCode());

            fields.push(...decls);
        }

        private buildPlainObjectsClassFields(fields: MemberDeclCodeDOM[]) {

            for (const obj of this._scene.getPlainObjects()) {

                const objES = obj.getEditorSupport();

                if (objES.isClassOrPublicScope()) {

                    const objType = objES.getPhaserType();

                    const dom = new FieldDeclCodeDOM(
                        formatToValidVarName(objES.getLabel()),
                        objType,
                        objES.isPublicScope());

                    dom.setAllowUndefined(!this._scene.isPrefabSceneType());

                    fields.push(dom);
                }
            }
        }

        private buildListClassFields(fields: MemberDeclCodeDOM[]) {

            const objMap = this._scene.buildObjectIdMap();

            for (const list of this._scene.getObjectLists().getLists()) {

                if (ui.sceneobjects.isClassOrPublicScope(list.getScope())) {

                    const listType = list.inferType(objMap);

                    const dom = new FieldDeclCodeDOM(
                        formatToValidVarName(list.getLabel()),
                        listType,
                        ui.sceneobjects.isPublicScope(list.getScope()));

                    dom.setAllowUndefined(!this._scene.isPrefabSceneType());

                    fields.push(dom);
                }
            }
        }

        private buildObjectClassFields(fields: MemberDeclCodeDOM[], children: ISceneGameObject[]) {

            for (const obj of this._objectsToFieldList) {

                const objES = obj.getEditorSupport();
                const isPrefabObj = this._scene.isPrefabSceneType() && this._scene.getPrefabObject() === obj;
                const isPrefabScene = this._scene.isPrefabSceneType();

                if (!isPrefabObj) {

                    const varName = code.formatToValidVarName(objES.getLabel());

                    let phaserType = this.getCompletePhaserType(obj);

                    const explicitType = this.getExplicitType(obj, phaserType);

                    if (explicitType) {

                        phaserType = explicitType;
                    }

                    const type = objES.isPrefabInstance()
                        ? objES.getPrefabName()
                        : phaserType;

                    const isPublic = objES.isPublicScope();

                    const field = new FieldDeclCodeDOM(varName, type, isPublic);
                    // Allow undefined if the object is part of a scene.
                    // In a prefab, the objects are created in the constructor
                    field.setAllowUndefined(!isPrefabScene);

                    fields.push(field);
                }
            }
        }

        private buildPrefabConstructorMethod() {

            const ctrDecl = new code.MethodDeclCodeDOM("constructor");

            const body = ctrDecl.getBody();

            const prefabObj = this._scene.getPrefabObject();

            if (!prefabObj) {

                throw new Error("Invalid prefab scene state: missing object.");
            }

            const type = prefabObj.getEditorSupport().getObjectType();

            const ext = ScenePlugin.getInstance().getGameObjectExtensionByObjectType(type);

            const objBuilder = ext.getCodeDOMBuilder();

            this.buildPrefabTypeScriptDefinitionsCodeDOM(prefabObj, objBuilder);

            ctrDecl.arg("scene", "Phaser.Scene");

            const args: ui.sceneobjects.IBuildPrefabConstructorDeclarationCodeDOM = {
                ctrDeclCodeDOM: ctrDecl,
                prefabObj,
                importTypes: [],
                unit: this._unit,
                isESModule: this._scene.isESModule()
            };

            objBuilder.buildPrefabConstructorDeclarationCodeDOM(args);

            for (const type of args.importTypes) {

                this.addImportForType(type);
            }

            {
                const superCall = new MethodCallCodeDOM("super");

                superCall.arg("scene");

                objBuilder.buildPrefabConstructorDeclarationSupperCallCodeDOM({
                    superMethodCallCodeDOM: superCall,
                    prefabObj: prefabObj,
                    unit: this._unit
                });

                body.push(superCall);
                body.push(new RawCodeDOM(""));
            }

            const lazyStatements: CodeDOM[] = [];

            const result = this.buildSetObjectProperties({
                obj: prefabObj,
                varname: "this"
            });

            this.buildCodeSnippets(result.statements);

            lazyStatements.push(...result.lazyStatements);

            body.push(...result.statements);

            this.addChildrenObjects({
                createMethodDecl: ctrDecl,
                obj: prefabObj,
                lazyStatements
            });

            this.addCreateAllPlainObjectCode(ctrDecl.getBody(), lazyStatements);

            this.addCreateListsCode(body);

            body.push(...lazyStatements);

            this.addFieldInitCode(body);

            {
                // prefab awake handler
                const settings = this._scene.getSettings();

                if (settings.generateAwakeHandler) {

                    body.push(new RawCodeDOM("// awake handler"));
                    body.push(new RawCodeDOM("this.scene.events.once(\"scene-awake\", () => this.awake());"));
                    body.push(new RawCodeDOM(""));
                }
            }

            body.push(new RawCodeDOM(""));
            body.push(new UserSectionCodeDOM("/* START-USER-CTR-CODE */", "/* END-USER-CTR-CODE */", "\n\t\t// Write your code here.\n\t\t"))

            this.buildCustomPropertiesInit(body);

            return ctrDecl;
        }

        buildCodeSnippets(statements: CodeDOM[]) {

            const snippets = this._scene.getCodeSnippets().getSnippets();

            if (snippets.length > 0) {

                statements.push(new code.RawCodeDOM(""));
                statements.push(new code.RawCodeDOM("// snippets"));

                for (const codeSnippet of snippets) {

                    const code = codeSnippet.buildCodeDOM();

                    statements.push(...code);
                }
            }
        }

        private buildPrefabTypeScriptDefinitionsCodeDOM(prefabObj: ISceneGameObject, objBuilder: ui.sceneobjects.GameObjectCodeDOMBuilder) {

            for (const comp of prefabObj.getEditorSupport().getActiveComponents()) {

                comp.buildPrefabTypeScriptDefinitionsCodeDOM({
                    unit: this._unit,
                    prefabObj,
                    clsName: this.getClassName()
                });
            }

            const settings = this._scene.getSettings();

            for (const iface of this._unit.getTypeScriptInterfaces()) {

                iface.setExportInterface(settings.exportClass);
            }
        }

        private buildCustomPropertiesInit(body: code.CodeDOM[]) {

            const userProps = this._scene.getPrefabUserProperties();

            const assignDomList = userProps.getProperties()

                .filter(prop => prop.isCustomDefinition() && !prop.isEditorOnly())

                .map(prop => {

                    const fieldDecl = prop.buildFieldDeclarationCode();

                    const assignDom = new code.AssignPropertyCodeDOM(fieldDecl.getName(), "this");
                    assignDom.value(fieldDecl.getInitialValueExpr());

                    return assignDom;
                });

            if (assignDomList.length > 0) {

                body.push(new code.RawCodeDOM("\n"));
                body.push(new code.RawCodeDOM("// custom definition props"));
            }

            body.push(...assignDomList);
        }

        private buildCreateMethod() {

            const settings = this._scene.getSettings();

            const createMethodDecl = new MethodDeclCodeDOM(settings.createMethodName);
            createMethodDecl.setReturnType("void");

            if (settings.onlyGenerateMethods && this._scene.isPrefabSceneType()) {

                createMethodDecl.arg("scene", "Phaser.Scene");
            }

            const body = createMethodDecl.getBody();

            const lazyStatements: CodeDOM[] = [];

            // box2d

            ui.sceneobjects.Box2DBodyComponent.resetBodyVarCounter();

            this.buildBox2DWorldCode(body);

            this.buildCodeSnippets(body);

            this.addCreateAllPlainObjectCode(body, lazyStatements);

            for (const obj of this._scene.getGameObjects()) {

                if (obj.getEditorSupport().isMutableNestedPrefabInstance()) {

                    // this.addCreateObjectCodeOfNestedPrefab(obj, createMethodDecl, lazyStatements);
                    throw new Error("Assert: this code should not be reached.");

                } else {

                    body.push(new RawCodeDOM(""));
                    body.push(new RawCodeDOM("// " + obj.getEditorSupport().getLabel()));

                    this.addCreateObjectCode(obj, createMethodDecl, lazyStatements);
                }
            }

            this.addCreateListsCode(body);

            body.push(...lazyStatements);

            this.addFieldInitCode(body);

            this.buildBox2DWorldUpdateCode(body);

            body.push(new RawCodeDOM(""));
            body.push(new RawCodeDOM(`this.events.emit("scene-awake");`));

            return createMethodDecl;
        }

        private buildBox2DWorldCode(body: CodeDOM[]) {

            const settings = this._scene.getSettings();

            if (this._scene.isPrefabSceneType() || !settings.box2dEnabled) {

                return;
            }

            for (const name of ["SetWorldScale", "CreateWorld", "b2DefaultWorldDef", "b2Vec2"]) {

                ui.sceneobjects.Box2DBodyComponent.addBox2DImport(this._unit, name, this._sceneFile);
            }

            // shortcut: the debugDraw setting is not emitted yet, it needs the
            // PhaserDebugDraw.js project-file plumbing of the official editor

            // the editor Y points down, the Box2D world Y points up
            const gravityY = -settings.box2dGravityY;

            body.push(
                new RawCodeDOM(""),
                new RawCodeDOM("// box2d world creation"),
                new RawCodeDOM(`SetWorldScale(${this.getBox2DWorldScale()});`),
                new RawCodeDOM(`const box2dWorld = CreateWorld({ worldDef: { ...b2DefaultWorldDef(), `
                    + `gravity: new b2Vec2(${settings.box2dGravityX}, ${gravityY})`
                    + `${settings.box2dAllowSleep ? "" : ", enableSleep: false"} } });`),
                new RawCodeDOM(`const box2dWorldId = box2dWorld.worldId;`));
        }

        private getBox2DWorldScale(): number {

            const scale = this._scene.getSettings().box2dWorld_scale;

            return typeof scale === "number" && Number.isFinite(scale) && scale > 0
                ? scale
                : 30;
        }

        /**
         * Use a scene-local accumulator and the low-level fixed-step API:
         * Phaser supplies delta in milliseconds, while Box2D uses seconds.
         * Keeping the accumulator local avoids coupling concurrent worlds through
         * the helper library's module-level WorldStep accumulator.
         *
         * Register an event handler instead of shadowing a user-defined update()
         * method, then remove it and destroy the world on scene shutdown.
         */
        private buildBox2DWorldUpdateCode(body: CodeDOM[]) {

            const settings = this._scene.getSettings();

            if (this._scene.isPrefabSceneType() || !settings.box2dEnabled) {

                return;
            }

            for (const name of ["b2World_Step", "UpdateWorldSprites", "ClearWorldSprites", "b2DestroyWorld"]) {

                ui.sceneobjects.Box2DBodyComponent.addBox2DImport(this._unit, name, this._sceneFile);
            }

            const updateArgs = settings.compilerOutputLanguage === "TYPE_SCRIPT"
                ? "(_time: number, delta: number)"
                : "(_time, delta)";

            body.push(
                new RawCodeDOM(""),
                new RawCodeDOM("// box2d world update and cleanup"),
                new RawCodeDOM("let box2dAccumulator = 0;"),
                new RawCodeDOM("const box2dFixedTimeStep = 1 / 60;"),
                new RawCodeDOM("const box2dSubStepCount = 4;"),
                new RawCodeDOM(`const updateBox2DWorld = ${updateArgs} => {`),
                new RawCodeDOM("    box2dAccumulator = Math.min(box2dAccumulator + Math.max(0, delta) / 1000, box2dFixedTimeStep * 3);"),
                new RawCodeDOM("    let box2dSteps = 0;"),
                new RawCodeDOM("    while (box2dAccumulator >= box2dFixedTimeStep && box2dSteps < 3) {"),
                new RawCodeDOM("        b2World_Step(box2dWorldId, box2dFixedTimeStep, box2dSubStepCount);"),
                new RawCodeDOM("        box2dAccumulator -= box2dFixedTimeStep;"),
                new RawCodeDOM("        box2dSteps++;"),
                new RawCodeDOM("    }"),
                // SetWorldScale is global in Phaser Box2D; reapply this scene's scale
                // before converting body transforms back to pixels.
                new RawCodeDOM(`    SetWorldScale(${this.getBox2DWorldScale()});`),
                new RawCodeDOM("    UpdateWorldSprites(box2dWorldId);"),
                new RawCodeDOM("};"),
                new RawCodeDOM(`this.events.on("update", updateBox2DWorld);`),
                new RawCodeDOM(`this.events.once("shutdown", () => {`),
                new RawCodeDOM(`    this.events.off("update", updateBox2DWorld);`),
                new RawCodeDOM("    ClearWorldSprites(box2dWorldId);"),
                new RawCodeDOM("    b2DestroyWorld(box2dWorldId);"),
                new RawCodeDOM("});"));
        }

        private addCreateAllPlainObjectCode(firstStatements: CodeDOM[], lazyStatements: CodeDOM[]) {

            for (const obj of this._scene.getPlainObjects()) {

                this.addCreatePlainObjectCode(obj, firstStatements, lazyStatements);
            }
        }

        private addCreatePlainObjectCode(
            obj: ui.sceneobjects.IScenePlainObject, firstStatements: CodeDOM[], lazyStatements: CodeDOM[]) {

            const objES = obj.getEditorSupport();

            const varname = formatToValidVarName(objES.getLabel());

            const result = objES.getExtension().buildCreateObjectWithFactoryCodeDOM({
                gameObjectFactoryExpr: this._scene.isPrefabSceneType() ? "scene" : "this",
                obj: obj,
                varname
            });

            const comments = [
                new RawCodeDOM(""),
                new RawCodeDOM("// " + obj.getEditorSupport().getLabel())
            ];

            if (result.firstStatements) {

                firstStatements.push(...comments);
                firstStatements.push(...result.firstStatements);
            }

            if (result.lazyStatements) {

                lazyStatements.push(...comments);
                lazyStatements.push(...result.lazyStatements);
            }

            const objectFactoryMethodCall = result.objectFactoryMethodCall;

            if (objES.isClassOrPublicScope() || objES.isMethodScope()) {

                objectFactoryMethodCall.setDeclareReturnToVar(true);
            }

            if (objectFactoryMethodCall.isDeclareReturnToVar()) {

                objectFactoryMethodCall.setReturnToVar(varname);
            }
        }

        private addCreateListsCode(body: CodeDOM[]) {

            const lists = this._scene.getObjectLists().getLists();

            if (lists.length > 0) {

                body.push(
                    new RawCodeDOM(""),
                    new RawCodeDOM("// lists"));
            }

            for (const list of lists) {

                const map = this._scene.buildObjectIdMap();
                const objectVarnames: string[] = [];

                for (const objId of list.getObjectIds()) {

                    const obj = map.get(objId);

                    if (obj) {

                        objectVarnames.push(formatToValidVarName(obj.getEditorSupport().getLabel()));
                    }
                }

                const varname = formatToValidVarName(list.getLabel());

                let dom: RawCodeDOM;
                const isTsOutput = this._scene.getSettings().compilerOutputLanguage === "TYPE_SCRIPT";

                if (isTsOutput && objectVarnames.length === 0) {

                    dom = new RawCodeDOM(`const ${varname}: Array<any> = [${objectVarnames.join(", ")}];`);

                } else {

                    dom = new RawCodeDOM(`const ${varname} = [${objectVarnames.join(", ")}];`);
                }

                body.push(dom);
            }
        }

        private addFieldInitCode_GameObjects(fields: CodeDOM[], prefabObj: ISceneGameObject, children: ISceneGameObject[]) {

            for (const obj of this._objectsToFieldList) {

                const objES = obj.getEditorSupport();

                if (prefabObj !== obj) {

                    const varname = formatToValidVarName(objES.getLabel());

                    const dom = new AssignPropertyCodeDOM(varname, "this");
                    dom.value(varname);

                    fields.push(dom);
                }
            }
        }

        private addFieldInitCode(body: CodeDOM[]) {

            const fields: CodeDOM[] = [];

            const prefabObj = this._scene.isPrefabSceneType() ? this._scene.getPrefabObject() : null;

            this.addFieldInitCode_GameObjects(fields, prefabObj, this._scene.getGameObjects());

            for (const obj of this._scene.getPlainObjects()) {

                const objES = obj.getEditorSupport();

                if (objES.isClassOrPublicScope()) {

                    const varname = formatToValidVarName(objES.getLabel());

                    const dom = new AssignPropertyCodeDOM(varname, "this");

                    dom.value(varname);

                    fields.push(dom);
                }
            }

            for (const list of this._scene.getObjectLists().getLists()) {

                if (ui.sceneobjects.isClassOrPublicScope(list.getScope())) {

                    const varname = formatToValidVarName(list.getLabel());

                    const dom = new AssignPropertyCodeDOM(varname, "this");

                    dom.value(varname);

                    fields.push(dom);
                }
            }

            if (fields.length > 0) {

                body.push(new RawCodeDOM(""));
                body.push(...fields);
            }
        }

        private addCreateObjectCodeOfNestedPrefab(obj: ISceneGameObject, createMethodDecl: MethodDeclCodeDOM, lazyStatements: CodeDOM[]) {

            const varname = SceneCodeDOMBuilder.getPrefabInstanceVarName(obj);

            const result = this.buildSetObjectProperties({
                obj,
                varname
            });

            lazyStatements.push(...result.lazyStatements);

            if (result.statements.length + result.lazyStatements.length > 0) {

                this.addVarNameToRequiredDeclareVarSet(varname);
            }

            createMethodDecl.getBody().push(...result.statements);

            this.addChildrenObjects({
                createMethodDecl,
                obj,
                lazyStatements
            });
        }

        private addVarNameToRequiredDeclareVarSet(varName: string) {

            const split = varName.split(".");

            if (split.length > 1) {

                this._requireDeclareVarSet.add(split[0]);
            }
        }

        private addCreateObjectCode(obj: ISceneGameObject, createMethodDecl: MethodDeclCodeDOM, lazyStatements: CodeDOM[]) {

            const objES = obj.getEditorSupport();

            let createObjectMethodCall: MethodCallCodeDOM;

            const objParent = objES.getObjectParent();
            let parentVarName: string;

            if (objParent) {

                const parentIsPrefabObject = this._scene.isPrefabSceneType()
                    && objParent === this._scene.getPrefabObject();

                parentVarName = parentIsPrefabObject ? "this"
                    : SceneCodeDOMBuilder.getPrefabInstanceVarName(objParent);
            }

            // the script nodes require using the varname of the parents
            // so we need to generate a var for it. This covers the cases of
            // nested prefabs which are parents of new nodes
            if (obj instanceof ui.sceneobjects.ScriptNode && parentVarName) {

                this.addVarNameToRequiredDeclareVarSet(parentVarName);
            }

            if (objES.isPrefabInstance()) {

                const clsName = objES.getPrefabName();

                const type = objES.getObjectType();

                const ext = ScenePlugin.getInstance().getGameObjectExtensionByObjectType(type);

                createObjectMethodCall = new code.MethodCallCodeDOM(clsName);
                createObjectMethodCall.setConstructor(true);

                const prefabSerializer = objES.getPrefabSerializer();

                if (prefabSerializer) {

                    const builder = ext.getCodeDOMBuilder();

                    builder.buildCreatePrefabInstanceCodeDOM({
                        obj,
                        methodCallDOM: createObjectMethodCall,
                        unit: this._unit,
                        sceneExpr: this._isPrefabScene ? "scene" : "this",
                        parentVarName,
                        prefabSerializer
                    });

                    const { importPath, asDefault } = code.getImportPath(this._sceneFile, objES.getPrefabFile());

                    this._unit.addImport(clsName, importPath, asDefault);

                } else {

                    throw new Error(`Cannot find prefab with id ${objES.getPrefabId()}.`);
                }

            } else {

                const builder = objES.getExtension().getCodeDOMBuilder();

                const factoryVarName = builder.getChainToFactory();
                const sceneVarName = this._scene.isPrefabSceneType() ? `scene` : `this`;
                createObjectMethodCall = builder.buildCreateObjectWithFactoryCodeDOM({
                    gameObjectFactoryExpr: `${sceneVarName}.${factoryVarName}`,
                    sceneExpr: sceneVarName,
                    parentVarName,
                    obj: obj,
                    unit: this._unit
                });

                // for example, in case it is adding a ScriptNode to a scene
                if (createObjectMethodCall.isConstructor()) {

                    const clsName = createObjectMethodCall.getMethodName();

                    const clsFile = this._fileNameMap.get(clsName);

                    if (clsFile) {

                        const { importPath, asDefault } = code.getImportPath(this._sceneFile, clsFile);

                        this._unit.addImport(clsName, importPath, asDefault);
                    }
                }

                const forcingType = this.getExplicitType(obj, this.getCompletePhaserType(obj));

                createObjectMethodCall.setExplicitType(forcingType);
            }

            const varname = formatToValidVarName(objES.getLabel());

            if (obj instanceof ui.sceneobjects.FXColorMatrix || obj instanceof ui.sceneobjects.FXGradient) {
                createObjectMethodCall.setDeclareReturnToVar(true);
                createObjectMethodCall.setReturnToVar(varname);
            }

            createMethodDecl.getBody().push(createObjectMethodCall);

            // script nodes are not added to the scene this way
            if (objES.isPrefabInstance() && objES.isDisplayObject()) {

                createObjectMethodCall.setDeclareReturnToVar(true);

                if (!objParent) {

                    const addToScene = new MethodCallCodeDOM("existing", "this.add");
                    addToScene.arg(varname);
                    createMethodDecl.getBody().push(addToScene);
                }
            }

            const result = this.buildSetObjectProperties({
                obj,
                varname
            });

            if (result.statements.length + result.lazyStatements.length > 0) {

                createObjectMethodCall.setDeclareReturnToVar(true);
            }

            if (objES.isMethodScope()) {
                // it is method scope... the user wants a variable!
                createObjectMethodCall.setDeclareReturnToVar(true);
            }

            lazyStatements.push(...result.lazyStatements);

            createMethodDecl.getBody().push(...result.statements);


            if (obj instanceof ui.sceneobjects.FXCircle && parentVarName) {

                const circle = obj as ui.sceneobjects.FXCircle;
                const sceneExpr = this._scene.isPrefabSceneType() ? "scene" : "this";
                const parent = parentVarName;
                const backgroundName = varname + "Background";
                const ringName = varname + "Ring";
                const syncName = varname + "CircleSync";
                const widthExpr = parent + ".width ?? " + parent + ".displayWidth ?? 128";
                const heightExpr = parent + ".height ?? " + parent + ".displayHeight ?? 128";
                const scale = Math.max(0.01, circle.scale);
                const thickness = Math.max(0.01, circle.thickness);
                const backgroundColor = "0x" + circle.backgroundColor.replace("#", "");
                const ringColor = "0x" + circle.color.replace("#", "");
                const syncCode = [
                    "const " + backgroundName + " = " + sceneExpr + ".add.rectangle(" + parent + ".x ?? 0, " + parent + ".y ?? 0, " + widthExpr + ", " + heightExpr + ", " + backgroundColor + ", 0.4);",
                    "const " + ringName + " = " + sceneExpr + ".add.graphics();",
                    "const " + syncName + " = () => {",
                    "    if (!" + parent + ".active) { " + backgroundName + ".setVisible(false); " + ringName + ".setVisible(false); return; }",
                    "    const width = Math.max(1, " + widthExpr + ");",
                    "    const height = Math.max(1, " + heightExpr + ");",
                    "    " + backgroundName + ".setPosition(" + parent + ".x ?? 0, " + parent + ".y ?? 0);",
                    "    " + backgroundName + ".setSize(width, height);",
                    "    " + backgroundName + ".setOrigin(" + parent + ".originX ?? 0.5, " + parent + ".originY ?? 0.5);",
                    "    " + backgroundName + ".setRotation(" + parent + ".rotation ?? 0);",
                    "    " + backgroundName + ".setScale(" + parent + ".scaleX ?? 1, " + parent + ".scaleY ?? 1);",
                    "    " + backgroundName + ".setAlpha((" + parent + ".alpha ?? 1) * 0.4);",
                    "    " + backgroundName + ".setVisible(" + parent + ".visible ?? true);",
                    "    " + backgroundName + ".setDepth((" + parent + ".depth ?? 0) - 0.001);",
                    "    " + backgroundName + ".setScrollFactor(" + parent + ".scrollFactorX ?? 1, " + parent + ".scrollFactorY ?? 1);",
                    "    " + ringName + ".clear();",
                    "    " + ringName + ".lineStyle(" + thickness + ", " + ringColor + ", 1);",
                    "    " + ringName + ".strokeEllipse(-(" + parent + ".originX ?? 0.5) * width + (width - width * " + scale + ") / 2, -(" + parent + ".originY ?? 0.5) * height + (height - height * " + scale + ") / 2, width * " + scale + ", height * " + scale + ");",
                    "    " + ringName + ".setPosition(" + parent + ".x ?? 0, " + parent + ".y ?? 0);",
                    "    " + ringName + ".setRotation(" + parent + ".rotation ?? 0);",
                    "    " + ringName + ".setScale(" + parent + ".scaleX ?? 1, " + parent + ".scaleY ?? 1);",
                    "    " + ringName + ".setAlpha(" + parent + ".alpha ?? 1);",
                    "    " + ringName + ".setVisible(" + parent + ".visible ?? true);",
                    "    " + ringName + ".setDepth((" + parent + ".depth ?? 0) + 0.001);",
                    "    " + ringName + ".setScrollFactor(" + parent + ".scrollFactorX ?? 1, " + parent + ".scrollFactorY ?? 1);",
                    "    if (" + parent + ".parentContainer) {",
                    "        const container = " + parent + ".parentContainer;",
                    "        if (" + backgroundName + ".parentContainer !== container) { container.addAt(" + backgroundName + ", Math.max(0, container.getIndex(" + parent + "))); }",
                    "        if (" + ringName + ".parentContainer !== container) { container.addAt(" + ringName + ", container.getIndex(" + parent + ") + 1); }",
                    "    }",
                    "};",
                    sceneExpr + ".events.on('update', " + syncName + ");",
                    syncName + "();",
                    backgroundName + ".once('destroy', () => " + sceneExpr + ".events.off('update', " + syncName + "));",
                    ringName + ".once('destroy', () => " + sceneExpr + ".events.off('update', " + syncName + "));",
                    parent + ".once('destroy', () => { " + sceneExpr + ".events.off('update', " + syncName + "); " + backgroundName + ".destroy(); " + ringName + ".destroy(); });"
                ].join("\n");

                createMethodDecl.getBody().push(new RawCodeDOM(syncCode));
            }

            if (obj instanceof ui.sceneobjects.FXGradient && parentVarName) {

                const sceneExpr = this._scene.isPrefabSceneType() ? "scene" : "this";
                const parent = parentVarName;
                const syncName = varname + "Sync";
                const syncCode = [
                    "const " + syncName + " = () => {",
                    "    if (!" + parent + ".active) { " + varname + ".setVisible(false); return; }",
                    "    " + varname + ".setPosition(" + parent + ".x ?? 0, " + parent + ".y ?? 0);",
                    "    " + varname + ".setSize(Math.max(1, " + parent + ".width ?? " + parent + ".displayWidth ?? 128), Math.max(1, " + parent + ".height ?? " + parent + ".displayHeight ?? 128));",
                    "    " + varname + ".setOrigin(" + parent + ".originX ?? 0.5, " + parent + ".originY ?? 0.5);",
                    "    " + varname + ".setRotation(" + parent + ".rotation ?? 0);",
                    "    " + varname + ".setScale(" + parent + ".scaleX ?? 1, " + parent + ".scaleY ?? 1);",
                    "    " + varname + ".setVisible(" + parent + ".visible ?? true);",
                    "    " + varname + ".setScrollFactor(" + parent + ".scrollFactorX ?? 1, " + parent + ".scrollFactorY ?? 1);",
                    "    " + varname + ".setDepth((" + parent + ".depth ?? 0) + 0.001);",
                    "};",
                    "if (" + parent + ".parentContainer && " + varname + ".parentContainer !== " + parent + ".parentContainer) { const container = " + parent + ".parentContainer; container.addAt(" + varname + ", Math.max(0, container.getIndex(" + parent + ") + 1)); }",
                    sceneExpr + ".events.on('update', " + syncName + ");",
                    syncName + "();",
                    varname + ".once('destroy', () => " + sceneExpr + ".events.off('update', " + syncName + "));",
                    parent + ".once('destroy', () => { " + sceneExpr + ".events.off('update', " + syncName + "); " + varname + ".destroy(); });"
                ].join("\n");

                createMethodDecl.getBody().push(new RawCodeDOM(syncCode));
            }

            // the script nodes are not added to the parent this way
            if (objParent && objES.isDisplayObject()) {

                createObjectMethodCall.setDeclareReturnToVar(true);

                const addToParentCall = new MethodCallCodeDOM("add", parentVarName);

                addToParentCall.arg(varname);

                createMethodDecl.getBody().push(addToParentCall);
            }

            // generate children
            {
                let declareVar: boolean;

                if (objES.isPrefabInstance()) {

                    declareVar = objES.getAppendedChildren().length > 0;

                } else {

                    declareVar = objES.getObjectChildren().length > 0;
                }

                this.addChildrenObjects({
                    createMethodDecl,
                    obj,
                    lazyStatements
                });

                if (this._requireDeclareVarSet.has(varname)) {

                    declareVar = true;
                }

                if (declareVar) {

                    createObjectMethodCall.setDeclareReturnToVar(true);
                }
            }

            // generate lists

            {
                const lists = objES.getScene().getObjectLists().getListsByObjectId(objES.getId());

                if (lists.length > 0) {

                    createObjectMethodCall.setDeclareReturnToVar(true);
                }
            }

            // set var flags

            if (objES.isClassOrPublicScope()) {

                createObjectMethodCall.setDeclareReturnToVar(true);

                this._objectsToFieldList.push(obj);
            }

            if (createObjectMethodCall.isDeclareReturnToVar()) {

                createObjectMethodCall.setReturnToVar(varname);
            }
        }

        getExplicitType(obj: ISceneGameObject, baseType: string) {

            const objES = obj.getEditorSupport();

            return objES.getActiveComponents()

                .map(comp => comp.getExplicitTypesForMethodFactory(baseType))

                .filter(type => type !== undefined)

                .join(" & ");
        }

        static getPrefabInstanceVarName(obj: ISceneGameObject): string {

            const objES = obj.getEditorSupport();

            if (objES.isScenePrefabObject()) {

                return "this";
            }

            const varName = formatToValidVarName(objES.getLabel());

            if (objES.isNestedPrefabInstance()) {

                const parent = this.findPrefabInstanceWhereTheGivenObjectIsDefined(obj);

                const parentVarName = this.getPrefabInstanceVarName(parent);

                return parentVarName + "." + varName;
            }

            return varName;
        }

        private static findPrefabInstanceWhereTheGivenObjectIsDefined(obj: ui.sceneobjects.ISceneGameObject): ui.sceneobjects.ISceneGameObject {

            const objES = obj.getEditorSupport();

            // get the prefab file of the object...

            const objPrefabFile = objES.getPrefabFile();

            // ...so find the parent that is an instance of this file

            const parent = objES.getObjectParent();

            return this.findPrefabInstanceOfFile(parent, objPrefabFile);
        }

        private static findPrefabInstanceOfFile(obj: ISceneGameObject, targetPrefaFile: io.FilePath): ISceneGameObject {

            const finder = ScenePlugin.getInstance().getSceneFinder();

            const objES = obj.getEditorSupport();

            // it is posible the object is a nested prefab,
            // but what we need is the original prefab file or a variant of it.
            const firstNonNestedPrefabId = finder.getFirstNonNestedPrefabId(objES.getPrefabId());

            // maybe it is a nested prefab of a built-in type,
            // in that case, the prefabId is undefined, and it should
            // keep searching in the parent
            if (firstNonNestedPrefabId) {

                // the original prefab file (or a variant of it)
                // this could be 'undefined' if the obj is a nested prefab
                // of a primitive type.
                const prefabFile = finder.getPrefabFile(firstNonNestedPrefabId);

                // ok, if both file are the same, I found it!
                if (prefabFile === targetPrefaFile) {

                    return obj;
                }

                // no, wait, it is a variant! That's ok too.
                if (finder.isPrefabVariant(prefabFile, targetPrefaFile)) {

                    return obj;
                }
            }

            // not found? keep searching with the parent...
            return this.findPrefabInstanceOfFile(objES.getObjectParent(), targetPrefaFile);
        }

        private buildSetObjectProperties(args: {
            obj: ISceneGameObject,
            varname: string
        }) {

            const obj = args.obj;
            const support = obj.getEditorSupport();
            const varname = args.varname;

            let prefabSerializer: json.Serializer = null;

            if (support.isPrefabInstance()) {

                prefabSerializer = support.getPrefabSerializer();
            }

            const statements: CodeDOM[] = [];
            const lazyStatements: CodeDOM[] = [];

            for (const comp of support.getActiveComponents()) {

                comp.buildSetObjectPropertiesCodeDOM({
                    statements,
                    lazyStatements,
                    objectVarName: varname,
                    prefabSerializer: prefabSerializer,
                    unit: this._unit,
                    sceneFile: this._sceneFile,
                    obj
                });
            }

            return { statements, lazyStatements };
        }

        private addChildrenObjects(args: {
            obj: ISceneGameObject,
            createMethodDecl: MethodDeclCodeDOM,
            lazyStatements: CodeDOM[]
        }) {

            const objES = args.obj.getEditorSupport();
            const body = args.createMethodDecl.getBody();
            const parentIsPrefab = objES.isPrefabInstance();

            for (const child of objES.getObjectChildren()) {

                const childES = child.getEditorSupport();

                if (childES.isMutableNestedPrefabInstance()) {

                    this.addCreateObjectCodeOfNestedPrefab(child, args.createMethodDecl, args.lazyStatements);

                } else if (!parentIsPrefab || childES.isPrefeabInstanceAppendedChild()) {

                    body.push(new RawCodeDOM(""));
                    body.push(new RawCodeDOM("// " + childES.getLabel()));

                    this.addCreateObjectCode(child, args.createMethodDecl, args.lazyStatements);
                }
            }
        }

        private buildSceneConstructorMethod(sceneKey: string) {

            const methodDecl = new MethodDeclCodeDOM("constructor");

            const superCall = new MethodCallCodeDOM("super", null);

            superCall.argLiteral(sceneKey);

            const body = methodDecl.getBody();

            body.push(superCall);

            body.push(new RawCodeDOM(""));
            body.push(new UserSectionCodeDOM("/* START-USER-CTR-CODE */", "/* END-USER-CTR-CODE */", "\n\t\t// Write your code here.\n\t\t"))

            return methodDecl;
        }

        private async buildPreloadMethod(methods: MemberDeclCodeDOM[]) {

            const settings = this._scene.getSettings();

            if (settings.preloadPackFiles.length === 0) {

                return;
            }

            const preloadDom = new MethodDeclCodeDOM(settings.preloadMethodName);
            preloadDom.setReturnType("void");

            preloadDom.getBody().push(new RawCodeDOM(""));

            const ctx = (this._isPrefabScene ? "scene" : "this");

            for (const fileName of settings.preloadPackFiles) {

                const call = new MethodCallCodeDOM("pack", ctx + ".load");

                const parts = fileName.split("/");

                const namePart = parts[parts.length - 1];

                const key = namePart.substring(0, namePart.length - 5);

                const file = colibri.ui.ide.FileUtils.getFileFromPath(fileName);

                let fileUrl = parts.slice(1).join("/");

                if (file) {

                    fileUrl = pack.core.AssetPackUtils.getUrlFromAssetFile(file.getParent(), file);
                }

                call.argLiteral(key);
                call.argLiteral(fileUrl);

                preloadDom.getBody().push(call);
            }

            methods.push(preloadDom);
        }
    }
}
