/// <reference path="./UserPropertyType.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import code = core.code;

    /**
     * This is the base class for the user property types that edit the value as a JSON text.
     *
     * The value is edited in a text area and parsed with the `JSON.parse` function. If the text
     * is invalid, then a red error label is shown and the value is kept untouched.
     *
     * The code generation emits the value as a JSON literal: both in the field declaration
     * initializer and in the assignment statements to the object.
     */
    export abstract class AbstractJSONTextPropertyType<TValue> extends UserPropertyType<TValue> {

        constructor(id: string, defValue: TValue) {

            super(id, defValue);
        }

        protected abstract isValidValue(value: any): boolean;

        protected abstract getExpectedValueTypeHelp(): string;

        protected abstract getTypeScriptFieldType(): string;

        private parseText(text: string): { value?: any, error?: string } {

            let value: any;

            try {

                value = JSON.parse(text);

            } catch (e) {

                return { error: "Invalid JSON text." };
            }

            if (!this.isValidValue(value)) {

                return { error: "Invalid value, expected " + this.getExpectedValueTypeHelp() + "." };
            }

            return { value };
        }

        private static validateText(
            text: string, parse: (text: string) => { value?: any, error?: string },
            errorLabel: HTMLLabelElement, onValidValue: (value: any) => void) {

            const result = parse(text);

            if (result.error) {

                errorLabel.innerHTML = result.error;
                errorLabel.style.display = "block";

            } else {

                errorLabel.style.display = "none";

                onValidValue(result.value);
            }
        }

        private createTextAreaElement(): HTMLTextAreaElement {

            const text = document.createElement("textarea");
            text.classList.add("formText");
            text.rows = 4;

            return text;
        }

        private createErrorLabelElement(): HTMLLabelElement {

            const label = document.createElement("label");
            label.style.color = "red";
            label.style.display = "none";

            return label;
        }

        private createEditorComp(): HTMLDivElement {

            const comp = document.createElement("div");
            comp.style.display = "grid";
            comp.style.gap = "2px";

            return comp;
        }

        private getElementText(value: any): string {

            return JSON.stringify(value === undefined || value === null ? this.getDefaultValue() : value);
        }

        createEditorElement(getValue: () => any, setValue: (value: any) => void): IPropertyEditor {

            const comp = this.createEditorComp();

            const text = this.createTextAreaElement();
            comp.appendChild(text);

            const errorLabel = this.createErrorLabelElement();
            comp.appendChild(errorLabel);

            text.addEventListener("change", e => {

                AbstractJSONTextPropertyType.validateText(text.value,

                    text2 => this.parseText(text2),

                    errorLabel,

                    value => setValue(value));
            });

            const update = () => {

                text.value = this.getElementText(getValue());

                errorLabel.style.display = "none";
            };

            return { element: comp, update };
        }

        createInspectorPropertyEditor(
            section: SceneGameObjectSection<any>, parent: HTMLElement, userProp: UserProperty, lockIcon: boolean): void {

            const prop = userProp.getComponentProperty();

            if (lockIcon) {

                section.createLock(parent, prop);
            }

            const label = section.createLabel(parent, prop.label, PhaserHelp(prop.tooltip));
            label.style.gridColumn = "2";

            const comp = this.createEditorComp();
            parent.appendChild(comp);

            const text = this.createTextAreaElement();
            comp.appendChild(text);

            const errorLabel = this.createErrorLabelElement();
            comp.appendChild(errorLabel);

            text.addEventListener("change", e => {

                AbstractJSONTextPropertyType.validateText(text.value,

                    text2 => this.parseText(text2),

                    errorLabel,

                    value => {

                        section.getEditor().getUndoManager().add(
                            new SimpleOperation(section.getEditor(), section.getSelection(), prop, value));
                    });
            });

            section.addUpdater(() => {

                text.readOnly = !section.isUnlocked(prop);

                text.value = this.getElementText(prop.getValue(section.getSelectionFirstElement()));

                errorLabel.style.display = "none";
            });
        }

        buildDeclarePropertyCodeDOM(prop: UserProperty, value: TValue): code.FieldDeclCodeDOM {

            const decl = new code.FieldDeclCodeDOM(prop.getInfo().name, this.getTypeScriptFieldType(), true);

            decl.setInitialValueExpr(JSON.stringify(value === undefined || value === null ? this.getDefaultValue() : value));

            return decl;
        }

        buildSetObjectPropertyCodeDOM(
            comp: Component<any>, args: ISetObjectPropertiesCodeDOMArgs, userProp: UserProperty): void {

            const prop = userProp.getComponentProperty();

            comp.buildSetObjectPropertyCodeDOM([prop], builderArgs => {

                const dom = new code.AssignPropertyCodeDOM(builderArgs.fieldCodeName, args.objectVarName);

                // the value is set verbatim as a JSON literal

                dom.value(JSON.stringify(builderArgs.value));

                args.statements.push(dom);
            });
        }
    }
}
