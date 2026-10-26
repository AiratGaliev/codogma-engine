/// <reference path="../GameObjectCodeDOMBuilder.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class VideoCodeDOMBuilder extends GameObjectCodeDOMBuilder {

        constructor() {
            super();
        }

        buildCreateObjectWithFactoryCodeDOM(args: IBuildObjectFactoryCodeDOMArgs): code.MethodCallCodeDOM {

            const obj = args.obj as Video;

            const call = new code.MethodCallCodeDOM("video", args.gameObjectFactoryExpr);

            call.argFloat(obj.x);
            call.argFloat(obj.y);

            const url = obj.url;

            if (url && !VideoComponent.isURL(url)) {

                // the video was loaded with the loader, so it has a key in the video cache

                call.argLiteral(url);
            }

            return call;
        }

        buildCreatePrefabInstanceCodeDOM(args: IBuildPrefabConstructorCodeDOMArgs) {

            const call = args.methodCallDOM;

            call.arg(args.sceneExpr);

            this.buildCreatePrefabInstanceCodeDOM_XY_Arguments(args);
        }

        buildPrefabConstructorDeclarationCodeDOM(args: IBuildPrefabConstructorDeclarationCodeDOM): void {

            const ctr = args.ctrDeclCodeDOM;

            ctr.arg("x", "number", true);
            ctr.arg("y", "number", true);
        }

        buildPrefabConstructorDeclarationSupperCallCodeDOM(
            args: IBuildPrefabConstructorDeclarationSupperCallCodeDOMArgs): void {

            this.buildPrefabConstructorDeclarationSupperCallCodeDOM_XYParameters(args);
        }
    }
}
