
// You can write more code here

/* START OF COMPILED CODE */

class MyGame extends Phaser.Scene {

	constructor() {
		super("MyGame");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		// dino
		this.add.image(429, 174, "dino");

		// text_1
		const text_1 = this.add.text(325, 199, "", {});
		text_1.text = "Hello Phaser 4.2.1!";

		this.events.emit("scene-awake");
	}

	/* START-USER-CODE */

	// Write your code here

	create() {

		this.editorCreate();
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
