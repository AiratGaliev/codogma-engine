namespace phasereditor2d.ide.core.code {

    import io = colibri.core.io;

    /**
     * Legacy template heuristic: a root package.json selects package-style imports.
     * This does not validate that imported packages are declared or installed.
     */
    export function projectHasRootPackageJson(): boolean {
        const root = colibri.ui.ide.FileUtils.getRoot();
        if (root && root.getFile("package.json")) {
            return true;
        }
        return false;
    }

    export function isCopiedLibraryFile(file: io.FilePath) {

        if (file.isRoot()) {

            return false;
        }

        const name = "library.txt";

        if (file.isFolder()) {

            if (file.getFile(name)) {

                return true;
            }

        } else if (file.getName() === name || file.getSibling(name)) {

            return true;
        }

        return isCopiedLibraryFile(file.getParent());
    }

    export function isNodeLibraryFile(file: io.FilePath) {

        if (file.isFolder() && file.getName() === "node_modules") {

            return true;
        }

        if (file.isRoot()) {

            return false;
        }

        return isNodeLibraryFile(file.getParent());
    }

    export function findNodeModuleName(file: io.FilePath): string {

        if (file.isRoot() || file.getParent().isRoot()) {

            return null;
        }

        const parentName = file.getParent().getName();
        const fileName = file.getName();

        // try case node_modules/<current-files>

        if (parentName === "node_modules") {

            return fileName;
        }

        const parentParentName = file.getParent().getParent().getName();

        // try case node_modules/@org/<current-file>

        if (parentName.startsWith("@") && parentParentName === "node_modules") {

            return parentName + "/" + fileName;
        }

        return findNodeModuleName(file.getParent());
    }

    export function getImportPath(file: io.FilePath, importFile: io.FilePath, includeFileExtension = false): { importPath: string, asDefault: boolean } {

        const nodeModule = findNodeModuleName(importFile);

        if (nodeModule) {

            return { importPath: nodeModule, asDefault: false };
        }

        const parent = file.getParent();
        const parentPath = parent.getFullName();
        const parentElements = parentPath.split("/");
        const importFileName = includeFileExtension
            ? importFile.getNameWithoutExtension() + ".js"
            : importFile.getNameWithoutExtension();
        const importFilePath = io.FilePath.join(importFile.getParent().getFullName(), importFileName);
        const importFileElements = importFilePath.split("/");

        if (parent === importFile.getParent()) {

            return { importPath: "./" + importFileName, asDefault: true };
        }

        if (importFilePath.startsWith(parentPath + "/")) {

            return {
                importPath: "./" + importFileElements.slice(parentElements.length).join("/"),
                asDefault: true
            };
        }

        while (parentElements.length > 0) {

            const parentFirst = parentElements.shift();
            const importFileFirst = importFileElements.shift();

            if (parentFirst !== importFileFirst) {

                importFileElements.unshift(importFileFirst);

                return {
                    importPath: "../".repeat(parentElements.length + 1) + importFileElements.join("/"),
                    asDefault: true
                };
            }
        }

        return { importPath: "", asDefault: true };
    }

    function isAlphaNumeric(c: string) {

        const n = c.charCodeAt(0);

        return (n > 47 && n < 58) // 0-9
            || (n > 64 && n < 91) // a-z
            || (n > 96 && n < 123); // A-Z
    }

    const validCharsMap: Map<string, boolean> = new Map();

    function isValidChar(c: string) {

        if (validCharsMap.has(c)) {

            return validCharsMap.get(c);
        }

        let result = true;

        try {

            eval("() => {  function pe" + c + "pe() {} }");

        } catch (e) {

            result = false;

            return false;
        }

        validCharsMap.set(c, result);

        return result;
    }

    export function formatToValidVarName(name: string) {

        let s = "";

        for (const c of name) {

            // TODO: use isValidChar, but first we have to ask to the user if he wants to do it.
            if (isAlphaNumeric(c)) {

                s += (s.length === 0 ? c.toLowerCase() : c);

            } else {

                s += "_";
            }
        }

        return s;
    }
}