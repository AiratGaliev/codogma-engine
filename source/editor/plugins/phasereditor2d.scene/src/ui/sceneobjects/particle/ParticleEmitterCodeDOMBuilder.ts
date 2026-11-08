/// <reference path="../GameObjectCodeDOMBuilder.ts" />
/// <reference path="./ParticleEmitterComponent.ts" />
/// <reference path="./ParticleEmitterConfig.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class ParticleEmitterCodeDOMBuilder extends GameObjectCodeDOMBuilder {

        buildPrefabConstructorDeclarationCodeDOM(args: IBuildPrefabConstructorDeclarationCodeDOM): void {

            const ctr = args.ctrDeclCodeDOM;

            ctr.arg("x", "number", true);
            ctr.arg("y", "number", true);
            ctr.arg("texture", "string", true);
            ctr.arg("config", "Phaser.Types.GameObjects.Particles.ParticleEmitterConfig", true);
        }

        buildPrefabConstructorDeclarationSupperCallCodeDOM(
            args: IBuildPrefabConstructorDeclarationSupperCallCodeDOMArgs): void {

            const call = args.superMethodCallCodeDOM;

            this.buildPrefabConstructorDeclarationSupperCallCodeDOM_XYParameters(args);
            this.buildPrefabConstructorDeclarationSupperCallCodeDOM_TextureParameters(args, call);

            const obj = args.prefabObj as ParticleEmitter;

            const config = obj.getEditorSupport().buildConfigForCompiler();

            call.arg(`{...${code.stringifyJSON(config)}, ...config}`);
        }

        private buildPrefabConstructorDeclarationSupperCallCodeDOM_TextureParameters(
            args: IBuildPrefabConstructorDeclarationSupperCallCodeDOMArgs,
            call: code.MethodCallCodeDOM): void {

            const obj = args.prefabObj as ParticleEmitter;

            const objES = obj.getEditorSupport();

            if (objES.isLockedProperty(ParticleEmitterComponent.texture)) {

                call.arg("texture");

            } else {

                const texture = ParticleEmitterComponent.texture.getValue(obj);

                const key = texture || "__DEFAULT";

                call.arg("texture || " + code.CodeDOM.quote(key));
            }
        }

        buildCreatePrefabInstanceCodeDOM(args: IBuildPrefabConstructorCodeDOMArgs): void {

            const obj = args.obj as ParticleEmitter;
            const objES = obj.getEditorSupport();

            const call = args.methodCallDOM;

            call.arg(args.sceneExpr);

            this.buildCreatePrefabInstanceCodeDOM_XY_Arguments(args);

            if (objES.isUnlockedProperty(ParticleEmitterComponent.texture)) {

                this.addTextureArgsToObjectFactoryMethodCallDOM(call, obj);

            } else {

                call.argUndefined();
            }

            const config = objES.buildConfigForCompiler();

            call.arg(code.stringifyJSON(config));
        }

        buildCreateObjectWithFactoryCodeDOM(args: IBuildObjectFactoryCodeDOMArgs): code.MethodCallCodeDOM {

            const obj = args.obj as ParticleEmitter;

            const call = new code.MethodCallCodeDOM("particles", args.gameObjectFactoryExpr);

            call.argFloat(obj.x);
            call.argFloat(obj.y);

            this.addTextureArgsToObjectFactoryMethodCallDOM(call, obj);

            const config = obj.getEditorSupport().buildConfigForCompiler();

            call.arg(code.stringifyJSON(config));

            return call;
        }

        addTextureArgsToObjectFactoryMethodCallDOM(call: code.MethodCallCodeDOM, obj: ISceneGameObject) {

            const texture = ParticleEmitterComponent.texture.getValue(obj as any);

            // Match the prefab-constructor fallback and Phaser's default texture key.
            call.argLiteral(texture || "__DEFAULT");
        }
    }
}
