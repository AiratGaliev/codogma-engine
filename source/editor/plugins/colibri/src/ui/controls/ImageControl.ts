/// <reference path="CanvasControl.ts" />

namespace colibri.ui.controls {

    export enum ZoomMode {
        MANUAL,
        AUTO
    }

    export class ImageControl extends CanvasControl {

        eventImageScrollChanged = new ListenerList();

        private _image: IImage;
        private _zoomMode = ZoomMode.AUTO;
        private _imgScrollX = 0;
        private _imgScrollY = 0;
        private _imgStartX: number;
        private _imgStartY: number;
        private _cursorX: number;
        private _cursorY: number;
        private _repaintCallback: () => any;
        private _inScrollMode = false;
        private _panAndZoomEnabled = false;
        private _zoom = 1;

        constructor(padding: number = 0, ...classList: string[]) {
            super(padding, "ImageControl", ...classList);
        }

        disableSmoothRendering() {

            this.getCanvas().style.setProperty("image-rendering", "crisp-edges");
        }

        setZoomMode(mode: ZoomMode) {

            this._zoomMode = mode;

            if (mode === ZoomMode.MANUAL) {

                this.enablePanAndZoom();
            }

            this.repaint();
        }

        getZoom() {

            return this._zoom;
        }

        setZoom(value: number) {

            if (!Number.isFinite(value)) {

                return;
            }

            this._zoom = Math.max(0.1, Math.min(10, value));
        }

        createZoomControls() {

            const zoomControl = new controls.ZoomControl({
                showReset: true
            });

            this.getElement().parentElement.appendChild(zoomControl.getElement());

            zoomControl.setCallback(z => {

                let z2 = this.getZoom();

                if (z === 0) {

                    z2 = 1;

                } else {

                    z2 += z * 0.1;
                }

                this.setImageScroll(0, 0);
                this.setZoom(z2);
                this.repaint();
            });
        }

        enablePanAndZoom() {

            if (this._panAndZoomEnabled) {

                return;
            }

            this._panAndZoomEnabled = true;

            const canvas = this.getCanvas();

            canvas.tabIndex = 1;
            canvas.addEventListener("mousedown", e => this.onMouseDown(e));
            canvas.addEventListener("mousemove", e => this.onMouseMove(e));
            canvas.addEventListener("mouseup", e => this.onMouseUp(e));
            canvas.addEventListener("mouseout", e => this.onMouseUp(e));
            canvas.addEventListener("wheel", e => this.onWheel(e));
        }

        onWheel(e: WheelEvent) {

            if (this._zoomMode !== ZoomMode.MANUAL) {

                return;
            }

            if (!Number.isFinite(e.deltaY) || e.deltaY === 0) {

                return;
            }

            // Wheel deltas are platform-dependent (often around 100 per notch).
            // Multiplicative zoom is symmetric in both directions and avoids
            // jumping straight to the 0.1 minimum on a single downward notch.
            if (e.cancelable) {

                e.preventDefault();
            }

            this.setZoom(this._zoom * Math.exp(-e.deltaY * 0.001));

            this.repaint();
        }

        onMouseDown(e: MouseEvent) {

            this._imgStartX = e.clientX - this._imgScrollX;
            this._imgStartY = e.clientY - this._imgScrollY;
        }

        resetImageScroll(x = 0, y = 0) {

            this._imgScrollX = x;
            this._imgScrollY = y;

            this.repaint();
        }

        getImageScrollX() {

            return this._imgScrollX;
        }

        getImageScrollY() {

            return this._imgScrollY;
        }

        setImageScroll(x: number, y: number) {

            this._imgScrollX = x;
            this._imgScrollY = y;
        }

        getCursorX() {

            return this._cursorX;
        }

        getCursorY() {

            return this._cursorY;
        }

        isInScrollMode() {

            return this._inScrollMode;
        }

        setRepaintCallback(callback: () => any) {

            this._repaintCallback = callback;
        }

        onMouseMove(e: MouseEvent) {

            this._cursorX = e.offsetX;
            this._cursorY = e.offsetY;
            this._inScrollMode = e.altKey;

            if (this._imgStartX !== undefined && this._inScrollMode) {

                const dx = e.clientX - this._imgStartX;
                const dy = e.clientY - this._imgStartY;

                this._imgScrollX = dx;
                this._imgScrollY = dy;
            }

            this.repaint();
        }

        onMouseUp(e: MouseEvent) {

            this._imgStartX = undefined;

            this.eventImageScrollChanged.fire();
        }

        getZoomMode() {

            return this._zoomMode;
        }

        setImage(image: IImage): void {

            this._image = image;
        }

        getImage() {

            return this._image;
        }

        protected async paint() {

            if (this._image) {

                this.drawImage();

                const result = await this._image.preload();

                if (result === PreloadResult.RESOURCES_LOADED) {

                    this.drawImage();
                }

            } else {

                this.clear();
            }
        }

        private drawImage() {

            this.ensureCanvasSize();
            this.clear();

            if (this._zoomMode === ZoomMode.AUTO) {

                this._image.paint(this._context, 0, 0, this._canvas.width, this._canvas.height, true);

            } else {

                this._image.paint(this._context, this._imgScrollX, this._imgScrollY,
                    this._image.getWidth() * this._zoom, this._image.getHeight() * this._zoom, false);
            }

            if (this._repaintCallback) {

                this._repaintCallback();
            }
        }

        getContext() {

            return this._context;
        }
    }
}
