namespace phasereditor2d.ide.core.code {

    // Re official v4.11.2 (bundle 35293): JSON-literal code printer.
    // "__extends" keys become object spreads and "@code:"-prefixed strings
    // become raw code expressions instead of string literals.
    export function stringifyJSON(data: any, quoteKey = false, indent = -1): string {

        let str: string;

        if (Array.isArray(data)) {

            str = "[";

            for (let i = 0; i < data.length; i++) {

                if (i > 0) {
                    str += ", ";
                }

                str += stringifyJSON(data[i], quoteKey);
            }

            str += "]";

        } else if (typeof data === "object" && data !== null) {

            str = "{ ";

            for (const key in data) {

                if (str.length > 2) {
                    str += ", ";
                }

                let tab = "";
                let newIndent = indent;

                if (indent >= 0) {
                    tab = "\n" + "\t".repeat(indent);
                    newIndent = indent + 1;
                }

                if (key.startsWith("__extends")) {

                    str += `${tab}...${data[key]}`;

                } else {

                    if (quoteKey) {
                        str += `${tab}"${key}": ${stringifyJSON(data[key], quoteKey, newIndent)}`;
                    } else {
                        str += `${tab}${key}: ${stringifyJSON(data[key], quoteKey, newIndent)}`;
                    }
                }
            }

            if (indent >= 0) {

                str += "\n" + "\t".repeat(indent - 1);

            } else {

                str += " ";
            }

            str += "}";

        } else if (typeof data === "string") {

            if (data.startsWith("@code:")) {

                str = data.substring(6);

            } else {

                str = `${JSON.stringify(data)}`;
            }

        } else {

            str = JSON.stringify(data);
        }

        return str;
    }
}
