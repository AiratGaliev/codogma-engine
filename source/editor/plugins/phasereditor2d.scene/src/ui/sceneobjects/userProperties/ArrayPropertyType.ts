/// <reference path="./AbstractJSONTextPropertyType.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    export class ArrayPropertyType extends AbstractJSONTextPropertyType<any[]> {

        constructor() {

            super("array", []);
        }

        getName() {

            return "Array";
        }

        protected isValidValue(value: any): boolean {

            return Array.isArray(value);
        }

        protected getExpectedValueTypeHelp(): string {

            return "an array, like <code>[1, 2, 3]</code>";
        }

        protected getTypeScriptFieldType(): string {

            return "any[]";
        }
    }
}
