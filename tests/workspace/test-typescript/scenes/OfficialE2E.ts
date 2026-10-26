
// You can write more code here

/* START OF COMPILED CODE */

class OfficialE2E extends Phaser.Scene {

	constructor() {
		super("OfficialE2E");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		// player
		const player = this.add.image(400, 300, "dino");

		// glow_1
		player.enableFilters().filters.internal!.addGlow(16751941, 6, 0, 1, false);

		// score
		const score = this.add.text(180, 40, "", {});
		score.text = "Official @phaserjs/editor-mcp-server works!";
		score.setStyle({ "color": "#ff9d45" });

		// lists
		const gameObjects = [player, score];

		// worldCollider
		const worldCollider = this.physics.add.collider(player, gameObjects.list);

		this.worldCollider = worldCollider;
		this.gameObjects = gameObjects;

		this.events.emit("scene-awake");
	}

	private worldCollider!: Phaser.Physics.Arcade.Collider;
	private gameObjects!: Array<Phaser.GameObjects.Image|Phaser.GameObjects.Text>;

	/* START-USER-CODE */

	// Write your code here

	create() {

		this.editorCreate();
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
