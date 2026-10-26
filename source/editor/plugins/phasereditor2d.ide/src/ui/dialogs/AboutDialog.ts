namespace phasereditor2d.ide.ui.dialogs {

    import controls = colibri.ui.controls;

    export class AboutDialog extends controls.dialogs.Dialog {

        constructor() {
            super("AboutDialog");
        }

        createDialogArea() {

            const element = document.createElement("div");
            element.classList.add("DialogClientArea", "DialogSection");

            const phaserVersion = (window as any)["Phaser"]?.VERSION ?? "4.2.1";

            const html = `
            <p class="Title"><b>Codogma Engine</b><br><small>v${colibri.PRODUCT_VERSION}</small></p>
            <p><i>A friendly open-source IDE for HTML5 game development</i></p>

            <p>Powered by <b>Phaser v${phaserVersion}</b> — full Phaser 4 support.</p>

            <p>
                <small>Based on the open-source <b>Phaser Editor 2D v3</b> client (MIT)<br>
                by Arian Fornaris —
                <a href="https://github.com/PhaserEditor2D/PhaserEditor2D-v3" rel="noopener" target="_blank">github.com/PhaserEditor2D/PhaserEditor2D-v3</a></small>
            </p>

            <p>
            </p>

            <p><small>Powered by Phaser — Copyright &copy; Phaser Studio. Codogma Engine changes: MIT.</small></p>
            `;

            element.innerHTML = html;

            this.getElement().appendChild(element);
        }

        create() {

            super.create();

            this.setTitle("About");

            this.addButton("Close", () => this.close());
        }
    }
}