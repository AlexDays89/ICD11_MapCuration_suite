#!/usr/bin/env node
// Orchestrator (Prompt Maestro §6, stages 1-7: inventory -> import ->
// normalize -> validate -> integrate -> materialize -> emit). Stage 8
// (probar y comparar) is `test/run-cases.mjs`, run separately.
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importSources } from './import.js';
import { normalize } from './normalize.js';
import { materialize } from './materialize.js';
import { buildTriples } from './emit/triples.js';
import { toTurtle } from './emit/ttl.js';
import { toRdfXml } from './emit/rdf.js';
import { toYamlDocument } from './emit/yaml.js';
import { sha256Text } from './lib/hash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
mkdirSync(DIST, { recursive: true });

const MAP_VERSION = `v2.0-compiler-${new Date().toISOString().slice(0, 10)}`;

const meta = {
  schemaVersion: '1',
  version: MAP_VERSION,
  generatedAt: new Date().toISOString(),
  releases: {
    icd11: { linearization: 'mms', release: '2026-01', language: 'es' },
    icd10: { edition: '2019', variant: 'WHO', language: 'en' },
    icdo3: { edition: '3.2', sourceRef: null },
    icdo4: { edition: '4', sourceRef: null },
  },
};

console.log('== 1-2. Inventario + Importación ==');
const { data: raw, sourceManifest } = importSources();
for (const [k, v] of Object.entries(sourceManifest.files)) {
  console.log(`  ${k}: ${v.filename} (${v.rowCount} filas, sha256 ${v.sha256.slice(0, 12)}...)`);
}

console.log('== 3-4. Normalizar + validar ==');
const model = normalize(raw);
console.log(`  stems: ${model.stemsByCode.size} con código, ${model.stemsByFoundationUri.size} con Foundation URI`);
console.log(`  anatomyByCode: ${model.anatomyByCode.size}`);
console.log(`  anatomyRelationsByCode: ${model.anatomyRelationsByCode.size} códigos, ${[...model.anatomyRelationsByCode.values()].reduce((a, r) => a + r.length, 0)} filas`);
console.log(`  rulesByKey: ${model.rulesByKey.size}`);
console.log(`  anatomyTreeByExtension: ${model.anatomyTreeByExtension.size}`);
console.log(`  histologyByCode: ${model.histologyByCode.size}`);
console.log(`  icdoTopoByKey: ${model.icdoTopoByKey.size}`);
console.log(`  icd10Domains: ${model.icd10Domains.size}`);
if (model.problems.length) {
  console.log(`  PROBLEMAS detectados: ${model.problems.length}`);
  for (const p of model.problems.slice(0, 20)) console.log('   -', JSON.stringify(p));
}

console.log('== 5-6. Integrar + materializar ==');
const bundle = materialize(model, meta);

console.log('== 7. Emitir RDF/Turtle, RDF/XML, YAML, bundle JSON ==');
const triples = buildTriples(model);
const ttl = toTurtle(triples);
const rdfXml = toRdfXml(triples);

const normalizedYamlView = {
  schema_version: '1',
  map_version: MAP_VERSION,
  releases: meta.releases,
  authoring: {
    clinical_facts: 'source_csv',
    source_dir: sourceManifest.sourceDir,
    files: Object.fromEntries(Object.entries(sourceManifest.files).map(([k, v]) => [k, { filename: v.filename, sha256: v.sha256, rows: v.rowCount }])),
  },
  policies: {
    preserve_declared_terminal_fallback: true,
    unresolved_selected_specificity: 'pending_with_baseline',
    conflicting_equal_scope_rules: 'conflict',
    missing_target_version: 'pending_per_output',
  },
  profiles_alias_note:
    "domain 'ns' (nervous system) stems use family 'brain' when no dedicated meninges anatomy extension is postcoordinated; a meninges-specific extension code overrides the family to 'meninges' purely from its own anatomy_relations.csv profile -- see compiler/resolve.js effectiveFamily() and reports/gap-analysis.md.",
  rules_families_observed: [...model.rulesFamilies].sort(),
  counts: {
    stems_with_code: model.stemsByCode.size,
    anatomy_identities: model.anatomyByCode.size,
    anatomy_relation_rows: [...model.anatomyRelationsByCode.values()].reduce((a, r) => a + r.length, 0),
    rules: model.rulesByKey.size,
    anatomy_tree_terminal_mappings: [...model.anatomyTreeByExtension.values()].reduce((a, r) => a + r.length, 0),
    histology_extensions: model.histologyByCode.size,
    icdo_topo_groups: model.icdoTopoByKey.size,
    icd10_catalog_entries: model.icd10Domains.size,
  },
  problems: model.problems,
};
const yamlDoc = toYamlDocument(normalizedYamlView);

const bundleJson = JSON.stringify(bundle, null, 2);

writeFileSync(join(DIST, 'map.ttl'), ttl, 'utf8');
writeFileSync(join(DIST, 'map.rdf'), rdfXml, 'utf8');
writeFileSync(join(DIST, 'map.normalized.yaml'), yamlDoc, 'utf8');
writeFileSync(join(DIST, 'map.bundle.json'), bundleJson, 'utf8');
// Copy the pure resolver as-is next to the bundle so consumers (poc-coding-tool,
// laboratorio-mapas) load one file for data and one for logic, same pattern
// map2's own dist/resolver.js used.
copyFileSync(join(__dirname, 'resolve.js'), join(DIST, 'resolve.js'));

const manifest = {
  ...meta,
  sourceManifest,
  counts: normalizedYamlView.counts,
  problems: model.problems,
  outputHashes: {
    'map.ttl': sha256Text(ttl),
    'map.rdf': sha256Text(rdfXml),
    'map.normalized.yaml': sha256Text(yamlDoc),
    'map.bundle.json': sha256Text(bundleJson),
  },
};
writeFileSync(join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log('== listo ==');
console.log(`  dist/map.bundle.json: ${(bundleJson.length / 1024).toFixed(0)} KB`);
console.log(`  dist/map.ttl: ${(ttl.length / 1024).toFixed(0)} KB, ${triples.length} triples`);
console.log(`  dist/map.rdf: ${(rdfXml.length / 1024).toFixed(0)} KB`);
console.log(`  dist/manifest.json escrito.`);
