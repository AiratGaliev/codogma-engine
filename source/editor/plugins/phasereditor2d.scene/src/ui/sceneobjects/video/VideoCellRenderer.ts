namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class VideoCellRenderer extends controls.viewers.ImageCellRenderer {

        getImage(obj: any): controls.IImage {

            const file = obj.getVideoFile();

            const image = VideoThumbnailCache.getInstance().getContent(file);

            return image;
        }

        renderCell(args: controls.viewers.RenderCellArgs) {

            super.renderCell(args);

            if (args.viewer.getCellSize() < 32) {

                return;
            }

            const icon = resources.getIcon(resources.ICON_FILE_VIDEO);

            args.canvasContext.save();

            args.canvasContext.fillStyle = controls.Controls.getTheme().dark ? "black" : "white";

            args.canvasContext.fillRect(args.x + args.w / 2 - 8, args.y + args.h / 2 - 8, 16, 16);

            args.canvasContext.restore();

            icon.paint(args.canvasContext, args.x + args.w / 2 - 8, args.y + args.h / 2 - 8, 16, 16, false);
        }

        preload(args: controls.viewers.RenderCellArgs): Promise<controls.PreloadResult> {

            const obj = args.obj;

            const file = obj.getVideoFile();

            return VideoThumbnailCache.getInstance().preload(file);
        }
    }
}