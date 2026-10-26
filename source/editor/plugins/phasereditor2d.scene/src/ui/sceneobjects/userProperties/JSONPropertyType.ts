/// <reference path="./AbstractJSONTextPropertyType.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    export class JSONPropertyType extends AbstractJSONTextPropertyType<object> {

        constructor() {

            super("json", {});
        }

        getName() {

            return "JSON";
        }

        protected isValidValue(value: any): boolean {

            return typeof value === "object" && value !== null;
        }

        protected getExpectedValueTypeHelp(): string {

            return "a JSON object, like <code>{ \"speed\": 10 }</code>";
        }

        protected getTypeScriptFieldType(): string {

            return "object";
        }
    }
}
