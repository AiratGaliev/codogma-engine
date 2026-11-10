import {
  ComponentRegistry,
  ComponentRegistrationError,
  validateProjectDocument,
  type AssetReference,
  type ComponentTypeDefinition,
  type CoreDiagnostic,
  type ProjectDocumentV1,
} from "@codogma/cge";

export interface ProjectComponentModuleResolverInput {
  /** Native Project Model document. It is validated before any module is loaded. */
  readonly project: unknown;
  /** Component type IDs discovered in the Scene/Prefab dependency closure. */
  readonly requiredTypeIds: readonly string[];
  /** Host-owned loader for one registered script asset. */
  readonly loadModule: (
    asset: AssetReference,
    signal: AbortSignal,
  ) => Promise<ComponentTypeDefinition>;
  /** Cancels module resolution and prevents returning a partial registry. */
  readonly signal: AbortSignal;
}

export interface ProjectComponentModuleResolverResult {
  readonly valid: boolean;
  readonly diagnostics: readonly CoreDiagnostic[];
  /** Present only when every requested type resolves and passes type/version checks. */
  readonly registry?: ComponentRegistry;
  readonly loadedTypeIds: readonly string[];
}

function diagnostic(
  code: CoreDiagnostic["code"],
  message: string,
  path?: string,
  entityId?: string,
): CoreDiagnostic {
  return {
    code,
    severity: "error",
    message,
    ...(path === undefined ? {} : { path }),
    ...(entityId === undefined ? {} : { entityId }),
    source: { kind: "project", ...(entityId === undefined ? {} : { id: entityId }), path: path ?? "project.json" },
  };
}

function abortDiagnostic(): CoreDiagnostic {
  return {
    code: "SCENE_LOAD_ABORTED",
    severity: "error",
    message: "Project Component module resolution was cancelled.",
    source: { kind: "project", path: "componentModules" },
  };
}

/**
 * Resolves only the Component definitions required by the selected Scene/Prefab
 * closure, using Project.componentModules as the authoritative typeId → script
 * asset/version contract. The host decides how a script asset is imported; Core
 * project data never provides an executable import specifier.
 *
 * Resolution is deterministic and sequential. A registry is returned only when
 * all requested modules load and their stable typeId/version match the manifest.
 */
export async function resolveProjectComponentRegistry(
  input: ProjectComponentModuleResolverInput,
): Promise<ProjectComponentModuleResolverResult> {
  const validation = validateProjectDocument(input.project);
  if (!validation.valid || !validation.value) {
    return {
      valid: false,
      diagnostics: validation.diagnostics,
      loadedTypeIds: [],
    };
  }

  const project: ProjectDocumentV1 = validation.value;
  const requiredTypeIds = [...new Set(input.requiredTypeIds)].sort((left, right) => left.localeCompare(right));
  const diagnostics: CoreDiagnostic[] = [];
  const registry = new ComponentRegistry();
  const loadedTypeIds: string[] = [];
  const moduleReferences = new Map(project.componentModules.map((module) => [module.typeId, module] as const));
  const assets = new Map(project.assets.map((asset) => [asset.id, asset] as const));

  for (const typeId of requiredTypeIds) {
    if (input.signal.aborted) {
      diagnostics.push(abortDiagnostic());
      break;
    }

    const moduleReference = moduleReferences.get(typeId);
    if (!moduleReference) {
      diagnostics.push(diagnostic(
        "PROJECT_BUILD_COMPONENT_MODULE_MISSING",
        "Required Component type " + typeId + " is not declared by Project.componentModules.",
        "componentModules",
        typeId,
      ));
      continue;
    }

    const asset = assets.get(moduleReference.moduleAssetId);
    if (!asset || asset.kind !== "script") {
      diagnostics.push(diagnostic(
        "PROJECT_BUILD_COMPONENT_MODULE_MISSING",
        "Component type " + typeId + " must reference a registered script asset.",
        "assets",
        moduleReference.moduleAssetId,
      ));
      continue;
    }

    let definition: ComponentTypeDefinition;
    try {
      definition = await input.loadModule(asset, input.signal);
    } catch (error) {
      if (input.signal.aborted) {
        diagnostics.push(abortDiagnostic());
        break;
      }
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(diagnostic(
        "PROJECT_BUILD_MODULE_MISSING",
        "Could not load Component module " + typeId + " from " + asset.path + ": " + message,
        asset.path,
        typeId,
      ));
      continue;
    }

    if (input.signal.aborted) {
      diagnostics.push(abortDiagnostic());
      break;
    }
    if (
      !definition ||
      definition.schema?.typeId !== typeId ||
      definition.schema?.version !== moduleReference.version
    ) {
      diagnostics.push(diagnostic(
        "COMPONENT_INVALID_SCHEMA",
        "Loaded Component module " + typeId + " does not match its manifest typeId/version (" +
          moduleReference.version + ").",
        asset.path,
        typeId,
      ));
      continue;
    }

    try {
      registry.register(definition);
      loadedTypeIds.push(typeId);
    } catch (error) {
      if (error instanceof ComponentRegistrationError && error.diagnostics.length > 0) {
        diagnostics.push(...error.diagnostics.map((item) => ({
          ...item,
          source: { kind: "component-module" as const, id: typeId, path: asset.path },
        })));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        diagnostics.push(diagnostic("COMPONENT_INVALID_SCHEMA", message, asset.path, typeId));
      }
    }
  }

  if (input.signal.aborted && !diagnostics.some((item) => item.code === "SCENE_LOAD_ABORTED")) {
    diagnostics.push(abortDiagnostic());
  }

  if (diagnostics.length > 0) {
    return {
      valid: false,
      diagnostics,
      loadedTypeIds: Object.freeze(loadedTypeIds.sort((left, right) => left.localeCompare(right))),
    };
  }

  return {
    valid: true,
    diagnostics: [],
    registry,
    loadedTypeIds: Object.freeze(loadedTypeIds.sort((left, right) => left.localeCompare(right))),
  };
}
