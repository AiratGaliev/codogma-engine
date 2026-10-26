namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export class VideoSection extends SceneGameObjectSection<Video> {

        static SECTION_ID = "phasereditor2d.scene.ui.sceneobjects.VideoSection";

        constructor(page: controls.properties.PropertyPage) {
            super(page, VideoSection.SECTION_ID, "Video", false, false);
        }

        getSectionHelpPath() {

            return "";
        }

        createForm(parent: HTMLDivElement) {

            const comp = this.createGridElementWithPropertiesXY(parent);

            // url

            this.createPropertyStringRow(comp, VideoComponent.url).text.style.gridColumn = "3 / span 4";

            // loop / mute / autoplay

            this.createPropertyBoolean(comp, VideoComponent.loop)
                .checkElement.style.gridColumn = "3 / span 4";

            this.createPropertyBoolean(comp, VideoComponent.mute)
                .checkElement.style.gridColumn = "3 / span 4";

            this.createPropertyBoolean(comp, VideoComponent.autoplay)
                .checkElement.style.gridColumn = "3 / span 4";
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof Video;
        }

        canEditNumber(n: number): boolean {

            return n > 0;
        }
    }
}
