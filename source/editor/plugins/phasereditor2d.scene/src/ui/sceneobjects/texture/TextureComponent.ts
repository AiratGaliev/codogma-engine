/// <reference path="../Component.ts"/>

namespace phasereditor2d.scene.ui.sceneobjects {

    import json = core.json;

    export interface ITextureLikeObject extends ISceneGameObject {

        setTexture(key: string, frame?: string | number): void;
    }

    export interface ITextureRect {
        x: number;
        y: number;
        width: number;
        height: number;
    }

    export interface ITextureTrim extends ITextureRect {
        actualWidth: number;
        actualHeight: number;
    }

    export interface ITextureKeys {

        key?: string;
        frame?: string | number;
        crop?: ITextureRect;
        trim?: ITextureTrim;
        sourceSize?: phasereditor2d.pack.core.ISpriteAssetSize;
        collisionShapes?: phasereditor2d.pack.core.ISpriteAssetCollisionShape[];
    }

    export interface ITextureData
        extends json.IObjectData {

        texture: ITextureKeys;
    }

    export class TextureComponent extends Component<ITextureLikeObject> {

        static texture: IProperty<ITextureLikeObject> = {
            name: "texture",
            defValue: {},
            getValue: obj => {

                const textureComponent = obj.getEditorSupport().getComponent(TextureComponent) as TextureComponent;

                return textureComponent.getTextureKeys();
            },
            setValue: (obj, value) => {

                const textureComponent = obj.getEditorSupport().getComponent(TextureComponent) as TextureComponent;

                textureComponent.setTextureKeys(value);
            }
        };

        private _textureKeys: ITextureKeys;

        constructor(obj: ITextureLikeObject) {
            super(obj, [
                TextureComponent.texture
            ]);

            this._textureKeys = {};
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const obj = this.getObject();
            const support = obj.getEditorSupport();
            const prop = TextureComponent.texture;
            const keys = prop.getValue(obj) as ITextureKeys;

            if (support.isNestedPrefabInstance()
                && support.isUnlockedProperty(prop)) {

                const dom = new core.code.MethodCallCodeDOM("setTexture", args.objectVarName);
                dom.argLiteral(keys.key);
                dom.argStringOrFloat(keys.frame);
                args.statements.push(dom);
            }

            if (keys.trim) {

                const cloneFrame = new core.code.MethodCallCodeDOM("setFrame", args.objectVarName);
                cloneFrame.arg(`${args.objectVarName}.frame.clone()`);
                cloneFrame.argBool(true);
                cloneFrame.argBool(false);
                args.statements.push(cloneFrame);

                const trimCall = new core.code.MethodCallCodeDOM("setTrim", `${args.objectVarName}.frame`);
                trimCall.argFloat(keys.trim.actualWidth);
                trimCall.argFloat(keys.trim.actualHeight);
                trimCall.argFloat(keys.trim.x);
                trimCall.argFloat(keys.trim.y);
                trimCall.argFloat(keys.trim.width);
                trimCall.argFloat(keys.trim.height);
                args.statements.push(trimCall);
            }

            if (keys.crop) {

                const cropCall = new core.code.MethodCallCodeDOM("setCrop", args.objectVarName);
                cropCall.argFloat(keys.crop.x);
                cropCall.argFloat(keys.crop.y);
                cropCall.argFloat(keys.crop.width);
                cropCall.argFloat(keys.crop.height);
                args.statements.push(cropCall);
            }
        }

        getTextureKeys(): ITextureKeys {
            return this._textureKeys;
        }

        setTextureKeys(keys: ITextureKeys) {

            const previousKeys = this._textureKeys || {};
            keys = keys || {};
            this._textureKeys = keys;

            if (this._textureKeys.frame === null) {
                this._textureKeys.frame = undefined;
            }

            const obj = this.getObject() as ITextureLikeObject & IOriginLikeObject & {
                setCrop?: (x?: number, y?: number, width?: number, height?: number) => void;
                frame?: any;
            };

            const ox = obj.originX;
            const oy = obj.originY;

            obj.setTexture(keys.key || null, keys.frame);

            const objES = obj.getEditorSupport();

            if (objES.hasComponent(OriginComponent)) {
                obj.setOrigin(ox, oy);
            }

            if (keys.trim) {

                const frame = obj.frame;

                if (!frame || typeof frame.clone !== "function"
                    || typeof frame.setTrim !== "function" || typeof (obj as any).setFrame !== "function") {
                    throw new Error("The current Phaser GameObject cannot apply isolated trim metadata.");
                }

                // Texture Manager frames are shared by every GameObject using the same key/frame.
                // Apply trim to a per-object clone to avoid changing unrelated sprites.
                const trimmedFrame = frame.clone();

                trimmedFrame.setTrim(
                    keys.trim.actualWidth,
                    keys.trim.actualHeight,
                    keys.trim.x,
                    keys.trim.y,
                    keys.trim.width,
                    keys.trim.height
                );

                (obj as any).setFrame(trimmedFrame, true, false);
            }

            if (keys.crop) {
                if (typeof obj.setCrop !== "function") {
                    throw new Error("The current Phaser GameObject does not support crop metadata.");
                }

                obj.setCrop(keys.crop.x, keys.crop.y, keys.crop.width, keys.crop.height);
            } else if (previousKeys.crop && typeof obj.setCrop === "function") {
                obj.setCrop();
            }

            objES.onUpdateAfterSetTexture();

        }

        removeTexture() {

            this.setTextureKeys({});
        }
    }
}