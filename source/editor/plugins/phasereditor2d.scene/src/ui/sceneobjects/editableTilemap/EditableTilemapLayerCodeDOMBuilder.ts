namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    export class EditableTilemapLayerCodeDOMBuilder extends GameObjectCodeDOMBuilder {

        buildCreateObjectWithFactoryCodeDOM(args: IBuildObjectFactoryCodeDOMArgs): core.code.MethodCallCodeDOM {

            const layer = args.obj as EditableTilemapLayer;

            const tilemap = layer.getTilemap();

            const tilemapVarName = code.formatToValidVarName(tilemap.getEditorSupport().getLabel());

            const call = new code.MethodCallCodeDOM("createLayer", tilemapVarName);

            call.argLiteral(layer.getLayerName());

            const tilesetArray = "[" + tilemap.getTilesets()
                .map(tileset => code.CodeDOM.quote(tileset.name)).join(",") + "]";

            call.arg(tilesetArray);

            call.argInt(layer.x);
            call.argInt(layer.y);

            call.setNonNullAssertion(true);

            return call;
        }

        buildCreatePrefabInstanceCodeDOM(args: IBuildPrefabConstructorCodeDOMArgs): void {
            throw new Error("Not supported");
        }

        buildPrefabConstructorDeclarationCodeDOM(args: IBuildPrefabConstructorDeclarationCodeDOM): void {
            throw new Error("Not supported");
        }

        buildPrefabConstructorDeclarationSupperCallCodeDOM(args: IBuildPrefabConstructorDeclarationSupperCallCodeDOMArgs): void {
            throw new Error("Not supported");
        }
    }
}
