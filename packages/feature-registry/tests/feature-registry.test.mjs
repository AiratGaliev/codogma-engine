import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  createOptionalRuntimeFeatureRegistry, parseFeatureRegistryDocument, parseProjectFeatureConfiguration,
  resolveFeatureSelection, serializeProjectFeatureConfiguration, validateFeatureRegistryDocument,
  validateProjectFeatureConfiguration
} from "../dist/index.js";

const registry = createOptionalRuntimeFeatureRegistry();
const pkg = (id, name, scopes=["runtime"], targets=["web"], compatible=true) => ({id,name,version:"0.1.0",scopes,targets,compatible});
const project = (enabledFeatureIds=[], disabledFeatureIds=[], targetOverrides=[]) => ({schemaVersion:1,enabledFeatureIds,disabledFeatureIds,targetOverrides});
const packages = [pkg("p-phaser","@codogma/runtime-phaser"),pkg("p-ecs","@codogma/ecs"),pkg("p-bridge","@codogma/ecs-phaser")];
const resolve = (p, pkgs=packages, bindings=[]) => resolveFeatureSelection({registry,project:p,installedPackages:pkgs,target:"web",scope:"runtime",providerBindings:bindings});

test("checked-in optional runtime registry fixture validates", () => {
 const input=JSON.parse(readFileSync(join(process.cwd(),"tests/fixtures/optional-runtime-registry-v1.json"),"utf8"));
 assert.equal(validateFeatureRegistryDocument(input).valid,true);
});
test("ECS-Phaser selection expands dependency closure to ECS and base Phaser", () => {
 const r=resolve(project(["runtime.ecs-phaser"]));
 assert.equal(r.valid,true,JSON.stringify(r.diagnostics));
 assert.deepEqual(r.includedFeatureIds,["runtime.ecs","runtime.ecs-phaser","runtime.phaser"]);
 assert.equal(r.buildAnalysisFeatures.find(x=>x.id==="runtime.ecs-phaser")?.providerPackageId,"p-bridge");
});
test("missing provider is a blocking diagnostic and is not included", () => {
 const r=resolve(project(["runtime.ecs"]),packages.filter(x=>x.name!=="@codogma/ecs"));
 assert.equal(r.valid,false);
 assert.ok(r.diagnostics.some(x=>x.code==="FEATURE_PROVIDER_MISSING"));
 assert.deepEqual(r.includedFeatureIds,[]);
});
test("installing ECS does not enable the ECS-Phaser bridge", () => {
 const r=resolve(project(["runtime.ecs"]),packages);
 assert.equal(r.valid,true);
 assert.deepEqual(r.includedFeatureIds,["runtime.ecs"]);
});
test("editor-only feature is unavailable for a runtime target", () => {
 const r=resolveFeatureSelection({registry:{schemaVersion:1,features:[{id:"editor.inspector",scopes:["editor"],targets:["web"],policy:"optional",providers:[{id:"builtin.inspector",kind:"builtin",scopes:["editor"],targets:["web"],entryPoints:{editor:"codogma:inspector"}}]}]},project:project(["editor.inspector"]),installedPackages:[],target:"web",scope:"runtime"});
 assert.equal(r.valid,false);
 assert.ok(r.diagnostics.some(x=>x.code==="FEATURE_SCOPE_UNSUPPORTED"));
});
test("target override selects a feature without mutating project-level configuration", () => {
 const input=project([],[],[{target:"web",enabledFeatureIds:["runtime.phaser"]}]);
 const before=JSON.stringify(input), r=resolve(input);
 assert.equal(r.valid,true);
 assert.deepEqual(r.includedFeatureIds,["runtime.phaser"]);
 assert.equal(JSON.stringify(input),before);
});
test("required feature cannot be explicitly disabled", () => {
 const r=resolveFeatureSelection({registry:{schemaVersion:1,features:[{id:"runtime.core",scopes:["runtime"],targets:["web"],policy:"required",providers:[{id:"builtin.core",kind:"builtin",scopes:["runtime"],targets:["web"],entryPoints:{runtime:"codogma:core"}}]}]},project:project([],["runtime.core"]),installedPackages:[],target:"web",scope:"runtime"});
 assert.equal(r.valid,false);
 assert.ok(r.diagnostics.some(x=>x.code==="FEATURE_REQUIREMENT_DISABLED"));
});
test("conflicting selected features fail deterministically", () => {
 const r=resolveFeatureSelection({registry:{schemaVersion:1,features:[
  {id:"runtime.a",scopes:["runtime"],targets:["web"],policy:"optional",providers:[{id:"builtin.a",kind:"builtin",scopes:["runtime"],targets:["web"],entryPoints:{runtime:"codogma:a"}}],conflicts:["runtime.b"]},
  {id:"runtime.b",scopes:["runtime"],targets:["web"],policy:"optional",providers:[{id:"builtin.b",kind:"builtin",scopes:["runtime"],targets:["web"],entryPoints:{runtime:"codogma:b"}}],conflicts:["runtime.a"]}
 ]},project:project(["runtime.a","runtime.b"]),installedPackages:[],target:"web",scope:"runtime"});
 assert.equal(r.valid,false);
 assert.ok(r.diagnostics.some(x=>x.code==="FEATURE_CONFLICT"));
});
test("ambiguous package instances require an exact provider binding", () => {
 const two=[pkg("p1","@codogma/runtime-phaser"),pkg("p2","@codogma/runtime-phaser")];
 assert.equal(resolve(project(["runtime.phaser"]),two).diagnostics[0]?.code,"FEATURE_PROVIDER_AMBIGUOUS");
 const r=resolve(project(["runtime.phaser"]),two,[{providerId:"provider.runtime-phaser",packageInstanceId:"p2"}]);
 assert.equal(r.valid,true,JSON.stringify(r.diagnostics));
 assert.equal(r.buildAnalysisFeatures.find(x=>x.id==="runtime.phaser")?.providerPackageId,"p2");
});
test("all provider mode composes all exact providers", () => {
 const r=resolveFeatureSelection({registry:{schemaVersion:1,features:[{id:"runtime.multi",scopes:["runtime"],targets:["web"],policy:"optional",providerMode:"all",providers:[
  {id:"p-a",kind:"package",packageName:"@codogma/runtime-phaser",scopes:["runtime"],targets:["web"],entryPoints:{runtime:"."}},
  {id:"p-b",kind:"package",packageName:"@codogma/ecs",scopes:["runtime"],targets:["web"],entryPoints:{runtime:"."}}
 ]}]},project:project(["runtime.multi"]),installedPackages:packages,target:"web",scope:"runtime"});
 assert.equal(r.valid,true,JSON.stringify(r.diagnostics));
 assert.deepEqual(r.buildAnalysisFeatures[0]?.providerPackageIds,["p-ecs","p-phaser"]);
});
test("incompatible providers are not reported as available", () => {
 const r=resolve(project(["runtime.ecs"]),[pkg("p-ecs","@codogma/ecs",["runtime"],["web"],false)]);
 assert.equal(r.valid,false);
 assert.ok(r.diagnostics.some(x=>x.code==="FEATURE_PROVIDER_INCOMPATIBLE"));
});
test("provider scopes and targets cannot widen feature constraints", () => {
 const r=validateFeatureRegistryDocument({schemaVersion:1,features:[{id:"runtime.a",scopes:["runtime"],targets:["web"],policy:"optional",providers:[{id:"provider.a",kind:"builtin",scopes:["runtime","editor"],targets:["*"],entryPoints:{runtime:"codogma:a",editor:"codogma:a"}}]}]});
 assert.equal(r.valid,false);
});
test("unknown requirements and dependency cycles are rejected", () => {
 const unknown=validateFeatureRegistryDocument({schemaVersion:1,features:[{id:"runtime.a",scopes:["runtime"],targets:["web"],policy:"optional",providers:[{id:"p-a",kind:"builtin",scopes:["runtime"],targets:["web"],entryPoints:{runtime:"codogma:a"}}],requires:["runtime.missing"]}]});
 assert.equal(unknown.valid,false);
 const cycle=validateFeatureRegistryDocument({schemaVersion:1,features:[
  {id:"runtime.a",scopes:["runtime"],targets:["web"],policy:"optional",providers:[{id:"p-a",kind:"builtin",scopes:["runtime"],targets:["web"],entryPoints:{runtime:"codogma:a"}}],requires:["runtime.b"]},
  {id:"runtime.b",scopes:["runtime"],targets:["web"],policy:"optional",providers:[{id:"p-b",kind:"builtin",scopes:["runtime"],targets:["web"],entryPoints:{runtime:"codogma:b"}}],requires:["runtime.a"]}
 ]});
 assert.ok(cycle.diagnostics.some(x=>x.code==="FEATURE_REQUIREMENT_CYCLE"));
});
test("project configuration rejects duplicate/contradictory selection and round trips deterministically", () => {
 const invalid=validateProjectFeatureConfiguration({schemaVersion:1,enabledFeatureIds:["runtime.a","runtime.a"],disabledFeatureIds:["runtime.a"]});
 assert.equal(invalid.valid,false);
 const fixture=JSON.parse(readFileSync(join(process.cwd(),"tests/fixtures/project-features-v1.json"),"utf8"));
 const parsed=validateProjectFeatureConfiguration(fixture);
 assert.equal(parsed.valid,true);
 assert.equal(serializeProjectFeatureConfiguration(parsed.value),serializeProjectFeatureConfiguration(JSON.parse(serializeProjectFeatureConfiguration(parsed.value))));
 assert.equal(parseProjectFeatureConfiguration(serializeProjectFeatureConfiguration(parsed.value)).valid,true);
});
test("registry and project parsers return structured JSON diagnostics", () => {
 assert.equal(parseFeatureRegistryDocument("{").valid,false);
 assert.equal(parseProjectFeatureConfiguration("{").valid,false);
});
