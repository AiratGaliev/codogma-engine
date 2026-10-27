namespace phasereditor2d.pack.ui.properties {

    import controls = colibri.ui.controls;

    export class SpritesheetPreviewSection extends colibri.ui.ide.properties.BaseImagePreviewSection<any> {

        private _imgControl: controls.ImageControl;

        constructor(page: controls.properties.PropertyPage,
            id = "phasereditor2d.pack.ui.properties.SpritesheetPreviewSection", fillSpace = true) {

            super(page, id, "Spritesheet Preview", fillSpace);
        }

        protected async getSelectedImage(): Promise<controls.IImage> {

            const obj = await this.getSelectedSpritesheet();

            if (!obj) {

                return null as any;
            }

            const img = core.AssetPackUtils.getImageFromPackUrl(obj.getPack(), obj.getData().url);

            return img;
        }

        createForm(parent: HTMLDivElement) {

            super.createForm(parent);

            const control = this.getImageControl();

            control.setZoomMode(controls.ZoomMode.MANUAL);

            control.disableSmoothRendering();

            this.registerScrollListeners();
            this.registerSelectionListeners();
            this.registerRepaintCallback();

            this._imgControl = control;
        }

        protected getImageControl(): controls.ImageControl {

            return this._imgControl;
        }

        private async getSelectedFrame(): Promise<core.AssetPackImageFrame> {

            const spritesheet = await this.getSelectedSpritesheet();

            if (spritesheet) {

                const config = spritesheet.getFrameConfig();
                const control = this.getImageControl();
                const img = control.getImage();
                const imgW = img.getWidth();

                const cols = this.computeNumberOfColumns(imgW, config.frameWidth, config.margin, config.spacing);

                const x = control.getCursorX() - control.getImageScrollX();
                const y = control.getCursorY() - control.getImageScrollY();

                const { col, row } = this.findColumnRow(
                    x, y, config.frameWidth, config.frameHeight, config.margin, config.spacing);

                const cursorIndex = cols * row + col;

                const frame = spritesheet.getFrames().find(f => Number(f.getName()) === cursorIndex);

                return frame;
            }

            return null as any;
        }

        private registerSelectionListeners() {

            const control = this.getImageControl();
            const canvas = control.getCanvas() as HTMLCanvasElement & { draggable: boolean };

            canvas.draggable = true;

            canvas.addEventListener("dragstart", async (e) => {

                if (control.isInScrollMode()) {

                    e.preventDefault();

                    return;
                }

                const paintItemUnderCursor = await this.getSelectedFrame();

                if (paintItemUnderCursor) {

                    let dragObjects = [paintItemUnderCursor];

                    controls.Controls.setDragEventImage(e, (ctx, w, h) => {

                        for (const obj of dragObjects) {

                            const renderer = new ui.viewers.AssetPackCellRendererProvider("grid")
                                .getCellRenderer(obj);

                            renderer.renderCell(new controls.viewers.RenderCellArgs(ctx, 0, 0, w, h, obj, null, true));
                        }
                    });

                    const label = paintItemUnderCursor.getName().toString();

                    e.dataTransfer.setData("plain/text", label);

                    controls.Controls.setApplicationDragData(dragObjects);

                } else {

                    e.preventDefault();
                }
            });
        }

        private registerRepaintCallback() {

            const control = this.getImageControl();

            control.setRepaintCallback(async () => {

                if (this.getSelection().length !== 1) {

                    return;
                }

                const zoom = control.getZoom();

                // prepare graphics context
                const ctx = control.getContext();

                ctx.save();

                ctx.translate(0.5, 0.5);
                ctx.lineWidth = 1;
                ctx.strokeStyle = "white";

                // paint image border
                const img = control.getImage();
                const imgX = control.getImageScrollX();
                const imgY = control.getImageScrollY();
                const imgW = img.getWidth();
                const imgH = img.getHeight();

                ctx.strokeStyle = "black";
                ctx.strokeRect(imgX - 1, imgY - 1, imgW * zoom + 2, imgH * zoom + 2);

                ctx.strokeStyle = "white";
                ctx.strokeRect(imgX, imgY, imgW * zoom, imgH * zoom);

                // paint cursor cell
                const x = control.getCursorX();
                const y = control.getCursorY();

                const asset = await this.getSelectedSpritesheet();

                if (x !== undefined && !control.isInScrollMode() && asset) {

                    const config = asset.getFrameConfig();

                    const dx = x - imgX;
                    const dy = y - imgY;
                    const margin = config.margin;
                    const spacing = config.spacing;

                    if (dx >= 0 && dy >= 0 && dx < imgW * zoom && dy < imgH * zoom) {

                        const { col, row } = this.findColumnRow(
                            dx, dy, config.frameWidth, config.frameHeight, margin, config.spacing);

                        const cellWidth = config.frameWidth + spacing;
                        const cellHeight = config.frameHeight + spacing;

                        const cellX = config.margin + col * cellWidth;
                        const cellY = config.margin + row * cellHeight;

                        ctx.strokeStyle = "black";
                        ctx.strokeRect(imgX + cellX * zoom - 1, imgY + cellY * zoom - 1,
                            config.frameWidth * zoom + 2, config.frameHeight * zoom + 2);

                        ctx.strokeStyle = "white";
                        ctx.strokeRect(imgX + cellX * zoom, imgY + cellY * zoom,
                            config.frameWidth * zoom, config.frameHeight * zoom);
                    }
                }

                ctx.restore();
            });
        }

        private computeNumberOfColumns(imageWidth: number, cellWidth: number, margin: number, spacing: number) {

            const availableWidth = imageWidth - 2 * margin;
            const totalCellWidth = cellWidth + spacing;

            const numberOfColumns = Math.floor((availableWidth + spacing) / totalCellWidth);

            return numberOfColumns;
        }

        private findColumnRow(x: number, y: number,
            frameWidth: number, frameHeight: number, margin: number, spacing: number) {

            const zoom = this._imgControl.getZoom();

            x = x / zoom;
            y = y / zoom;

            const totalCellWidth = frameWidth + spacing;
            const totalCellHeight = frameHeight + spacing;
            const startX = margin;
            const startY = margin;

            const col = Math.floor((x - startX) / totalCellWidth);
            const row = Math.floor((y - startY) / totalCellHeight);

            return { col, row };
        }

        private registerScrollListeners() {

            const control = this.getImageControl();

            const map = new Map<string, { x: number, y: number }>();

            control.eventImageScrollChanged.addListener(async () => {

                const x = control.getImageScrollX();
                const y = control.getImageScrollY();

                const obj = await this.getSelectedSpritesheet();

                if (!obj) {

                    return;
                }

                const key = obj.getKey();

                map.set(key, { x, y });
            });

            this.addUpdater(async () => {

                const obj = await this.getSelectedSpritesheet();

                if (!obj) {

                    return;
                }

                const key = obj.getKey();

                if (map.has(key)) {

                    const { x, y } = map.get(key)!;

                    control.resetImageScroll(x, y);

                } else {

                    control.resetImageScroll();
                }
            });
        }

        protected async getSelectedSpritesheet(): Promise<core.SpritesheetAssetPackItem> {

            const asset = this.getSelectionFirstElement();

            if (asset instanceof core.SpritesheetAssetPackItem) {

                return asset;
            }

            return null as any;
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof core.SpritesheetAssetPackItem;
        }
    }
}
