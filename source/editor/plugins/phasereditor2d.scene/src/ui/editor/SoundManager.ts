namespace phasereditor2d.scene.ui.editor {

    import controls = colibri.ui.controls;

    export class SoundManager {

        private _editor: SceneEditor;
        private _mute: boolean;

        eventMuteChanged: controls.ListenerList<boolean>;

        constructor(editor: SceneEditor) {

            this._editor = editor;
            this._mute = window.localStorage.getItem(
                "phasereditor2d.scene.ui.editor.SoundManager.mute") === "1";
            this.eventMuteChanged = new controls.ListenerList();
        }

        get sound() {

            return this._editor.getGame().sound;
        }

        editorActivated() {

            if (this.sound) {

                this.sound.setMute(this.isMute());
            }
        }

        editorDeactivated() {

            if (this.sound) {

                this.sound.setMute(true);
            }
        }

        isMute() {

            return this._mute;
        }

        setMute(mute: boolean) {

            console.log("Scene Editor: global mute " + mute);

            this._mute = mute;

            if (this.sound) {

                this.sound.setMute(mute);
            }

            window.localStorage.setItem(
                "phasereditor2d.scene.ui.editor.SoundManager.mute", mute ? "1" : "0");

            this.eventMuteChanged.fire(mute);
        }
    }
}
