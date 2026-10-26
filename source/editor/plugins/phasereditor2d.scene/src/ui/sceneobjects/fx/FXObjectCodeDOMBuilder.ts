namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export abstract class FXObjectCodeDOMBuilder<T extends Phaser.Filters.Controller> extends GameObjectCodeDOMBuilder {

        private _fxName: string;

        constructor(fxName: string) {
            super();

            this._fxName = fxName;
        }

        abstract buildAddFXMethodArgs(call: code.MethodCallCodeDOM, fx: T, args: IBuildObjectFactoryCodeDOMArgs): void;

        buildCreateObjectWithFactoryCodeDOM(args: IBuildObjectFactoryCodeDOMArgs): core.code.MethodCallCodeDOM {

            const obj = args.obj as FXObject;

            // In Phaser 4, the FX filters are managed by the FilterList of the
            // parent object: `gameObject.enableFilters().filters.internal/external`.
            const pipeline = obj.isPreFX() ? "internal" : "external";

            const varname = `${args.parentVarName}.enableFilters().filters.${pipeline}`;

            const call = new code.MethodCallCodeDOM("add" + this._fxName, varname);
            call.setOptionalContext(true);

            const fx = obj.getPhaserFX() as T;

            this.buildAddFXMethodArgs(call, fx, args);

            return call;
        }

        buildCreatePrefabInstanceCodeDOM(args: IBuildPrefabConstructorCodeDOMArgs): void {

            throw new Error("FX prefab not supported.");
        }

        buildPrefabConstructorDeclarationCodeDOM(args: IBuildPrefabConstructorDeclarationCodeDOM): void {

            throw new Error("FX prefab not supported.");
        }

        buildPrefabConstructorDeclarationSupperCallCodeDOM(args: IBuildPrefabConstructorDeclarationSupperCallCodeDOMArgs): void {

            throw new Error("FX prefab not supported.");
        }
    }
}