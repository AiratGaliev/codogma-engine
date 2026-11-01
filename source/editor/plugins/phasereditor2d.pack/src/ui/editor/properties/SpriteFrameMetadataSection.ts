/// <reference path="./BaseSection.ts" />
/// <reference path="../../../core/SpriteAssetMetadata.ts" />

namespace phasereditor2d.pack.ui.editor.properties {

    import controls = colibri.ui.controls;

    export class SpriteFrameMetadataSection extends BaseSection {

        private _frameSelect: HTMLSelectElement;
        private _status: HTMLDivElement;

        constructor(page: controls.properties.PropertyPage) {
            super(page, "phasereditor2d.pack.ui.editor.properties.SpriteFrameMetadataSection", "Sprite Frame Metadata");
        }

        canEdit(obj: any, n: number): boolean {

            return n === 1 && obj instanceof core.ImageFrameContainerAssetPackItem;
        }

        canEditNumber(n: number): boolean {

            return n === 1;
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElement(parent, 2);
            comp.style.gridTemplateColumns = "auto 1fr";

            this.createLabel(comp, "Frame");
            this._frameSelect = document.createElement("select");
            this._frameSelect.style.gridColumn = "2";
            comp.appendChild(this._frameSelect);
            this._frameSelect.addEventListener("change", () => this.updateWithSelection());

            this.createLabel(comp, "Pivot X (0–1)");
            const pivotX = this.createNumberInput(comp, "0.01", 0, 1);
            this.createLabel(comp, "Pivot Y (0–1)");
            const pivotY = this.createNumberInput(comp, "0.01", 0, 1);

            this.createLabel(comp, "Trim X");
            const trimX = this.createNumberInput(comp, "1", 0);
            this.createLabel(comp, "Trim Y");
            const trimY = this.createNumberInput(comp, "1", 0);
            this.createLabel(comp, "Trim Width");
            const trimWidth = this.createNumberInput(comp, "1", 1);
            this.createLabel(comp, "Trim Height");
            const trimHeight = this.createNumberInput(comp, "1", 1);

            this.createLabel(comp, "Crop X");
            const cropX = this.createNumberInput(comp, "1", 0);
            this.createLabel(comp, "Crop Y");
            const cropY = this.createNumberInput(comp, "1", 0);
            this.createLabel(comp, "Crop Width");
            const cropWidth = this.createNumberInput(comp, "1", 1);
            this.createLabel(comp, "Crop Height");
            const cropHeight = this.createNumberInput(comp, "1", 1);

            this.createLabel(comp, "Collision Shapes");
            const collisionShapes = document.createElement("textarea");
            collisionShapes.rows = 7;
            collisionShapes.spellcheck = false;
            collisionShapes.style.gridColumn = "2";
            collisionShapes.style.width = "100%";
            collisionShapes.style.fontFamily = "monospace";
            collisionShapes.addEventListener("change", () => this.saveCollisionShapes(collisionShapes.value));
            comp.appendChild(collisionShapes);

            this._status = document.createElement("div");
            this._status.style.gridColumn = "1 / span 2";
            this._status.style.whiteSpace = "normal";
            comp.appendChild(this._status);

            this.addUpdater(() => {
                const item = this.getSelectedItem();

                if (!item) {
                    this._frameSelect.replaceChildren();
                    return;
                }

                const descriptors = core.SpriteAssetMetadata.describeFrames(item.getFrames());
                const currentKey = this._frameSelect.value;

                this._frameSelect.replaceChildren();

                for (const descriptor of descriptors) {
                    const option = document.createElement("option");
                    option.value = descriptor.key;
                    option.textContent = descriptor.key;
                    this._frameSelect.appendChild(option);
                }

                this._frameSelect.value = descriptors.some(item => item.key === currentKey)
                    ? currentKey : (descriptors[0] ? descriptors[0].key : "");

                const state = this.getFrameState(item);

                if (!state) {
                    for (const input of [pivotX, pivotY, trimX, trimY, trimWidth, trimHeight,
                        cropX, cropY, cropWidth, cropHeight, collisionShapes]) {
                        input.disabled = true;
                    }
                    this._status.textContent = "No decoded image frames are available.";
                    return;
                }

                for (const input of [pivotX, pivotY, trimX, trimY, trimWidth, trimHeight,
                    cropX, cropY, cropWidth, cropHeight, collisionShapes]) {
                    input.disabled = false;
                }

                const frame = state.frame;
                const sourceRect = state.descriptor.sourceRect;
                const trim = frame.trim || state.descriptor.trimRect || this.fullRect(sourceRect);
                const crop = frame.crop || this.fullRect(sourceRect);
                const pivot = frame.pivot || { x: 0.5, y: 0.5 };

                pivotX.value = String(pivot.x);
                pivotY.value = String(pivot.y);
                trimX.value = String(trim.x);
                trimY.value = String(trim.y);
                trimWidth.value = String(trim.width);
                trimHeight.value = String(trim.height);
                cropX.value = String(crop.x);
                cropY.value = String(crop.y);
                cropWidth.value = String(crop.width);
                cropHeight.value = String(crop.height);
                collisionShapes.value = JSON.stringify(frame.collisionShapes || [], null, 2);

                const conflicts = state.metadata.conflicts || [];
                const orphaned = state.metadata.orphanedFrames || [];

                this._status.textContent = conflicts.length > 0
                    ? `Reimport conflicts: ${conflicts.length}. ${conflicts
                        .map((conflict: any) => `${conflict.frameKey}: ${conflict.message}`)
                        .join(" ")} Previous custom frame data remains in orphaned metadata (${orphaned.length} frame(s)).`
                    : "Trim/crop and collision coordinates use frame-local pixels. Pivot uses normalized coordinates. Circle x/y represent its center.";

                if (frame.trim) {
                    this._status.textContent += " Phaser NineSlice does not support trimmed textures; use Image/Sprite for trimmed frames.";
                }

                if (frame.crop) {
                    this._status.textContent += " Phaser NineSlice and TileSprite do not expose setCrop(); use Image/Sprite for cropped frames.";
                }

                if (frame.collisionShapes && frame.collisionShapes.length > 0) {
                    const arcadeCompatible = frame.collisionShapes.length === 1
                        && (frame.collisionShapes[0].type === "rectangle"
                            || frame.collisionShapes[0].type === "rect"
                            || frame.collisionShapes[0].type === "circle");

                    this._status.textContent += arcadeCompatible
                        ? " One rectangle/circle is applied when an Arcade Body is enabled."
                        : " Arcade Physics applies only one rectangle or circle; polygon and compound shapes remain metadata until a compatible physics adapter is selected.";
                }
            });

            this.bindNumberInput(pivotX, "pivot", "x");
            this.bindNumberInput(pivotY, "pivot", "y");
            this.bindNumberInput(trimX, "trim", "x");
            this.bindNumberInput(trimY, "trim", "y");
            this.bindNumberInput(trimWidth, "trim", "width");
            this.bindNumberInput(trimHeight, "trim", "height");
            this.bindNumberInput(cropX, "crop", "x");
            this.bindNumberInput(cropY, "crop", "y");
            this.bindNumberInput(cropWidth, "crop", "width");
            this.bindNumberInput(cropHeight, "crop", "height");
        }

        private createNumberInput(comp: HTMLElement, step: string, min: number, max?: number): HTMLInputElement {

            const input = document.createElement("input");
            input.type = "number";
            input.step = step;
            input.min = String(min);

            if (max !== undefined) {
                input.max = String(max);
            }

            input.style.width = "100%";
            comp.appendChild(input);

            return input;
        }

        private bindNumberInput(input: HTMLInputElement, group: "pivot" | "trim" | "crop", axis: string) {

            input.addEventListener("change", () => {
                const value = Number(input.value);

                if (!Number.isFinite(value)) {
                    this.updateWithSelection();
                    return;
                }

                const item = this.getSelectedItem();
                const state = item && this.getFrameState(item);

                if (!item || !state) {
                    return;
                }

                const next = JSON.parse(JSON.stringify(state.metadata));
                const frame = next.frames[state.key];

                if (group === "pivot") {
                    frame.pivot = frame.pivot || { x: 0.5, y: 0.5 };
                    frame.pivot[axis] = value;

                    if (frame.pivot.x < 0 || frame.pivot.x > 1 || frame.pivot.y < 0 || frame.pivot.y > 1) {
                        this._status.textContent = "Pivot coordinates must be between 0 and 1.";
                        this.updateWithSelection();
                        return;
                    }
                } else {
                    const sourceRect = state.descriptor.sourceRect;
                    const trimBounds = state.descriptor.sourceSize || {
                        width: sourceRect.width,
                        height: sourceRect.height
                    };
                    const rect = frame[group] || (group === "trim"
                        ? state.descriptor.trimRect
                        : this.fullRect(sourceRect));
                    rect[axis] = value;

                    if (rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
                        || rect.x + rect.width > (group === "trim" ? trimBounds.width : sourceRect.width)
                        || rect.y + rect.height > (group === "trim" ? trimBounds.height : sourceRect.height)) {
                        this._status.textContent = `${group} rectangle must stay inside the frame and have positive dimensions.`;
                        this.updateWithSelection();
                        return;
                    }

                    frame[group] = rect;
                }

                this.changeItemField(core.SpriteAssetMetadata.DATA_KEY, next, true);
            });
        }

        private saveCollisionShapes(raw: string) {

            const item = this.getSelectedItem();
            const state = item && this.getFrameState(item);

            if (!item || !state) {
                return;
            }

            let shapes: any;

            try {
                shapes = JSON.parse(raw);
            } catch (error) {
                this._status.textContent = `Invalid collision JSON: ${error instanceof Error ? error.message : String(error)}`;
                return;
            }

            const sourceSize = state.descriptor.sourceSize || {
                width: state.descriptor.sourceRect.width,
                height: state.descriptor.sourceRect.height
            };
            const validationError = core.SpriteAssetMetadata.validateCollisionShapes(
                shapes,
                sourceSize.width,
                sourceSize.height
            );

            if (validationError) {
                this._status.textContent = validationError;
                return;
            }

            const next = JSON.parse(JSON.stringify(state.metadata));
            next.frames[state.key].collisionShapes = shapes;
            this.changeItemField(core.SpriteAssetMetadata.DATA_KEY, next, true);
        }

        private getSelectedItem(): core.ImageFrameContainerAssetPackItem | null {

            const item = this.getSelectionFirstElement();

            return item instanceof core.ImageFrameContainerAssetPackItem ? item : null;
        }

        private getFrameState(item: core.ImageFrameContainerAssetPackItem) {

            const descriptors = core.SpriteAssetMetadata.describeFrames(item.getFrames());
            const key = this._frameSelect && this._frameSelect.value
                ? this._frameSelect.value
                : (descriptors[0] && descriptors[0].key);

            if (!key) {
                return null;
            }

            const descriptor = descriptors.find(frame => frame.key === key);

            if (!descriptor) {
                return null;
            }

            const data = item.getData();
            const source = typeof data.url === "string" ? item.getFileFromAssetUrl(data.url) : null;
            const metadata = core.SpriteAssetMetadata.ensure(data, source, descriptors);

            return {
                metadata,
                key,
                descriptor,
                frame: metadata.frames[key]
            };
        }

        private fullRect(rect: core.ISpriteAssetRect) {

            return { x: 0, y: 0, width: rect.width, height: rect.height };
        }
    }
}
