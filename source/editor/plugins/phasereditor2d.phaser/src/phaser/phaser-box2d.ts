/**
 * Ambient type declarations for the Phaser Box2D physics runtime module.
 *
 * IMPORTANT: Box2D is NOT part of the Phaser 4.2.1 core dist bundled with this editor
 * (see `phaser.ts`): it ships as a separate Phaser runtime module. These declarations
 * cover the API surface the scene editor and the generated scene code rely on, so the
 * editor compiles without the runtime. The generated code runs as soon as the user's
 * game includes the Box2D runtime module and exposes it under the `Phaser.Box2D`
 * namespace.
 *
 * Declared here (in a separate file, `phaser.ts` is generated and must not be edited)
 * following the same ambient-declaration style of the Phaser types.
 */

declare namespace Phaser {

    namespace Box2D {

        /**
         * The type of a Box2D body.
         */
        type BodyType = "static" | "kinematic" | "dynamic";

        /**
         * A 2D point/vector configuration.
         */
        interface IPointConfig {

            x: number;
            y: number;
        }

        /**
         * The configuration of a Box2D world, given to the World constructor.
         */
        interface IWorldConfig {

            /**
             * The world gravity vector. Default is `{ x: 0, y: 10 }`.
             */
            gravity?: IPointConfig;

            /**
             * If `true`, the world renders debug information (shapes, velocity, contacts). Default `false`.
             */
            debugDraw?: boolean;

            /**
             * If `true`, bodies are allowed to sleep when they come to rest. Default `true`.
             */
            allowSleep?: boolean;
        }

        /**
         * The configuration of a Box2D body, given to `World.createBody()`.
         */
        interface IBodyConfig {

            /**
             * The type of the body. Default `"dynamic"`.
             */
            type?: BodyType;

            /**
             * The world position of the body.
             */
            position?: IPointConfig;

            /**
             * If `true`, the body never rotates. Default `false`.
             */
            fixedRotation?: boolean;

            /**
             * If `true`, the body is treated as a bullet (continuous collision detection). Default `false`.
             */
            bullet?: boolean;

            /**
             * If `true`, the body is allowed to sleep. Default `true`.
             */
            allowSleep?: boolean;

            /**
             * The linear damping of the body. Default `0`.
             */
            linearDamping?: number;

            /**
             * The angular damping of the body. Default `0.1`.
             */
            angularDamping?: number;

            /**
             * The scale of the gravity applied to this body. Default `1`.
             */
            gravityScale?: number;
        }

        /**
         * The configuration of a fixture, given to `Body.createFixture()`.
         */
        interface IFixtureConfig {

            /**
             * The density of the fixture, usually in kg/m^2. Default `1`.
             */
            density?: number;

            /**
             * The friction coefficient of the fixture, usually in the range `[0, 1]`. Default `0.3`.
             */
            friction?: number;

            /**
             * The restitution (elasticity) of the fixture, usually in the range `[0, 1]`. Default `0`.
             */
            restitution?: number;
        }

        /**
         * A fixture attaches a shape to a Box2D body.
         */
        class Fixture {
        }

        /**
         * A box shape, used by `Body.createFixture()`.
         */
        class Box {

            constructor(width: number, height: number);
        }

        /**
         * A circle shape, used by `Body.createFixture()`.
         */
        class Circle {

            constructor(radius: number);
        }

        /**
         * A convex polygon shape, used by `Body.createFixture()`.
         */
        class Polygon {

            constructor(points: number[] | IPointConfig[]);
        }

        /**
         * A Box2D rigid body.
         */
        class Body {

            /**
             * The type of the body: `"static"`, `"kinematic"` or `"dynamic"`.
             */
            type: BodyType;

            /**
             * Sets the world position of the body.
             */
            setPosition(x: number, y: number): void;

            /**
             * Sets the linear velocity of the body.
             */
            setVelocity(x: number, y: number): void;

            /**
             * Sets if the body should never rotate.
             */
            setFixedRotation(flag: boolean): void;

            /**
             * Attaches a fixture (a shape with physical material properties) to the body.
             */
            createFixture(shape: Box | Circle | Polygon, config?: IFixtureConfig): Fixture;

            /**
             * Destroys the body and removes it from the world.
             */
            destroy(): void;
        }

        /**
         * The Box2D physics world of a scene.
         */
        class World {

            constructor(scene: Phaser.Scene, config?: IWorldConfig);

            /**
             * Creates a new body in the world.
             */
            createBody(config?: IBodyConfig): Body;

            /**
             * Manually steps the world simulation.
             */
            step(): void;
        }
    }
}
