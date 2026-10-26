/// <reference path="../GameObjectCodeDOMBuilder.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class ParticleEmitterCodeDOMBuilder extends GameObjectCodeDOMBuilder {

        constructor() {
            super();
        }

        private isUnlockedConfig(obj: ParticleEmitter): boolean {

            const objES = obj.getEditorSupport();

            for (const prop of ParticleEmitterComponent.allProperties) {

                if (!objES.isUnlockedProperty(prop)) {

                    return false;
                }
            }

            return true;
        }

        private addTextureArg(call: code.MethodCallCodeDOM, texture: string) {

            if (texture) {

                call.argLiteral(texture);

            } else {

                call.arg("undefined");
            }
        }

        buildCreateObjectWithFactoryCodeDOM(args: IBuildObjectFactoryCodeDOMArgs): code.MethodCallCodeDOM {

            const obj = args.obj as ParticleEmitter;

            const call = new code.MethodCallCodeDOM("particles", args.gameObjectFactoryExpr);

            call.argFloat(obj.x);
            call.argFloat(obj.y);

            this.addTextureArg(call, obj.editorTexture);

            const config = ParticleEmitterComponent.buildConfig(obj);

            if (Object.keys(config).length > 0) {

                call.arg(JSON.stringify(config));
            }

            return call;
        }

        buildCreatePrefabInstanceCodeDOM(args: IBuildPrefabConstructorCodeDOMArgs) {

            const obj = args.obj as ParticleEmitter;
            const objES = obj.getEditorSupport();

            const call = args.methodCallDOM;

            call.arg(args.sceneExpr);

            this.buildCreatePrefabInstanceCodeDOM_XY_Arguments(args);

            if (objES.isUnlockedProperty(ParticleEmitterComponent.texture)) {

                this.addTextureArg(call, obj.editorTexture);

            } else {

                call.arg("undefined");
            }

            if (this.isUnlockedConfig(obj)) {

                const config = ParticleEmitterComponent.buildConfig(obj);

                if (Object.keys(config).length > 0) {

                    call.arg(JSON.stringify(config));

                } else {

                    call.arg("undefined");
                }

            } else {

                call.arg("undefined");
            }
        }

        buildPrefabConstructorDeclarationCodeDOM(args: IBuildPrefabConstructorDeclarationCodeDOM): void {

            const ctr = args.ctrDeclCodeDOM;

            ctr.arg("x", "number", true);
            ctr.arg("y", "number", true);
            ctr.arg("texture", "string", true);
            ctr.arg("config", "object", true);
        }

        buildPrefabConstructorDeclarationSupperCallCodeDOM(
            args: IBuildPrefabConstructorDeclarationSupperCallCodeDOMArgs): void {

            const obj = args.prefabObj as ParticleEmitter;
            const objES = obj.getEditorSupport();

            const call = args.superMethodCallCodeDOM;

            this.buildPrefabConstructorDeclarationSupperCallCodeDOM_XYParameters(args);

            if (objES.isLockedProperty(ParticleEmitterComponent.texture)) {

                call.arg("texture");

            } else {

                call.arg(`texture || ${code.CodeDOM.quote(obj.editorTexture || "__DEFAULT")}`);
            }

            if (this.isUnlockedConfig(obj)) {

                const config = ParticleEmitterComponent.buildConfig(obj);

                call.arg(`config ?? ${JSON.stringify(config)}`);

            } else {

                call.arg("config");
            }
        }
    }
}
