namespace phasereditor2d.ide.ui.actions {

    export const CAT_PROJECT = "phasereditor2d.ide.ui.actions.ProjectCategory";
    export const CMD_LOCATE_FILE = "phasereditor2d.ide.ui.actions.LocateFile";
    export const CMD_RELOAD_PROJECT = "phasereditor2d.ide.ui.actions.ReloadProjectAction";
    export const CMD_COMPILE_PROJECT = "phasereditor2d.ide.ui.actions.CompileProject";
    export const CMD_PLAY_PROJECT = "phasereditor2d.ide.ui.actions.PlayProject";
    export const CMD_QUICK_PLAY_PROJECT = "phasereditor2d.ide.ui.actions.QuickPlayProject";
    export const CMD_OPEN_VSCODE = "phasereditor2d.ide.ui.actions.OpenVSCode";
    export const CMD_OPEN_IN_TERMINAL = "phasereditor2d.ide.ui.actions.OpenInTerminal";
    export const CMD_ENABLE_OPEN_SOURCE_FILE_IN_EXTERNAL_EDITOR = "phasereditor2d.ide.ui.actions.EnableOpenCodeFileInExternalEditor";
    export const CMD_DISABLE_OPEN_SOURCE_FILE_IN_EXTERNAL_EDITOR = "phasereditor2d.ide.ui.actions.EnableOpenCodeFileInExternalEditor";
    export const CMD_OPEN_START_PAGE = "phasereditor2d.ide.OpenStartPage";
    export const CMD_OPEN_SETTINGS = "phasereditor2d.ide.OpenSettings";
    export const CMD_GO_TO_FILE = "phasereditor2d.ide.ui.actions.GoToFile";

    import commands = colibri.ui.ide.commands;
    import io = colibri.core.io;

    // TODO: Remove
    export function isNotWelcomeWindowScope(args: commands.HandlerArgs): boolean {

        return true;
    }

    export class IDEActions {

        static registerCommands(manager: commands.CommandManager): void {

            manager.addCategory({
                id: CAT_PROJECT,
                name: "Project"
            });

            // start page (welcome dialog)

            manager.add({
                command: {
                    id: CMD_OPEN_START_PAGE,
                    category: CAT_PROJECT,
                    name: "Start Page...",
                    tooltip: "Open the start page with quick actions and the recent files."
                },
                handler: {
                    testFunc: isNotWelcomeWindowScope,
                    executeFunc: args => {

                        new dialogs.StartPageDialog().create();
                    }
                }
            });

            // settings dialog

            manager.add({
                command: {
                    id: CMD_OPEN_SETTINGS,
                    category: CAT_PROJECT,
                    name: "Settings...",
                    tooltip: "Open the unified settings dialog (appearance, scene editor, AI, updates)."
                },
                handler: {
                    testFunc: isNotWelcomeWindowScope,
                    executeFunc: args => {

                        new dialogs.SettingsDialog().create();
                    }
                }
            });

            // go to file (quick open)

            manager.add({
                command: {
                    id: CMD_GO_TO_FILE,
                    category: CAT_PROJECT,
                    name: "Go to File...",
                    tooltip: "Search a file (or asset key) by name and open it in its editor."
                },
                keys: {
                    control: true,
                    alt: true,
                    key: "KeyP"
                },
                handler: {
                    testFunc: isNotWelcomeWindowScope,
                    executeFunc: args => {

                        new dialogs.GoToFileDialog().create();
                    }
                }
            });

            manager.add({
                command: {
                    id: CMD_ENABLE_OPEN_SOURCE_FILE_IN_EXTERNAL_EDITOR,
                    category: CAT_PROJECT,
                    name: "Enable Open Code File In External Editor",
                    tooltip: "If enable, clicking on a coding file in the Files view opens the external editor"
                },
                handler: {
                    testFunc: isNotWelcomeWindowScope,
                    executeFunc: () => {

                        IDEPlugin.getInstance().setEnableOpenCodeFileInExternalEditor(true);
                    }
                }
            });

            manager.add({
                command: {
                    id: CMD_DISABLE_OPEN_SOURCE_FILE_IN_EXTERNAL_EDITOR,
                    category: CAT_PROJECT,
                    name: "Disable Open Code File In External Editor",
                    tooltip: "If disabled, clicking on a coding file open the built-in editor."
                },
                handler: {
                    testFunc: isNotWelcomeWindowScope,
                    executeFunc: () => {

                        IDEPlugin.getInstance().setEnableOpenCodeFileInExternalEditor(false);
                    }
                }
            });

            // play game

            manager.add({

                command: {
                    id: CMD_PLAY_PROJECT,
                    name: "Play Project",
                    tooltip: "Run this project in the browser.",
                    icon: resources.getIcon(resources.ICON_PLAY),
                    category: CAT_PROJECT
                },

                handler: {

                    testFunc: isNotWelcomeWindowScope,

                    executeFunc: async (args) => {

                        await colibri.Platform.getWorkbench().saveAllEditors();

                        IDEPlugin.getInstance().playProject();
                    }
                },
                keys: {
                    key: "F12"
                }
            });

            manager.add({

                command: {
                    id: CMD_QUICK_PLAY_PROJECT,
                    name: "Quick Play Project",
                    tooltip: "Run this project in a dialog.",
                    icon: resources.getIcon(resources.ICON_PLAY),
                    category: CAT_PROJECT
                },

                handler: {

                    testFunc: isNotWelcomeWindowScope,

                    executeFunc: async (args) => {

                        await colibri.Platform.getWorkbench().saveAllEditors();

                        const config = await IDEPlugin.getInstance().requestProjectConfig();
                        let url: string;

                        if (colibri.Platform.isOnElectron()) {

                            url = config.playUrl || colibri.ui.ide.FileUtils.getRoot().getExternalUrl();

                        } else {

                            url = config.playUrl || "./external/";
                        }

                        const dlg = new dialogs.PlayDialog(url);
                        
                        dlg.create();
                    }
                },
                keys: {
                    key: "F10"
                }
            });

            // reload project

            manager.add({
                command: {
                    id: CMD_RELOAD_PROJECT,
                    name: "Reload Project",
                    tooltip: "Reload the project files.",
                    category: CAT_PROJECT
                },
                handler: {
                    testFunc: isNotWelcomeWindowScope,
                    executeFunc:
                        args => IDEPlugin.getInstance().ideOpenProject()
                },
                keys: {
                    control: true,
                    alt: true,
                    key: "KeyR"
                }
            });

            // compile project

            manager.add({
                command: {
                    id: CMD_COMPILE_PROJECT,
                    name: "Compile Project",
                    tooltip: "Compile all files.",
                    category: CAT_PROJECT
                },
                handler: {
                    testFunc: isNotWelcomeWindowScope,
                    executeFunc:
                        args => IDEPlugin.getInstance().compileProject()
                },
                keys: {
                    control: true,
                    alt: true,
                    key: "KeyB"
                }
            });

            if (IDEPlugin.getInstance().isDesktopMode()) {

                // locate file

                manager.add({
                    command: {
                        id: CMD_LOCATE_FILE,
                        category: CAT_PROJECT,
                        name: "Locate File",
                        tooltip: "Open the selected file (or project root) in the OS file manager."
                    },
                    keys: {
                        key: "KeyL",
                        control: true,
                        alt: true
                    },
                    handler: {

                        executeFunc: async (args) => {

                            let file = colibri.ui.ide.FileUtils.getRoot();

                            const view = args.activePart;

                            if (view instanceof files.ui.views.FilesView) {

                                const sel = view.getSelection()[0] as io.FilePath;

                                if (sel) {

                                    file = sel;
                                }
                            }

                            if (!file) {

                                return;
                            }

                            if (file.isFile()) {

                                file = file.getParent();
                            }

                            const resp = await colibri.core.io.apiRequest("OpenFileManager", { file: file.getFullName() });

                            if (resp.error) {

                                alert(resp.error);
                            }
                        }
                    }
                });

                // open in terminal

                manager.add({
                    command: {
                        id: CMD_OPEN_IN_TERMINAL,
                        category: CAT_PROJECT,
                        name: "Open in Terminal",
                        tooltip: "Open the selected folder in the OS Terminal app."
                    },
                    keys: {
                        key: "KeyT",
                        control: true,
                        alt: true
                    },
                    handler: {
                        executeFunc: async (args) => {

                            let file = colibri.ui.ide.FileUtils.getRoot();

                            const view = args.activePart;

                            if (view instanceof files.ui.views.FilesView) {

                                const sel = view.getSelection()[0] as io.FilePath;

                                if (sel) {

                                    file = sel;
                                }
                            }

                            if (!file) {

                                return;
                            }

                            if (file.isFile()) {

                                file = file.getParent();
                            }

                            const resp = await colibri.core.io.apiRequest("OpenTerminal", { file: file.getFullName() });

                            if (resp.error) {

                                alert(resp.error);
                            }
                        }
                    }
                });

                // open vscode

                manager.add({
                    command: {
                        id: CMD_OPEN_VSCODE,
                        category: CAT_PROJECT,
                        name: "Open " + IDEPlugin.getInstance().getExternalEditorName(),
                        tooltip: "Open the project in the configured external editor (" + IDEPlugin.getInstance().getExternalEditorName() + ")."
                    },
                    keys: {
                        control: true,
                        alt: true,
                        key: "KeyU"
                    },
                    handler: {
                        executeFunc: args => IDEPlugin.getInstance().openProjectInVSCode()
                    }
                });
            }
        }
    }
}