/// <reference path="../GameObjectEditorSupport.ts" />
/// <reference path="./ParticleEmitterComponent.ts" />
/// <reference path="./ParticleEmitterConfig.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class ParticleEmitterEditorSupport extends GameObjectEditorSupport<ParticleEmitter> {

        constructor(obj: ParticleEmitter, scene: Scene) {
            super(ParticleEmitterExtension.getInstance(), obj, scene);

            this.addComponent(
                new TransformComponent(obj as unknown as ITransformLikeObject),
                new VisibleComponent(obj as unknown as IVisibleLikeObject),
                new AlphaSingleComponent(obj as unknown as IAlphaSingleLikeObject),
                new ParticleEmitterComponent(obj)
            );
        }

        setInteractive(): void {

            this.getObject().setInteractive((hitArea, x, y, obj) => {

                const b = this.computeEmitterBounds();

                b.x -= obj.x;
                b.y -= obj.y;

                return b.contains(x, y);
            });
        }

        computeSize(): { width: number, height: number } {

            return { width: 128, height: 128 };
        }

        computeOrigin(): { originX: number, originY: number } {

            return { originX: 0.5, originY: 0.5 };
        }

        computeEmitterBounds(advance = 0): Phaser.Geom.Rectangle {

            const obj = this.getObject() as any;

            return obj.getBounds(0, advance);
        }

        getCellRenderer(): controls.viewers.ICellRenderer {

            return new controls.viewers.IconImageCellRenderer(resources.getIcon(resources.ICON_PLAY));
        }

        generateConfig() {

            const obj = this.getObject();

            let config: Record<string, any> = {
                texture: obj.configTexture,
                frame: obj.configFrame
            };

            for (const propSet of ParticleEmitterComponent.CONFIG_PROPS_SETS) {

                const propConfig = ParticleEmitterPropertySetToConfig(obj, propSet);

                if (propConfig !== undefined) {

                    config[propSet.name] = propConfig;
                }
            }

            for (const prop of ParticleEmitterComponent.SIMPLE_CONFIG_PROPS) {

                const value = prop.getValue(obj);

                if (value !== undefined && value !== prop.defValue) {

                    config[prop.codeName || prop.name] = value;
                }
            }

            return config;
        }

        buildConfigForCompiler(): Record<string, any> {

            const obj = this.getObject();

            let config: Record<string, any> = {};

            if (obj.configFrame && obj.configFrame.length > 0) {

                config.frame = obj.configFrame;
            }

            for (const propSet of ParticleEmitterComponent.CONFIG_PROPS_SETS) {

                if (this.isUnlockedProperty(propSet.props.type)) {

                    const propConfig = ParticleEmitterPropertySetToConfig(obj, propSet, true);

                    if (propConfig !== undefined) {

                        config[propSet.name] = propConfig;
                    }
                }
            }

            for (const prop of ParticleEmitterComponent.SIMPLE_CONFIG_PROPS) {

                if (this.isPrefabInstance()) {

                    if (this.isUnlockedProperty(prop)) {

                        const value = prop.getValue(obj);

                        if (value !== undefined) {

                            config[prop.codeName || prop.name] = value;
                        }
                    }

                } else {

                    const value = prop.getValue(obj);

                    if (value !== undefined && value !== null && value !== prop.defValue) {

                        config[prop.codeName || prop.name] = value;
                    }
                }

                // `follow` stores the variable name of an object, the generated code needs a reference to it

                if (prop === ParticleEmitterComponent.follow) {

                    const value = prop.getValue(obj);

                    if (value) {

                        config["follow"] = `@code:${value}`;
                    }
                }
            }

            return config;
        }

        computeContentHash(): string {

            let hash = super.computeContentHash();

            hash += this.computeContentHashWithComponent(this.getObject(), ParticleEmitterComponent);

            return hash;
        }
    }
}
