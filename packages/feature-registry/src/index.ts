export const FEATURE_REGISTRY_SCHEMA_VERSION = 1 as const;
export const PROJECT_FEATURE_CONFIGURATION_SCHEMA_VERSION = 1 as const;
export const FEATURE_SCOPES = ["runtime", "editor", "build", "platform", "tooling"] as const;
export type FeatureScope = typeof FEATURE_SCOPES[number];
export type FeaturePolicy = "required" | "default" | "optional";
export type ProviderMode = "single" | "all";
export interface FeatureEntryPoints { runtime?: string; editor?: string; build?: string; platform?: string; tooling?: string }
export interface BuiltinProvider { id: string; kind: "builtin"; scopes: readonly FeatureScope[]; targets: readonly string[]; entryPoints: FeatureEntryPoints }
export interface PackageProvider { id: string; kind: "package"; packageName: string; packageVersion?: string; scopes: readonly FeatureScope[]; targets: readonly string[]; entryPoints: FeatureEntryPoints }
export type FeatureProvider = BuiltinProvider | PackageProvider;
export interface FeatureDescriptor { id: string; scopes: readonly FeatureScope[]; targets: readonly string[]; policy: FeaturePolicy; providers: readonly FeatureProvider[]; providerMode?: ProviderMode; requires?: readonly string[]; conflicts?: readonly string[] }
export interface FeatureRegistryDocumentV1 { schemaVersion: 1; features: readonly FeatureDescriptor[] }
export interface ProjectTargetOverrideV1 { target: string; enabledFeatureIds?: readonly string[]; disabledFeatureIds?: readonly string[] }
export interface ProjectFeatureConfigurationV1 { schemaVersion: 1; enabledFeatureIds: readonly string[]; disabledFeatureIds?: readonly string[]; targetOverrides?: readonly ProjectTargetOverrideV1[] }
export interface InstalledFeaturePackage { id: string; name: string; version: string; scopes: readonly FeatureScope[]; targets: readonly string[]; compatible: boolean }
export interface FeatureProviderBinding { providerId: string; packageInstanceId: string }
export type FeatureDiagnosticCode =
  | "FEATURE_REGISTRY_INVALID" | "FEATURE_REGISTRY_UNSUPPORTED_VERSION" | "FEATURE_ID_INVALID" | "FEATURE_DUPLICATE_ID"
  | "FEATURE_PROVIDER_INVALID" | "FEATURE_PROVIDER_DUPLICATE_ID" | "FEATURE_CONFIGURATION_INVALID"
  | "FEATURE_CONFIGURATION_UNSUPPORTED_VERSION" | "FEATURE_CONFIGURATION_UNKNOWN_FEATURE"
  | "FEATURE_PACKAGE_SNAPSHOT_INVALID" | "FEATURE_PROVIDER_BINDING_INVALID" | "FEATURE_PROVIDER_MISSING"
  | "FEATURE_PROVIDER_INCOMPATIBLE" | "FEATURE_PROVIDER_AMBIGUOUS" | "FEATURE_SCOPE_UNSUPPORTED"
  | "FEATURE_TARGET_UNSUPPORTED" | "FEATURE_REQUIREMENT_MISSING" | "FEATURE_REQUIREMENT_DISABLED"
  | "FEATURE_REQUIREMENT_CYCLE" | "FEATURE_CONFLICT";
export interface FeatureDiagnostic { code: FeatureDiagnosticCode; severity: "error"; message: string; featureId?: string; target?: string; path?: string }
export interface FeatureProviderResolution { providerId: string; kind: "builtin" | "package"; status: "available" | "missing-package" | "incompatible" | "scope-unsupported" | "target-unsupported" | "ambiguous-package-instance" | "binding-invalid"; packageInstanceIds: readonly string[]; entryPoints: FeatureEntryPoints }
export type FeatureSelectionSource = "required-policy" | "default-policy" | "project-selection" | "target-override" | "dependency" | "disabled";
export type FeatureExclusionReason = "not-enabled" | "scope-unsupported" | "target-unsupported" | "provider-missing" | "provider-incompatible" | "provider-ambiguous" | "required-dependency-disabled" | "dependency-unavailable" | "conflict";
export interface FeatureSelectionState { id: string; packageInstalled: boolean | null; provided: boolean; available: boolean; enabled: boolean; includedInTarget: boolean; activation: "not-managed"; selectionSource: FeatureSelectionSource; requiredBy: readonly string[]; providers: readonly FeatureProviderResolution[]; exclusionReason?: FeatureExclusionReason }
export interface ProjectBuildFeatureSnapshot { id: string; providerKind: "builtin" | "package"; providerPackageId?: string; providerPackageIds?: readonly string[]; selected: boolean; available: boolean; targetCompatible: boolean }
export interface FeatureSelectionReport { valid: boolean; schemaVersion: 1; target: string; scope: FeatureScope; diagnostics: readonly FeatureDiagnostic[]; features: readonly FeatureSelectionState[]; requestedFeatureIds: readonly string[]; includedFeatureIds: readonly string[]; excludedFeatureIds: readonly string[]; buildAnalysisFeatures: readonly ProjectBuildFeatureSnapshot[] }
export interface ResolveFeatureSelectionInput { registry: FeatureRegistryDocumentV1; project: ProjectFeatureConfigurationV1; installedPackages: readonly InstalledFeaturePackage[]; target: string; scope: FeatureScope; providerBindings?: readonly FeatureProviderBinding[] }

const ID = /^[A-Za-z0-9][A-Za-z0-9._:$-]*$/;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const ids = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string" && ID.test(x)) && new Set(v).size === v.length;
const scopesValid = (v: unknown): v is FeatureScope[] => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === "string" && FEATURE_SCOPES.includes(x as FeatureScope)) && new Set(v).size === v.length;
const targets = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === "string" && (x === "*" || ID.test(x))) && new Set(v).size === v.length && (v.includes("*") ? v.length === 1 : true);
const supports = (values: readonly string[], target: string) => values.includes("*") || values.includes(target);
const result = <T>(diagnostics: FeatureDiagnostic[]): { valid: boolean; diagnostics: FeatureDiagnostic[]; value?: T } => diagnostics.length ? { valid: false, diagnostics } : { valid: true, diagnostics: [], value: undefined as T };
const error = (code: FeatureDiagnosticCode, message: string, featureId?: string, path?: string, target?: string): FeatureDiagnostic => ({ code, severity: "error", message, ...(featureId ? { featureId } : {}), ...(path ? { path } : {}), ...(target ? { target } : {}) });
const sorted = (v: readonly string[]) => [...v].sort((a, b) => a.localeCompare(b));
const ENTRY_KEYS = ["runtime", "editor", "build", "platform", "tooling"] as const;
const safeEntry = (value: unknown, kind: "builtin" | "package") => typeof value === "string" && value.length > 0 && value.length <= 256 && (kind === "builtin" ? /^codogma:[A-Za-z0-9][A-Za-z0-9._:$-]*$/.test(value) : value === "." || (value.startsWith("./") && value.slice(2).split("/").every(p => p !== "" && p !== "." && p !== ".." && /^[A-Za-z0-9._-]+$/.test(p))));
const knownKeys = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).every(k => keys.includes(k));

function validateProvider(raw: unknown, feature: FeatureDescriptor, index: number, seen: Set<string>, diagnostics: FeatureDiagnostic[]): FeatureProvider | undefined {
  const path = "features." + feature.id + ".providers[" + index + "]";
  if (!object(raw) || typeof raw.id !== "string" || !ID.test(raw.id) || seen.has(raw.id) || (raw.kind !== "builtin" && raw.kind !== "package")) {
    diagnostics.push(error(seen.has(String(raw && object(raw) ? raw.id : "")) ? "FEATURE_PROVIDER_DUPLICATE_ID" : "FEATURE_PROVIDER_INVALID", "Provider must have a unique stable ID and supported kind.", feature.id, path));
    return;
  }
  seen.add(raw.id);
  if (!scopesValid(raw.scopes) || !targets(raw.targets)) {
    diagnostics.push(error("FEATURE_PROVIDER_INVALID", "Provider must declare valid scopes and targets.", feature.id, path));
    return;
  }
  const scopes = raw.scopes as FeatureScope[];
  if (scopes.some(s => !feature.scopes.includes(s)) || (raw.targets as string[]).some(t => !feature.targets.includes("*") && !feature.targets.includes(t))) {
    diagnostics.push(error("FEATURE_PROVIDER_INVALID", "Provider scopes and targets cannot exceed the feature descriptor.", feature.id, path));
    return;
  }
  if (!object(raw.entryPoints)) {
    diagnostics.push(error("FEATURE_PROVIDER_INVALID", "Provider entry points must be a scope-to-path object.", feature.id, path));
    return;
  }
  const entryPoints = raw.entryPoints;
  if (!knownKeys(entryPoints, ENTRY_KEYS) || scopes.some(scope => !safeEntry(entryPoints[scope], raw.kind as "builtin" | "package")) || Object.keys(entryPoints).some(key => !scopes.includes(key as FeatureScope))) {
    diagnostics.push(error("FEATURE_PROVIDER_INVALID", "Provider must declare safe public entry points exactly for its supported scopes.", feature.id, path));
    return;
  }
  if (raw.kind === "builtin") {
    if (!knownKeys(raw, ["id", "kind", "scopes", "targets", "entryPoints"])) {
      diagnostics.push(error("FEATURE_PROVIDER_INVALID", "Built-in provider contains unsupported properties.", feature.id, path)); return;
    }
    return { id: raw.id, kind: "builtin", scopes, targets: raw.targets as string[], entryPoints: entryPoints as FeatureEntryPoints };
  }
  if (typeof raw.packageName !== "string" || !PACKAGE.test(raw.packageName) || (raw.packageVersion !== undefined && (typeof raw.packageVersion !== "string" || !raw.packageVersion)) || !knownKeys(raw, ["id", "kind", "scopes", "targets", "entryPoints", "packageName", "packageVersion"])) {
    diagnostics.push(error("FEATURE_PROVIDER_INVALID", "Package provider must declare an npm package name and supported metadata only.", feature.id, path)); return;
  }
  return { id: raw.id, kind: "package", packageName: raw.packageName, ...(typeof raw.packageVersion === "string" ? { packageVersion: raw.packageVersion } : {}), scopes, targets: raw.targets as string[], entryPoints: raw.entryPoints as FeatureEntryPoints };
}

export function validateFeatureRegistryDocument(input: unknown): { valid: boolean; diagnostics: FeatureDiagnostic[]; value?: FeatureRegistryDocumentV1 } {
  const diagnostics: FeatureDiagnostic[] = [];
  if (!object(input)) return { valid: false, diagnostics: [error("FEATURE_REGISTRY_INVALID", "Feature registry must be an object.")] };
  if (input.schemaVersion !== FEATURE_REGISTRY_SCHEMA_VERSION) return { valid: false, diagnostics: [error("FEATURE_REGISTRY_UNSUPPORTED_VERSION", "Unsupported feature registry schema version.", undefined, "schemaVersion")] };
  if (!knownKeys(input, ["schemaVersion", "features"]) || !Array.isArray(input.features) || input.features.length > 2000) return { valid: false, diagnostics: [error("FEATURE_REGISTRY_INVALID", "Feature registry has an invalid shape or exceeds its limit.")] };
  const seen = new Set<string>(), features: FeatureDescriptor[] = [];
  input.features.forEach((raw, i) => {
    const path = "features[" + i + "]";
    if (!object(raw) || typeof raw.id !== "string" || !ID.test(raw.id) || seen.has(raw.id)) { diagnostics.push(error(seen.has(String(raw && object(raw) ? raw.id : "")) ? "FEATURE_DUPLICATE_ID" : "FEATURE_ID_INVALID", "Feature requires a unique stable ID.", undefined, path)); return; }
    if (!scopesValid(raw.scopes) || !targets(raw.targets) || !["required", "default", "optional"].includes(String(raw.policy)) || !Array.isArray(raw.providers) || raw.providers.length === 0 || raw.providers.length > 32 || (raw.providerMode !== undefined && raw.providerMode !== "single" && raw.providerMode !== "all") || !knownKeys(raw, ["id", "scopes", "targets", "policy", "providers", "providerMode", "requires", "conflicts"])) { diagnostics.push(error("FEATURE_REGISTRY_INVALID", "Feature descriptor has invalid scopes, targets, policy or providers.", raw.id, path)); return; }
    seen.add(raw.id);
    const descriptor: FeatureDescriptor = { id: raw.id, scopes: raw.scopes as FeatureScope[], targets: raw.targets as string[], policy: raw.policy as FeaturePolicy, providers: [], providerMode: (raw.providerMode ?? "single") as ProviderMode };
    const providerIds = new Set<string>();
    raw.providers.forEach((p, j) => { const valid = validateProvider(p, descriptor, j, providerIds, diagnostics); if (valid) (descriptor.providers as FeatureProvider[]).push(valid); });
    if (new Set(descriptor.providers.map(p => p.kind)).size > 1) diagnostics.push(error("FEATURE_PROVIDER_INVALID", "One feature cannot mix built-in and package providers.", raw.id, path));
    const requires = raw.requires === undefined ? [] : raw.requires;
    const conflicts = raw.conflicts === undefined ? [] : raw.conflicts;
    if (!ids(requires) || !ids(conflicts) || requires.includes(raw.id) || conflicts.includes(raw.id) || requires.length > 256 || conflicts.length > 256) diagnostics.push(error("FEATURE_REGISTRY_INVALID", "Requirements and conflicts must be unique stable feature IDs without self references.", raw.id, path));
    else { if (requires.length) (descriptor as { requires?: readonly string[] }).requires = sorted(requires); if (conflicts.length) (descriptor as { conflicts?: readonly string[] }).conflicts = sorted(conflicts); }
    features.push(descriptor);
  });
  const byId = new Map(features.map(f => [f.id, f]));
  const providerOwners = new Map<string, string>();
  for (const f of features) for (const p of f.providers) {
    const owner = providerOwners.get(p.id);
    if (owner) diagnostics.push(error("FEATURE_PROVIDER_DUPLICATE_ID", "Provider ID " + p.id + " is already owned by feature " + owner + ".", f.id));
    else providerOwners.set(p.id, f.id);
  }
  for (const f of features) for (const id of [...(f.requires ?? []), ...(f.conflicts ?? [])]) if (!byId.has(id)) diagnostics.push(error("FEATURE_REGISTRY_INVALID", "Feature references unknown feature " + id + ".", f.id));
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string) => { if (visiting.has(id)) { diagnostics.push(error("FEATURE_REQUIREMENT_CYCLE", "Feature requirements contain a cycle at " + id + ".", id)); return; } if (visited.has(id)) return; visiting.add(id); for (const next of byId.get(id)?.requires ?? []) visit(next); visiting.delete(id); visited.add(id); };
  for (const id of byId.keys()) visit(id);
  return diagnostics.length ? { valid: false, diagnostics } : { valid: true, diagnostics: [], value: { schemaVersion: 1, features: sorted([...byId.keys()]).map(id => byId.get(id)!) } };
}

function validateFeatureIds(value: unknown, path: string, diagnostics: FeatureDiagnostic[]): string[] | undefined {
  if (value === undefined) return [];
  if (!ids(value) || value.length > 2000) { diagnostics.push(error("FEATURE_CONFIGURATION_INVALID", "Expected a unique array of stable feature IDs.", undefined, path)); return; }
  return sorted(value);
}

export function validateProjectFeatureConfiguration(input: unknown): { valid: boolean; diagnostics: FeatureDiagnostic[]; value?: ProjectFeatureConfigurationV1 } {
  const diagnostics: FeatureDiagnostic[] = [];
  if (!object(input)) return { valid: false, diagnostics: [error("FEATURE_CONFIGURATION_INVALID", "Project feature configuration must be an object.")] };
  if (input.schemaVersion !== 1) return { valid: false, diagnostics: [error("FEATURE_CONFIGURATION_UNSUPPORTED_VERSION", "Unsupported project feature configuration schema version.", undefined, "schemaVersion")] };
  if (!knownKeys(input, ["schemaVersion", "enabledFeatureIds", "disabledFeatureIds", "targetOverrides"])) diagnostics.push(error("FEATURE_CONFIGURATION_INVALID", "Project feature configuration contains unknown properties."));
  const enabled = validateFeatureIds(input.enabledFeatureIds, "enabledFeatureIds", diagnostics);
  const disabled = validateFeatureIds(input.disabledFeatureIds, "disabledFeatureIds", diagnostics);
  if (enabled && disabled && enabled.some(id => disabled.includes(id))) diagnostics.push(error("FEATURE_CONFIGURATION_INVALID", "A feature cannot be both enabled and disabled at project scope."));
  const overrides: ProjectTargetOverrideV1[] = [];
  if (input.targetOverrides !== undefined) {
    if (!Array.isArray(input.targetOverrides) || input.targetOverrides.length > 128) diagnostics.push(error("FEATURE_CONFIGURATION_INVALID", "targetOverrides must be an array of at most 128 entries."));
    else {
      const seen = new Set<string>();
      input.targetOverrides.forEach((v, i) => {
        const path = "targetOverrides[" + i + "]";
        if (!object(v) || typeof v.target !== "string" || !ID.test(v.target) || seen.has(String(v.target)) || !knownKeys(v, ["target", "enabledFeatureIds", "disabledFeatureIds"])) { diagnostics.push(error("FEATURE_CONFIGURATION_INVALID", "Target override requires a unique target ID and supported fields.", undefined, path)); return; }
        seen.add(v.target);
        const e = validateFeatureIds(v.enabledFeatureIds, path + ".enabledFeatureIds", diagnostics);
        const d = validateFeatureIds(v.disabledFeatureIds, path + ".disabledFeatureIds", diagnostics);
        if (e && d && e.some(id => d.includes(id))) diagnostics.push(error("FEATURE_CONFIGURATION_INVALID", "A feature cannot be enabled and disabled in one target override.", undefined, path));
        if (e && d) overrides.push({ target: v.target, ...(e.length ? { enabledFeatureIds: e } : {}), ...(d.length ? { disabledFeatureIds: d } : {}) });
      });
    }
  }
  if (diagnostics.length || !enabled || !disabled) return { valid: false, diagnostics };
  const value: ProjectFeatureConfigurationV1 = { schemaVersion: 1, enabledFeatureIds: enabled, ...(disabled.length ? { disabledFeatureIds: disabled } : {}), ...(overrides.length ? { targetOverrides: overrides.sort((a,b) => a.target.localeCompare(b.target)) } : {}) };
  return { valid: true, diagnostics: [], value };
}

export function validateInstalledFeaturePackages(input: unknown): { valid: boolean; diagnostics: FeatureDiagnostic[]; value?: readonly InstalledFeaturePackage[] } {
  const diagnostics: FeatureDiagnostic[] = [];
  if (!Array.isArray(input) || input.length > 10000) return { valid: false, diagnostics: [error("FEATURE_PACKAGE_SNAPSHOT_INVALID", "Installed package inventory must be an array of at most 10,000 entries.")] };
  const seen = new Set<string>();
  const value: InstalledFeaturePackage[] = [];
  input.forEach((p, i) => {
    const path = "installedPackages[" + i + "]";
    if (!object(p) || typeof p.id !== "string" || !ID.test(p.id) || seen.has(String(p.id)) || typeof p.name !== "string" || !PACKAGE.test(p.name) || typeof p.version !== "string" || !p.version || typeof p.compatible !== "boolean" || !scopesValid(p.scopes) || !targets(p.targets) || !knownKeys(p, ["id", "name", "version", "scopes", "targets", "compatible"])) { diagnostics.push(error("FEATURE_PACKAGE_SNAPSHOT_INVALID", "Package snapshot is invalid or duplicated.", undefined, path)); return; }
    seen.add(p.id);
    value.push({ id: p.id, name: p.name, version: p.version, scopes: p.scopes as FeatureScope[], targets: p.targets as string[], compatible: p.compatible });
  });
  return diagnostics.length ? { valid: false, diagnostics } : { valid: true, diagnostics: [], value: value.sort((a,b) => a.id.localeCompare(b.id)) };
}

export function serializeProjectFeatureConfiguration(input: ProjectFeatureConfigurationV1): string {
  const parsed = validateProjectFeatureConfiguration(input);
  if (!parsed.valid || !parsed.value) throw new TypeError(parsed.diagnostics.map(d => d.message).join(" "));
  return JSON.stringify(parsed.value, null, 2) + "\n";
}
export function parseProjectFeatureConfiguration(json: string) {
  try { return validateProjectFeatureConfiguration(JSON.parse(json) as unknown); }
  catch { return { valid: false, diagnostics: [error("FEATURE_CONFIGURATION_INVALID", "Project feature configuration is not valid JSON.")] }; }
}
export function serializeFeatureRegistryDocument(input: FeatureRegistryDocumentV1): string {
  const parsed = validateFeatureRegistryDocument(input);
  if (!parsed.valid || !parsed.value) throw new TypeError(parsed.diagnostics.map(d => d.message).join(" "));
  return JSON.stringify(parsed.value, null, 2) + "\n";
}
export function parseFeatureRegistryDocument(json: string) {
  try { return validateFeatureRegistryDocument(JSON.parse(json) as unknown); }
  catch { return { valid: false, diagnostics: [error("FEATURE_REGISTRY_INVALID", "Feature registry is not valid JSON.")] }; }
}
export function targetSupports(values: readonly string[], target: string): boolean { return supports(values, target); }

export function resolveFeatureSelection(input: ResolveFeatureSelectionInput): FeatureSelectionReport {
  const diagnostics: FeatureDiagnostic[] = [];
  const registry = validateFeatureRegistryDocument(input.registry), project = validateProjectFeatureConfiguration(input.project), packages = validateInstalledFeaturePackages(input.installedPackages);
  if (!registry.valid) diagnostics.push(...registry.diagnostics);
  if (!project.valid) diagnostics.push(...project.diagnostics);
  if (!packages.valid) diagnostics.push(...packages.diagnostics);
  if (!FEATURE_SCOPES.includes(input.scope) || !ID.test(input.target)) diagnostics.push(error("FEATURE_REGISTRY_INVALID", "Target or scope is invalid.", undefined, undefined, input.target));
  if (!registry.value || !project.value || !packages.value || diagnostics.length) return { valid: false, schemaVersion: 1, target: input.target, scope: input.scope, diagnostics, features: [], requestedFeatureIds: [], includedFeatureIds: [], excludedFeatureIds: [], buildAnalysisFeatures: [] };
  const definitions = registry.value.features;
  const byId = new Map(definitions.map(f => [f.id, f]));
  const binding = new Map<string,string>();
  for (const b of input.providerBindings ?? []) {
    if (!object(b) || typeof b.providerId !== "string" || !ID.test(b.providerId) || typeof b.packageInstanceId !== "string" || !ID.test(b.packageInstanceId) || binding.has(b.providerId) || !definitions.some(f => f.providers.some(p => p.id === b.providerId && p.kind === "package"))) diagnostics.push(error("FEATURE_PROVIDER_BINDING_INVALID", "Provider binding must reference one declared package provider and one unique package instance."));
    else binding.set(b.providerId, b.packageInstanceId);
  }
  const override = project.value.targetOverrides?.find(o => o.target === input.target);
  const targetEnabled = new Set(override?.enabledFeatureIds ?? []), targetDisabled = new Set(override?.disabledFeatureIds ?? []);
  for (const id of [...project.value.enabledFeatureIds, ...(project.value.disabledFeatureIds ?? []), ...targetEnabled, ...targetDisabled]) if (!byId.has(id)) diagnostics.push(error("FEATURE_CONFIGURATION_UNKNOWN_FEATURE", "Project configuration references unknown feature " + id + ".", id));
  interface State { descriptor: FeatureDescriptor; enabled: boolean; source: FeatureSelectionSource; providers: FeatureProviderResolution[]; selectedProviderPackageIds: string[]; available: boolean; included: boolean; requiredBy: Set<string>; reason?: FeatureExclusionReason }
  const states = new Map<string, State>();
  const installed = packages.value;
  for (const f of definitions) {
    const projectOn = project.value.enabledFeatureIds.includes(f.id), projectOff = project.value.disabledFeatureIds?.includes(f.id) ?? false;
    let enabled = f.policy === "required" || f.policy === "default", source: FeatureSelectionSource = f.policy === "required" ? "required-policy" : f.policy === "default" ? "default-policy" : "disabled";
    if (projectOn) { enabled = true; source = "project-selection"; }
    if (projectOff) { enabled = false; source = "disabled"; }
    if (targetEnabled.has(f.id)) { enabled = true; source = "target-override"; }
    if (targetDisabled.has(f.id)) { enabled = false; source = "disabled"; }
    if (f.policy === "required" && !enabled) diagnostics.push(error("FEATURE_REQUIREMENT_DISABLED", "Required feature cannot be disabled.", f.id, undefined, input.target));
    const providers: FeatureProviderResolution[] = f.providers.map(p => {
      if (p.kind === "builtin") return { providerId: p.id, kind: p.kind, status: !p.scopes.includes(input.scope) ? "scope-unsupported" : !supports(p.targets, input.target) ? "target-unsupported" : "available", packageInstanceIds: [], entryPoints: p.entryPoints };
      const matches = installed.filter(x => x.name === p.packageName && (p.packageVersion === undefined || x.version === p.packageVersion));
      const scoped = matches.filter(x => x.scopes.includes(input.scope));
      const targetMatches = scoped.filter(x => supports(x.targets, input.target));
      const compatible = targetMatches.filter(x => x.compatible);
      const bound = binding.get(p.id);
      const chosen = bound ? compatible.filter(x => x.id === bound) : compatible;
      let status: FeatureProviderResolution["status"] = "available";
      if (!matches.length) status = "missing-package";
      else if (!scoped.length) status = "scope-unsupported";
      else if (!targetMatches.length) status = "target-unsupported";
      else if (!compatible.length) status = "incompatible";
      else if (bound && !chosen.length) status = "binding-invalid";
      else if (!bound && chosen.length > 1) status = "ambiguous-package-instance";
      return { providerId: p.id, kind: p.kind, status, packageInstanceIds: chosen.map(x => x.id), packageName: p.packageName, entryPoints: p.entryPoints } as FeatureProviderResolution;
    });
    const hasExplicitProviderBinding = f.providers.some(p => binding.has(p.id));
    const relevant = providers.filter(p => p.status === "available" && (f.providerMode === "all" || !hasExplicitProviderBinding || binding.has(p.providerId)));
    const selectedProviderPackageIds = sorted(relevant.flatMap(p => p.packageInstanceIds));
    const builtin = f.providers[0]?.kind === "builtin";
    const providerAmbiguous = !builtin && f.providerMode !== "all" && relevant.length > 1;
    const bindingInvalid = providers.some(p => p.status === "binding-invalid");
    const providerAvailable = builtin ? relevant.length === f.providers.length : relevant.length > 0 && (f.providerMode === "all" ? relevant.length === f.providers.length : relevant.length === 1) && !bindingInvalid;
    const scopeOk = f.scopes.includes(input.scope), targetOk = supports(f.targets, input.target);
    const available = providerAvailable && scopeOk && targetOk;
    states.set(f.id, { descriptor:f, enabled, source, providers, selectedProviderPackageIds, available, included:false, requiredBy:new Set(), ...(!scopeOk ? {reason:"scope-unsupported" as const} : !targetOk ? {reason:"target-unsupported" as const} : !providerAvailable ? {reason:providers.some(p => p.status === "incompatible") ? "provider-incompatible" as const : (providerAmbiguous || providers.some(p => p.status === "ambiguous-package-instance")) ? "provider-ambiguous" as const : "provider-missing" as const} : !enabled ? {reason:"not-enabled" as const} : {}) });
    if (enabled && !targetOk) diagnostics.push(error("FEATURE_TARGET_UNSUPPORTED", "Feature " + f.id + " does not support target " + input.target + ".", f.id, undefined, input.target));
    if (enabled && scopeOk && targetOk && bindingInvalid) diagnostics.push(error("FEATURE_PROVIDER_BINDING_INVALID", "An explicit provider binding does not match an installed compatible package instance.", f.id));
    if (enabled && scopeOk && targetOk && !providerAvailable && !bindingInvalid) {
      const code: FeatureDiagnosticCode = providers.some(p => p.status === "scope-unsupported") ? "FEATURE_SCOPE_UNSUPPORTED"
        : providers.some(p => p.status === "target-unsupported") ? "FEATURE_TARGET_UNSUPPORTED"
        : providers.some(p => p.status === "incompatible") ? "FEATURE_PROVIDER_INCOMPATIBLE"
        : providerAmbiguous || providers.some(p => p.status === "ambiguous-package-instance") ? "FEATURE_PROVIDER_AMBIGUOUS"
        : "FEATURE_PROVIDER_MISSING";
      diagnostics.push(error(code, "Feature " + f.id + " has no unambiguous available provider for " + input.target + "/" + input.scope + ".", f.id, undefined, input.target));
    }
  }
  const visiting = new Set<string>(), included = new Set<string>();
  const visit = (id: string, root: string) => {
    const state = states.get(id);
    if (!state) return;
    state.requiredBy.add(root);
    if (visiting.has(id)) { diagnostics.push(error("FEATURE_REQUIREMENT_CYCLE", "Feature dependency cycle at " + id + ".", id)); return; }
    if (included.has(id)) return;
    if (targetDisabled.has(id) || (project.value!.disabledFeatureIds ?? []).includes(id)) { diagnostics.push(error("FEATURE_REQUIREMENT_DISABLED", "Feature " + id + " is required by " + root + " but explicitly disabled.", id)); state.reason = "required-dependency-disabled"; if (root !== id) states.get(root)!.reason = "required-dependency-disabled"; return; }
    if (!state.descriptor.scopes.includes(input.scope) || !supports(state.descriptor.targets, input.target) || !state.available) { diagnostics.push(error("FEATURE_REQUIREMENT_MISSING", "Required feature " + id + " is unavailable for " + input.target + "/" + input.scope + ".", id)); state.reason = "dependency-unavailable"; if (root !== id) states.get(root)!.reason = "dependency-unavailable"; return; }
    visiting.add(id);
    for (const dependency of state.descriptor.requires ?? []) visit(dependency, root);
    visiting.delete(id);
    if (!diagnostics.some(d => d.severity === "error" && d.featureId === id)) { included.add(id); state.included = true; if (id !== root) { state.enabled = true; state.source = "dependency"; } }
  };
  const requested = [...states.values()].filter(s => s.enabled && s.descriptor.scopes.includes(input.scope) && supports(s.descriptor.targets,input.target)).map(s => s.descriptor.id).sort();
  for (const id of requested) visit(id, id);
  const conflictingPairs = new Map<string, readonly [string, string]>();
  for (const id of included) for (const conflict of states.get(id)?.descriptor.conflicts ?? []) {
    if (!included.has(conflict)) continue;
    const pair = [id, conflict].sort((a, b) => a.localeCompare(b)) as [string, string];
    conflictingPairs.set(pair.join("\\0"), pair);
  }
  for (const [left, right] of conflictingPairs.values()) {
    diagnostics.push(error("FEATURE_CONFLICT", "Selected features " + left + " and " + right + " conflict.", left));
    states.get(left)!.reason = "conflict";
    states.get(right)!.reason = "conflict";
    states.get(left)!.included = false;
    states.get(right)!.included = false;
    included.delete(left);
    included.delete(right);
  }
  const valid = diagnostics.length === 0;
  const featureStates: FeatureSelectionState[] = definitions.map(f => {
    const s = states.get(f.id)!;
    const chosen = s.providers.flatMap(p => p.packageInstanceIds);
    const packageInstalled = f.providers[0]?.kind === "builtin" ? null : installed.some(p => f.providers.some(v => v.kind === "package" && v.packageName === p.name));
    return { id:f.id, packageInstalled, provided:s.descriptor.providers.length > 0, available:s.available, enabled:s.enabled, includedInTarget:valid && s.included, activation:"not-managed", selectionSource:s.source, requiredBy:sorted([...s.requiredBy]), providers:s.providers, ...(s.reason ? {exclusionReason:s.reason} : {}) };
  });
  const buildAnalysisFeatures: ProjectBuildFeatureSnapshot[] = definitions.map(f => {
    const s = states.get(f.id)!, selected = valid && s.included;
    const provider = f.providers[0]!;
    const ids = s.selectedProviderPackageIds;
    return { id:f.id, providerKind:provider.kind, ...(provider.kind === "package" ? ids.length === 1 ? {providerPackageId:ids[0]!} : {providerPackageIds:ids} : {}), selected, available:s.available, targetCompatible:s.available };
  });
  const finalIncluded = valid ? included : new Set<string>();
  return { valid, schemaVersion:1, target:input.target, scope:input.scope, diagnostics, features:featureStates, requestedFeatureIds:requested, includedFeatureIds:sorted([...finalIncluded]), excludedFeatureIds:definitions.map(f => f.id).filter(id => !finalIncluded.has(id)).sort(), buildAnalysisFeatures };
}

export function createOptionalRuntimeFeatureRegistry(): FeatureRegistryDocumentV1 {
  const provider = (id: string, packageName: string): PackageProvider => ({ id, kind:"package", packageName, scopes:["runtime"], targets:["web"], entryPoints:{ runtime:"." } });
  return { schemaVersion:1, features:[
    { id:"runtime.phaser", scopes:["runtime"], targets:["web"], policy:"optional", providers:[provider("provider.runtime-phaser","@codogma/runtime-phaser")] },
    { id:"runtime.ecs", scopes:["runtime"], targets:["web"], policy:"optional", providers:[provider("provider.ecs","@codogma/ecs")] },
    { id:"runtime.ecs-phaser", scopes:["runtime"], targets:["web"], policy:"optional", providers:[provider("provider.ecs-phaser","@codogma/ecs-phaser")], requires:["runtime.ecs","runtime.phaser"] }
  ] };
}
