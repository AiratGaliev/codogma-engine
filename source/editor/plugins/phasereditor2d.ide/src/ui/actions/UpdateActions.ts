namespace phasereditor2d.ide.ui.actions {

    import controls = colibri.ui.controls;
    import commands = colibri.ui.ide.commands;

    export const CMD_CHECK_UPDATES = "phasereditor2d.ide.ui.actions.CheckForUpdates";

    export interface IUpdateCheckResult {

        ok: boolean;
        currentVersion: string;
        latestVersion?: string;
        updateAvailable: boolean;
        error?: string;
    }

    /**
     * "Check for Updates..." (official v5 Help menu): queries the update service and
     * compares the latest published version with the current product version.
     *
     * It never throws: every failure mode is returned as a graceful IUpdateCheckResult.
     */
    export class UpdateActions {

        static registerCommands(manager: commands.CommandManager) {

            manager.add({
                command: {
                    id: CMD_CHECK_UPDATES,
                    category: CAT_PROJECT,
                    name: "Check for Updates...",
                    tooltip: "Check if a new version of Codogma Engine is available.",
                    icon: resources.getIcon(resources.ICON_SEARCH_GODOT)
                },
                handler: {
                    testFunc: isNotWelcomeWindowScope,
                    executeFunc: async args => {

                        const dlg = new controls.dialogs.AlertDialog();

                        dlg.create();
                        dlg.setTitle("Check for Updates");
                        dlg.setMessage("Checking for updates...");

                        const result = await UpdateActions.checkForUpdates();

                        dlg.setMessage(UpdateActions.getResultMessage(result));
                    }
                }
            });
        }

        static getCurrentVersion(): string {

            return colibri.PRODUCT_VERSION;
        }

        /**
         * Fetches the latest version from the local update source (the editor
         * server's /editor/product.json), with a 5s timeout.
         */
        static async fetchLatestVersion(): Promise<string> {

            const controller = new AbortController();

            const timer = setTimeout(() => controller.abort(), 5000);

            try {

                const resp = await fetch("/editor/product.json", {
                    method: "GET",
                    signal: controller.signal
                });

                if (!resp.ok) {

                    throw new Error(`HTTP ${resp.status}`);
                }

                const data = await resp.json();

                if (typeof data?.version === "string") {

                    return data.version.replace(/^v/, "");
                }

                throw new Error("Malformed product metadata");

            } finally {

                clearTimeout(timer);
            }
        }

        /**
         * Compares dot-separated numeric versions. Returns > 0 if a > b, < 0 if a < b,
         * 0 if they are equal.
         */
        static compareVersions(a: string, b: string): number {

            const partsA = String(a).split(".").map(n => parseInt(n, 10) || 0);
            const partsB = String(b).split(".").map(n => parseInt(n, 10) || 0);

            const len = Math.max(partsA.length, partsB.length);

            for (let i = 0; i < len; i++) {

                const va = partsA[i] ?? 0;
                const vb = partsB[i] ?? 0;

                if (va !== vb) {

                    return va - vb;
                }
            }

            return 0;
        }

        static async checkForUpdates(): Promise<IUpdateCheckResult> {

            const currentVersion = UpdateActions.getCurrentVersion();

            try {

                const latestVersion = await UpdateActions.fetchLatestVersion();

                return {
                    ok: true,
                    currentVersion,
                    latestVersion,
                    updateAvailable: UpdateActions.compareVersions(latestVersion, currentVersion) > 0
                };

            } catch (e) {

                return {
                    ok: false,
                    currentVersion,
                    updateAvailable: false,
                    error: `Could not check for updates (offline). Current version: v${currentVersion}.`
                };
            }
        }

        static getResultMessage(result: IUpdateCheckResult): string {

            if (!result.ok) {

                return result.error ?? `Could not check for updates. Current version: v${result.currentVersion}.`;
            }

            if (result.updateAvailable) {

                return `You are using v${result.currentVersion}. `
                    + `Latest is v${result.latestVersion}.<br><br>`
                    + `Update the <code>version</code> field in <code>source/editor/product.json</code> and rebuild to ship a new release.`;
            }

            return `You are using the latest version (v${result.currentVersion}).`;
        }
    }
}
