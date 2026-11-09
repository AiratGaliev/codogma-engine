# Project Manager

Project Manager is the entry point for the native SolidJS Editor Host. It owns project onboarding and activation; it does not define another project format or implement Preview, Build, Package Manager, or project-resource validation semantics of its own.

## Startup and project locations

The main Node server starts the Project Manager when PROJECT_DIR is not configured. The root directory that it manages is resolved in this order:

1. PROJECTS_DIR, when set;
2. the parent directory of an explicitly configured PROJECT_DIR;
3. ~/CodogmaProjects by default.

PROJECT_DIR is an optional startup convenience for an existing project. It is validated before activation; an invalid or incompatible project is not opened. CODOGMA_USER_DATA_DIR controls the per-user settings directory and defaults to ~/.codogma-engine.

The Project Manager UI browses only inside the configured Projects root. To work with an existing folder outside that root, configure PROJECTS_DIR to a parent folder that contains it. This intentionally avoids granting a browser UI an unrestricted filesystem path API.

Example:

~~~dotenv
PROJECTS_DIR=D:/GameProjects
# Optional startup project:
# PROJECT_DIR=D:/GameProjects/MyGame
# Optional settings location:
# CODOGMA_USER_DATA_DIR=D:/Codogma/UserData
~~~

## Native project contract

project.json is the only source of truth for the serializable Project Model. Creation and loading use the existing @codogma/cge serializers and parsers:

- serializeProjectDocument / parseProjectDocument;
- serializeSceneDocument / parseSceneDocument;
- parsePrefabDocument.

The built-in Empty 2D Project template contains:

- a Project Model v1 manifest with stable project/scene/asset IDs;
- one empty Main Scene registered as a native scene asset;
- the phaser runtime adapter identifier with empty adapter settings;
- starter assets/, scripts/ and build/ folders with short usage notes;
- a project README and .gitignore.

The template does not add a game-specific script, game mechanics, external package dependency, second serializer, or editor state to project.json.

### Build configuration boundary

The current repository does not yet define a stable build-profile/default-configuration schema. The build pipeline/target contract is owned by COD-35; the SolidJS Build Profiles UI is a separate workflow. The Empty template creates a build/ working folder but deliberately does not invent a manifest or profile format. Project Manager will consume the official build contract when it exists.

### Validation boundary

Opening a project performs read-only checks before activation:

- the Project Model version and manifest schema are accepted by Core;
- each registered asset resolves to a regular file inside the project;
- registered Prefab and Scene documents parse through Core with the project asset and prefab context;
- document IDs match their manifest references;
- a project has at least one registered Scene so the current Editor Host can open its first scene.

This is a safe-open gate, not the full dependency graph/resource validator owned by COD-33. It never silently upgrades an older schema, rewrites a broken manifest, or repairs project files. Invalid, unsupported, and incomplete projects remain on disk and are shown with diagnostics.

## Create transaction

Creation is scoped to a directory under PROJECTS_DIR:

1. Validate the project name, one-segment folder name, template ID and parent directory.
2. Acquire an exclusive sibling lock so concurrent Project Manager instances cannot create the same destination.
3. Write the complete template into a unique hidden staging directory through the existing path-security helpers.
4. Validate the staged Project and Scene through Core and verify registered files.
5. Publish the staging directory by renaming it to the final destination.
6. Validate the published project and add it to Recent Projects.

A collision is an explicit conflict; it is never treated as permission to overwrite. The exclusive sibling lock serializes Project Manager create operations across Codogma server instances. On write/validation/publication failure, the staging directory and lock are cleaned up. Existing content is not used as a staging target. As with the existing server path-security helpers, the Node rename primitive does not provide a portable no-replace guarantee against an unrelated external process racing to create an empty destination after the final existence check; keep the Projects root under the user account and avoid concurrent external writers.

Filesystem race guarantees remain those of server/path-security.mjs: Linux operations use descriptor-anchored helpers where available; other platforms retain the documented pathname fallback limitations. Project Manager does not claim a portable race-free guarantee.

## Recent Projects and recovery

Recent Projects is editor/user state, not game/project content. The settings file is:

$CODOGMA_USER_DATA_DIR/recent-projects.json (default ~/.codogma-engine/recent-projects.json).

It stores only the Project ID, display name, Projects-root-relative path and last-opened timestamp. It does not store an absolute path or modify the project's serialized Project Model.

On startup/reload, Project Manager scans the configured root with bounded depth and entry count. Unreadable directories and scan-limit exhaustion are surfaced as warnings instead of being silently treated as an empty Projects location. A recent entry is matched by stable Project ID, not only by the previous folder name. When a project moved elsewhere inside the configured root, the recent path is updated. Each matched recent entry is revalidated with the full safe-open gate, including registered files and Scene/Prefab documents, before it is marked available. Deleted/out-of-root folders are marked missing and can be removed from the recent list. A project with an unreadable or unsupported manifest, missing registered asset, or invalid Scene/Prefab is marked invalid and cannot be opened from Recent Projects.

## Editor Host ownership

The server has one active project directory. Successful Create/Open validates the project, changes the active project root, invalidates the project content hash and rebinds the first-party MCP server to the same root. Existing Editor file APIs and consumers continue to resolve against that active project. AI Chat and project MCP operations require an active project; the Project Manager API remains available without one. Before the switch, Project Manager blocks while a save, scene load or native document mutation is in flight. On activation, the SolidJS Host invalidates outstanding document/script/schema requests, clears the previous TypeScript source session and opens the first registered Scene without prompting a second time for changes the user already chose to discard.

No new project state is written into the Project Model beyond the native fields already defined by ADR-0007.
