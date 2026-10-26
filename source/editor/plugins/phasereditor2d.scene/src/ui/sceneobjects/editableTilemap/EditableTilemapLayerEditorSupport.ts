namespace phasereditor2d.scene.ui.sceneobjects {

    export interface IEditableTilemapLayerData extends core.json.IObjectData {

        tilemapId: string;
        layerName: string;
    }

    export class EditableTilemapLayerEditorSupport extends GameObjectEditorSupport<EditableTilemapLayer> {

        constructor(obj: EditableTilemapLayer, scene: Scene) {
            super(EditableTilemapLayerExtension.getInstance(), obj, scene);

            this.addComponent(

                new TransformComponent(obj as unknown as ITransformLikeObject),
                new VisibleComponent(obj as unknown as IVisibleLikeObject)
            );

            this.setLabel(obj.getLayerName());

            // the layer is usually assigned to a local variable of the create method,
            // like in `const mainLayer = levelMap.createLayer("mainLayer", ["tileset"], 0, 0);`

            this.setScope(ObjectScope.METHOD);
        }

        isUnlockedProperty(property: IProperty<any>) {

            if (property === TransformComponent.angle) {

                return false;
            }

            return super.isUnlockedProperty(property);
        }

        computeContentHash() {

            const obj = this.getObject();

            return obj.getTilemap().getEditorSupport().getId() + "-" + obj.getLayerName();
        }

        setInteractive(): void {

            const obj = this.getObject();

            obj.setInteractive(
                new Phaser.Geom.Rectangle(0, 0, obj.width, obj.height),
                Phaser.Geom.Rectangle.Contains);
        }

        getCellRenderer(): colibri.ui.controls.viewers.ICellRenderer {

            return new ObjectCellRenderer();
        }

        writeJSON(data: IEditableTilemapLayerData) {

            super.writeJSON(data);

            const layer = this.getObject();

            data.tilemapId = layer.getTilemap().getEditorSupport().getId();
            data.layerName = layer.getLayerName();
        }

        async buildDependencyHash(args: IBuildDependencyHashArgs) {

            await this.getObject().getTilemap().getEditorSupport().buildDependencyHash(args);
        }
    }
}
