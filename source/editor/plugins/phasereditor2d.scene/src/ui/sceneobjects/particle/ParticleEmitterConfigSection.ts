/// <reference path="../object/properties/SceneGameObjectSection.ts" />
/// <reference path="./ParticleEmitter.ts" />
/// <reference path="./ParticleEmitterConfig.ts" />

namespace phasereditor2d.scene.ui.sceneobjects {

    import controls = colibri.ui.controls;

    export abstract class ParticleEmitterConfigSection extends SceneGameObjectSection<ParticleEmitter> {

        private _propSetList: IParticleEmitterPropertySet[];

        constructor(page: controls.properties.PropertyPage, id: string, title: string, propSetList: IParticleEmitterPropertySet[]) {
            super(page, id, title, false, true);

            this._propSetList = propSetList;
        }

        createForm(parent: HTMLElement) {

            const comp = this.createGridElement(parent);

            comp.style.gridTemplateColumns = "auto auto 1fr";

            for (const propSet of this._propSetList) {

                this.createPropertyConfig(comp, propSet);
            }

            this.createSimpleProperties(comp);
        }

        createSimpleProperties(parent: HTMLElement) {

            // nothing
        }

        private createPropertySetTypePane(
            type: ConfigValueType, parent: HTMLElement, propSet: IParticleEmitterPropertySet,
            paneBuilder: (parent: HTMLElement, propSet: IParticleEmitterPropertySet) => HTMLElement) {

            const pane = paneBuilder.call(this, parent, propSet);

            const display = pane.style.display;

            this.addUpdater(() => {

                const obj = this.getSelectionFirstElement();

                if (!obj) {

                    pane.style.display = "none";
                    return;
                }

                const propType = propSet.props.type.getValue(obj);

                pane.style.display = propType === type ? display : "none";
            });
        }

        private createPropertyConfig(parent: HTMLElement, propSet: IParticleEmitterPropertySet) {

            this.createPane_Variable(parent, propSet);
            this.createPropertySetTypePane(ConfigValueType.Static, parent, propSet, this.createEditor_Static);
            this.createPropertySetTypePane(ConfigValueType.StartEndRandom, parent, propSet, this.createEditor_StartEndRandom);
            this.createPropertySetTypePane(ConfigValueType.MinMax, parent, propSet, this.createEditor_MinMax);
            this.createPropertySetTypePane(ConfigValueType.Random, parent, propSet, this.createEditor_Random);
            this.createPropertySetTypePane(ConfigValueType.Interpolation, parent, propSet, this.createEditor_Interpolation);
            this.createPropertySetTypePane(ConfigValueType.Stepped, parent, propSet, this.createEditor_Stepped);
            this.createPropertySetTypePane(ConfigValueType.CustomEmit, parent, propSet, this.createEditor_CustomEmit);
            this.createPropertySetTypePane(ConfigValueType.CustomUpdate, parent, propSet, this.createEditor_CustomUpdate);
        }

        private createEditor_CustomEmit(parent: HTMLElement, propSet: IParticleEmitterPropertySet) {

            const container = this.createEditorContainer(parent);

            this.createPropLabel(container, propSet.props.onEmit);
            this.createStringField(container, propSet.props.onEmit);

            return container;
        }

        private createEditor_CustomUpdate(parent: HTMLElement, propSet: IParticleEmitterPropertySet) {

            const container = this.createEditorContainer(parent);

            this.createPropLabel(container, propSet.props.onEmit);
            this.createStringField(container, propSet.props.onEmit);

            this.createPropLabel(container, propSet.props.onUpdate);
            this.createStringField(container, propSet.props.onUpdate);

            return container;
        }

        private createPane_Variable(parent: HTMLElement, propSet: IParticleEmitterPropertySet) {

            this.createLock(parent, ...propSet.list);
            this.createLabel(parent, propSet.label, PhaserHelp(propSet.tooltip));
            this.createEnumField(parent, propSet.props.type);
        }

        private createEditor_Random(parent: HTMLElement, propSet: IParticleEmitterPropertySet) {

            const container = this.createEditorContainer(parent);

            this.createPropLabel(container, propSet.props.randomArray);

            if (propSet.editorType === ParticleEmitterEditorType.COLOR) {

                this.createColorArrayField(container, propSet.props.randomArray);

            } else {

                this.createNumberArrayField(container, propSet.props.randomArray);
            }

            return container;
        }

        private createEditor_Interpolation(parent: HTMLElement, propSet: IParticleEmitterPropertySet) {

            const container = this.createEditorContainer(parent);

            this.createPropLabel(container, propSet.props.interpolation);
            this.createEnumField(container, propSet.props.interpolation);

            this.createPropLabel(container, propSet.props.values);
            this.createNumberArrayField(container, propSet.props.values);

            this.createPropLabel(container, propSet.props.ease);
            this.createEnumField(container, propSet.props.ease);

            return container;
        }

        private createEditor_Static(parent: HTMLElement, propSet: IParticleEmitterPropertySet) {

            const container = this.createEditorContainer(parent);

            const label = this.createPropLabel(container, propSet.props.value);

            this.createPropNumber(propSet, propSet.props.value, container, label);

            return container;
        }

        private createEditor_StartEndRandom(parent: HTMLElement, propSet: IParticleEmitterPropertySet) {

            const container = this.createEditorContainer(parent);

            {
                const label = this.createPropLabel(container, propSet.props.start);

                this.createPropNumber(propSet, propSet.props.start, container, label);
            }

            {
                const label = this.createPropLabel(container, propSet.props.end);

                this.createPropNumber(propSet, propSet.props.end, container, label);
            }

            this.createPropLabel(container, propSet.props.ease);
            this.createEnumField(container, propSet.props.ease);

            this.createBooleanField(container, propSet.props.randomFlag);

            return container;
        }

        private createEditor_Stepped(parent: HTMLElement, propSet: IParticleEmitterPropertySet) {

            const container = this.createEditorContainer(parent);

            {
                const label = this.createPropLabel(container, propSet.props.steps);

                this.createPropNumber(propSet, propSet.props.steps, container, label);
            }

            {
                const label = this.createPropLabel(container, propSet.props.start);

                this.createPropNumber(propSet, propSet.props.start, container, label);
            }

            {
                const label = this.createPropLabel(container, propSet.props.end);

                this.createPropNumber(propSet, propSet.props.end, container, label);
            }

            this.createBooleanField(container, propSet.props.yoyo);

            return container;
        }

        private createEditor_MinMax(parent: HTMLElement, propSet: IParticleEmitterPropertySet) {

            const container = this.createEditorContainer(parent);

            {
                const label = this.createPropLabel(container, propSet.props.min);

                const text = this.createFloatField(container, propSet.props.min);

                this.createPropertyLabelToTextNumericLink(propSet.props.min, label, text);
            }

            {
                const label = this.createPropLabel(container, propSet.props.max);

                const text = this.createFloatField(container, propSet.props.max);

                this.createPropertyLabelToTextNumericLink(propSet.props.max, label, text);
            }

            this.createBooleanField(container, propSet.props.int);

            return container;
        }

        private createPropNumber(
            propSet: IParticleEmitterPropertySet, prop: IProperty<ParticleEmitter>,
            container: HTMLElement, label: HTMLElement) {

            if (propSet.editorType === ParticleEmitterEditorType.COLOR) {

                this.createColorField(container, stringColorPropertyAdapter(prop), false);

            } else {

                const text = this.createFloatField(container, prop);

                this.createPropertyLabelToTextNumericLink(prop, label, text);
            }
        }

        private createEditorContainer(parent: HTMLElement, template = "auto 1fr") {

            const container = document.createElement("div");

            container.classList.add("formGrid");
            container.style.display = "grid";
            container.style.gridTemplateColumns = template;
            container.style.gridColumn = "3";

            parent.appendChild(container);

            return container;
        }

        private createPropLabel(container: HTMLElement, prop: IProperty<ParticleEmitter>) {

            return this.createLabel(container, prop.label);
        }

        protected createArrayText(parent: HTMLElement) {

            const text = this.createText(parent, false);

            text.addEventListener("change", e => {

                let value = text.value.trim();

                if (value) {

                    if (value.startsWith("[")) {

                        value = value.substring(1);
                    }

                    if (value.endsWith("]")) {

                        value = value.substring(0, value.length - 1);
                    }

                    const array = value.split(",").map(v => v.trim());

                    text.dispatchEvent(new CustomEvent("arrayChange", { detail: array }));
                }
            });

            return text;
        }

        protected createNumberArrayField(parent: HTMLElement, prop: IProperty<ParticleEmitter>, checkUnlock = true, forceReadOnly = false) {

            const text = this.createArrayText(parent);

            text.addEventListener("arrayChange", (e: any) => {

                const array = e.detail as string[];

                const value = array.map(v => Number(v));

                this.getEditor().getUndoManager().add(new SimpleOperation(this.getEditor(), this.getSelection(), prop, value));
            });

            this.addUpdater(() => {

                text.readOnly = forceReadOnly || (checkUnlock && !this.isUnlocked(prop));

                if (this.getSelection().length > 1) {

                    text.value = "(multiple selection)";

                } else {

                    const value = prop.getValue(this.getSelectionFirstElement());

                    text.value = Array.isArray(value) ? value.join(", ") : "";
                }
            });

            return text;
        }

        protected createColorArrayField(parent: HTMLElement, prop: IProperty<ParticleEmitter>, checkUnlock = true, forceReadOnly = false) {

            const text = this.createArrayText(parent);

            text.addEventListener("arrayChange", (e: any) => {

                const array = e.detail as string[];

                const value = array.map(v => {

                    if (v.startsWith("#")) {

                        v = "0x" + v.substring(1);
                    }

                    return Number(v);
                });

                this.getEditor().getUndoManager().add(new SimpleOperation(this.getEditor(), this.getSelection(), prop, value));
            });

            this.addUpdater(() => {

                text.readOnly = forceReadOnly || (checkUnlock && !this.isUnlocked(prop));

                if (this.getSelection().length > 1) {

                    text.value = "(multiple selection)";

                } else {

                    const value = prop.getValue(this.getSelectionFirstElement());

                    text.value = Array.isArray(value) ? value.map(v => "0x" + v.toString(16)).join(", ") : "";
                }
            });

            return text;
        }

        canEdit(obj: any, n: number): boolean {

            return obj instanceof ParticleEmitter;
        }

        canEditNumber(n: number): boolean {

            return n === 1;
        }
    }

    export function stringColorPropertyAdapter(prop: IProperty<ParticleEmitter>): IProperty<ParticleEmitter> {

        const wrapper = { ...prop };

        const getValue = wrapper.getValue;
        const setValue = wrapper.setValue;

        wrapper.getValue = obj => {

            const value = getValue(obj);

            return "#" + value.toString(16).padStart(6, "0");
        };

        wrapper.setValue = (obj, value) => {

            const numValue = Number.parseInt("0x" + value.substring(1), 16);

            setValue(obj, numValue);
        };

        return wrapper;
    }
}
