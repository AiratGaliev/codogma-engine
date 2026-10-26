
// You can write more code here

/* START OF COMPILED CODE */

class CoinRush extends Phaser.Scene {

	constructor() {
		super("CoinRush");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		// dino
		this.add.image(350, 250, "dino");

		// scoreText
		const scoreText = this.add.text(20, 16, "", {});
		scoreText.text = "Score: 0";
		scoreText.setStyle({ "color": "#ffffff" });

		// hintText
		const hintText = this.add.text(300, 420, "", {});
		hintText.text = "Collect the coins!";
		hintText.setStyle({ "color": "#ffff00" });

		// player2
		this.add.image(550, 280, "dino");

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
