/// <reference path="../Component.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    export class VideoComponent extends Component<Video> {

        static url = SimpleProperty("url", "", "URL",
            "The key of the video in the asset pack, or an absolute URL.",
            false,
            obj => VideoComponent.applyUrl(obj));

        static loop = SimpleProperty("loop", false, "Loop",
            "Should the video loop automatically when it reaches the end?",
            false,
            obj => obj.setLoop(obj.loop));

        static mute = SimpleProperty("mute", false, "Mute",
            "Should the video be muted?",
            false,
            obj => obj.setMute(obj.mute));

        static autoplay = SimpleProperty("autoplay", false, "Autoplay",
            "Start playing the video automatically. It generates a play() call in the game code.");

        static isURL(url: string): boolean {

            return url.startsWith("http://")
                || url.startsWith("https://")
                || url.startsWith("//")
                || url.startsWith("blob:");
        }

        private static applyUrl(obj: Video) {

            const url = obj.url;

            if (url) {

                if (VideoComponent.isURL(url)) {

                    // load the video straight from its URL

                    obj.loadURL(url);

                } else if (obj.scene.cache.video.exists(url)) {

                    // the video was preloaded by the loader, load it from the video cache

                    obj.load(url);
                }
            }
        }

        constructor(obj: Video) {
            super(obj, [
                VideoComponent.url,
                VideoComponent.loop,
                VideoComponent.mute,
                VideoComponent.autoplay
            ]);
        }

        buildSetObjectPropertiesCodeDOM(args: ISetObjectPropertiesCodeDOMArgs): void {

            const obj = this.getObject();

            // loop

            this.buildSetObjectPropertyCodeDOM([VideoComponent.loop], args2 => {

                const dom = new core.code.MethodCallCodeDOM("setLoop", args.objectVarName);

                dom.argBool(args2.value);

                args.statements.push(dom);
            });

            // mute

            this.buildSetObjectPropertyCodeDOM([VideoComponent.mute], args2 => {

                const dom = new core.code.MethodCallCodeDOM("setMute", args.objectVarName);

                dom.argBool(args2.value);

                args.statements.push(dom);
            });

            // autoplay

            this.buildSetObjectPropertyCodeDOM([VideoComponent.autoplay], args2 => {

                const dom = new core.code.MethodCallCodeDOM("play", args.objectVarName);

                args.statements.push(dom);
            });
        }
    }
}
