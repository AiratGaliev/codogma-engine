namespace phasereditor2d.scene.ui.sceneobjects {

    export enum ParticleEmitterEditorType {
        NUMBER = 0,
        COLOR = 1
    }

    export enum ConfigValueType {
        None = "None",
        Static = "Static",
        Random = "Random",
        StartEndRandom = "StartEndRandom",
        Interpolation = "Interpolation",
        Stepped = "Stepped",
        MinMax = "MinMax",
        CustomEmit = "CustomEmit",
        CustomUpdate = "CustomUpdate"
    }

    const ConfigValueTypeDisplayValues = {
        [ConfigValueType.None]: "None",
        [ConfigValueType.Static]: "Value",
        [ConfigValueType.Random]: "Random",
        [ConfigValueType.StartEndRandom]: "Start/End",
        [ConfigValueType.Interpolation]: "Interpolation",
        [ConfigValueType.Stepped]: "Stepped",
        [ConfigValueType.MinMax]: "Min/Max",
        [ConfigValueType.CustomEmit]: "Custom Emit",
        [ConfigValueType.CustomUpdate]: "Custom Update"
    };

    // types whose onEmit value can also be applied on update (per-op applicability in Phaser)
    export const ON_EMIT_ONLY_TYPES = [
        ConfigValueType.None,
        ConfigValueType.Static,
        ConfigValueType.Random,
        ConfigValueType.Stepped,
        ConfigValueType.MinMax,
        ConfigValueType.CustomEmit
    ];

    export const ON_EMIT_AND_UPDATE_TYPES = [
        ConfigValueType.None,
        ConfigValueType.Static,
        ConfigValueType.Random,
        ConfigValueType.StartEndRandom,
        ConfigValueType.Interpolation,
        ConfigValueType.Stepped,
        ConfigValueType.MinMax,
        ConfigValueType.CustomEmit,
        ConfigValueType.CustomUpdate
    ];

    export const easeValues = [
        "Power0",
        "Power1",
        "Power2",
        "Power3",
        "Power4",
        "Linear",
        "Quad",
        "Cubic",
        "Quart",
        "Quint",
        "Sine",
        "Expo",
        "Circ",
        "Elastic",
        "Back",
        "Bounce",
        "Stepped",
        "Quad.easeIn",
        "Cubic.easeIn",
        "Quart.easeIn",
        "Quint.easeIn",
        "Sine.easeIn",
        "Expo.easeIn",
        "Circ.easeIn",
        "Elastic.easeIn",
        "Back.easeIn",
        "Bounce.easeIn",
        "Quad.easeOut",
        "Cubic.easeOut",
        "Quart.easeOut",
        "Quint.easeOut",
        "Sine.easeOut",
        "Expo.easeOut",
        "Circ.easeOut",
        "Elastic.easeOut",
        "Back.easeOut",
        "Bounce.easeOut",
        "Quad.easeInOut",
        "Cubic.easeInOut",
        "Quart.easeInOut",
        "Quint.easeInOut",
        "Sine.easeInOut",
        "Expo.easeInOut",
        "Circ.easeInOut",
        "Elastic.easeInOut",
        "Back.easeInOut",
        "Bounce.easeInOut",
    ];

    export function SimpleObjConfigProperty(
        name: string, defValue: any, label = "", docKey?: string,
        increment?: number, incrementMin?: number, incrementMax?: number): IProperty<ParticleEmitter> {

        const codeName = name;
        const propName = `_${name}`;

        return {
            name: propName,
            codeName,
            label,
            tooltip: docKey || `phaser:Phaser.GameObjects.Particles.ParticleEmitter.${codeName}`,
            defValue,
            local: false,
            increment,
            incrementMin,
            incrementMax,
            getValue: obj => (obj as any)[propName],
            setValue: (obj, value) => {

                (obj as any)[propName] = value;

                obj.updateConfig();
            }
        };
    }

    export function SimpleConfigProperty(name: string, defValue: any, label = "", tooltip = ""): IProperty<ParticleEmitter> {

        return {
            name,
            label,
            tooltip,
            defValue,
            local: false,
            getValue: obj => (obj as any)[name],
            setValue: (obj, value) => {

                (obj as any)[name] = value;

                obj.updateConfig();
            }
        };
    }

    export function SimpleEnumConfigProperty<TValue>(
        name: string, defValue: TValue, label = "", tooltip = "",
        enumValues?: TValue[], displayValues?: string[]): IEnumProperty<ParticleEmitter, TValue> {

        return {
            name,
            label,
            tooltip,
            defValue,
            local: false,
            getValue: obj => (obj as any)[name],
            setValue: (obj, value) => {

                (obj as any)[name] = value;

                obj.updateConfig();
            },
            getValueLabel: value => {

                if (displayValues) {

                    const i = (enumValues as any[]).indexOf(value);

                    return displayValues[i];
                }

                return value as any;
            },
            getEnumValues: () => enumValues
        };
    }

    export function SimpleEnumObjConfigProperty<TValue>(
        name: string, defValue: TValue, enumValues: TValue[], enumLabels: string[],
        label = "", tooltip = ""): IEnumProperty<ParticleEmitter, TValue> {

        const prop = SimpleEnumConfigProperty(name, defValue, label, tooltip, enumValues, enumLabels);

        prop.name = `_${name}`;
        prop.codeName = name;

        return prop;
    }

    export interface IParticleEmitterPropertyProps {

        type: IEnumProperty<ParticleEmitter, ConfigValueType>;
        value: IProperty<ParticleEmitter>;
        values: IProperty<ParticleEmitter>;
        start: IProperty<ParticleEmitter>;
        end: IProperty<ParticleEmitter>;
        randomFlag: IProperty<ParticleEmitter>;
        randomArray: IProperty<ParticleEmitter>;
        interpolation: IEnumProperty<ParticleEmitter, string>;
        ease: IEnumProperty<ParticleEmitter, string>;
        steps: IProperty<ParticleEmitter>;
        yoyo: IProperty<ParticleEmitter>;
        min: IProperty<ParticleEmitter>;
        max: IProperty<ParticleEmitter>;
        int: IProperty<ParticleEmitter>;
        onEmit: IProperty<ParticleEmitter>;
        onUpdate: IProperty<ParticleEmitter>;
    }

    export interface IParticleEmitterPropertySet {

        name: string;
        label: string;
        tooltip: string;
        editorType: ParticleEmitterEditorType;
        props: IParticleEmitterPropertyProps;
        list: Array<IProperty<ParticleEmitter>>;
    }

    export function ParticleEmitterPropertySetToConfig(obj: ParticleEmitter, propSet: IParticleEmitterPropertySet, forCompiler = false) {

        const type = propSet.props.type.getValue(obj) as ConfigValueType;

        switch (type) {

            case ConfigValueType.Static:
                return propSet.props.value.getValue(obj);

            case ConfigValueType.Random:
                return propSet.props.randomArray.getValue(obj);

            case ConfigValueType.StartEndRandom:
                return {
                    start: propSet.props.start.getValue(obj),
                    end: propSet.props.end.getValue(obj),
                    ease: propSet.props.ease.getValue(obj),
                    random: propSet.props.randomFlag.getValue(obj)
                };

            case ConfigValueType.Interpolation:
                return {
                    values: propSet.props.values.getValue(obj),
                    interpolation: propSet.props.interpolation.getValue(obj),
                    ease: propSet.props.ease.getValue(obj)
                };

            case ConfigValueType.Stepped:
                return {
                    steps: propSet.props.steps.getValue(obj),
                    start: propSet.props.start.getValue(obj),
                    end: propSet.props.end.getValue(obj),
                    yoyo: propSet.props.yoyo.getValue(obj)
                };

            case ConfigValueType.MinMax:
                return {
                    min: propSet.props.min.getValue(obj),
                    max: propSet.props.max.getValue(obj),
                    int: propSet.props.int.getValue(obj)
                };

            case ConfigValueType.CustomEmit: {

                let data;

                if (forCompiler) {

                    data = {};

                    const onEmitValue = propSet.props.onEmit.getValue(obj);

                    if (onEmitValue !== "") {

                        data.onEmit = "@code:" + onEmitValue;
                    }
                }

                return data;
            }

            case ConfigValueType.CustomUpdate: {

                let data;

                if (forCompiler) {

                    data = {};

                    const onEmitValue = propSet.props.onEmit.getValue(obj);
                    const onUpdateValue = propSet.props.onUpdate.getValue(obj);

                    if (onEmitValue !== "") {

                        data.onEmit = "@code:" + onEmitValue;
                    }

                    if (onUpdateValue !== "") {

                        data.onUpdate = "@code:" + onUpdateValue;
                    }
                }

                return data;
            }
        }

        return undefined;
    }

    export function makePropertySet(
        name: string, label: string, docKey?: string, editorType?: ParticleEmitterEditorType,
        increment = 1, incrementMin?: number, incrementMax?: number,
        propTypes?: ConfigValueType[]): IParticleEmitterPropertySet {

        if (!propTypes) {

            propTypes = ON_EMIT_AND_UPDATE_TYPES;
        }

        const set: IParticleEmitterPropertySet = {
            label,
            name,
            tooltip: `phaser:Phaser.GameObjects.Particles.ParticleEmitter.${docKey || name}`,
            editorType: editorType || ParticleEmitterEditorType.NUMBER,
            props: {
                type: SimpleEnumConfigProperty(
                    `${name}_type`, ConfigValueType.None, "Type", "tooltip",
                    propTypes, propTypes.map(v => ConfigValueTypeDisplayValues[v])),
                value: SimpleConfigProperty(`${name}_value`, 0, "Value"),
                values: SimpleConfigProperty(`${name}_values`, [0], "Values"),
                start: SimpleConfigProperty(`${name}_start`, 0, "Start"),
                end: SimpleConfigProperty(`${name}_end`, 0, "End"),
                randomFlag: SimpleConfigProperty(`${name}_randomFlag`, false, "Random Flag"),
                randomArray: SimpleConfigProperty(`${name}_random`, [0], "Random"),
                interpolation: SimpleEnumConfigProperty(
                    `${name}_interpolation`, "linear", "Interpolation", "tooltip",
                    ["linear", "catmull", "bezier"], ["Linear", "Catmull", "Bezier"]),
                ease: SimpleEnumConfigProperty(`${name}_ease`, "Linear", "Ease", "tooltip", easeValues),
                steps: SimpleConfigProperty(`${name}_steps`, 1, "Steps"),
                yoyo: SimpleConfigProperty(`${name}_yoyo`, false, "Yoyo"),
                min: SimpleConfigProperty(`${name}_min`, 0, "Min"),
                max: SimpleConfigProperty(`${name}_max`, 0, "Max"),
                int: SimpleConfigProperty(`${name}_int`, false, "Int"),
                onEmit: SimpleConfigProperty(`${name}_onEmit`, "", "On Emit"),
                onUpdate: SimpleConfigProperty(`${name}_onUpdate`, "", "On Update")
            },
            list: null as any
        };

        set.list = [
            set.props.type,
            set.props.value,
            set.props.values,
            set.props.start,
            set.props.end,
            set.props.randomFlag,
            set.props.randomArray,
            set.props.interpolation,
            set.props.ease,
            set.props.steps,
            set.props.yoyo,
            set.props.min,
            set.props.max,
            set.props.int,
            set.props.onEmit,
            set.props.onUpdate
        ];

        for (const propName of ["value", "start", "end", "steps", "min", "max"] as const) {

            set.props[propName].increment = increment;
            set.props[propName].incrementMin = incrementMin;
            set.props[propName].incrementMax = incrementMax;
        }

        return set;
    }
}
