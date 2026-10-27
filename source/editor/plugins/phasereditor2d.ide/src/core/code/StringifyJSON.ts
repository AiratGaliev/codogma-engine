namespace phasereditor2d.ide.core.code {

    // JSON-подобный printer для сгенерированного кода: поддерживает spread (__extends*) и raw expressions (@code:).
    export function stringifyJSON(data: any, quoteKey = false, indent = -1): string {

        const pad = (level: number) => "\t".repeat(Math.max(0, level));

        if (Array.isArray(data)) {

            if (data.length === 0) {
                return "[]";
            }

            const childIndent = indent < 0 ? -1 : indent + 1;
            const values = data.map(value => stringifyJSON(value, quoteKey, childIndent));

            if (indent < 0) {
                return "[" + values.join(", ") + "]";
            }

            return "[\n" + pad(childIndent) + values.join(",\n" + pad(childIndent))
                + "\n" + pad(indent) + "]";
        }

        if (typeof data === "object" && data !== null) {

            const keys = Object.keys(data);

            if (keys.length === 0) {
                return "{}";
            }

            const childIndent = indent < 0 ? -1 : indent + 1;
            const entries = keys.map(key => {

                if (key.startsWith("__extends")) {
                    return "..." + data[key];
                }

                const propertyKey = quoteKey ? JSON.stringify(key) : key;
                return propertyKey + ": " + stringifyJSON(data[key], quoteKey, childIndent);
            });

            if (indent < 0) {
                return "{ " + entries.join(", ") + " }";
            }

            return "{\n" + entries.map(entry => pad(childIndent) + entry).join(",\n")
                + "\n" + pad(indent) + "}";
        }

        if (typeof data === "string" && data.startsWith("@code:")) {
            return data.substring(6);
        }

        return JSON.stringify(data);
    }
}
