// Stage 1-2 (inventory + import) of the Prompt Maestro's pipeline
// (`Prompt_maestro_compilador_y_laboratorio_mapas.md` §6): locate the eight
// source files under datasets/, hash them, parse each preserving every
// original column (codes/ids as strings, never numbers -- leading zeros and
// letter suffixes matter for ICD codes).
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsvFile } from './lib/csv.js';
import { sha256File } from './lib/hash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The curated CSVs live in this repository's own `datasets/` folder, next
// to `map-v2/` -- resolved relative to this file so the repo works wherever
// it is cloned. MAP_V2_SOURCE_DIR overrides it (e.g. to compile a scratch
// copy of the datasets without touching the tracked ones).
const REPO_ROOT = join(__dirname, '..', '..');
export const SOURCE_DIR = process.env.MAP_V2_SOURCE_DIR ? resolve(process.env.MAP_V2_SOURCE_DIR) : join(REPO_ROOT, 'datasets');

// Paths recorded in the manifest are relative to the repo root, forward
// slashes -- an absolute path would differ on every machine and change the
// manifest without any real change in the map.
function repoRelative(path) {
  return relative(REPO_ROOT, path).replace(/\\/g, '/') || '.';
}

// File name -> logical name used everywhere else in the compiler.
export const SOURCE_FILES = {
  stems: 'icd11_stem_defaults.csv',
  icd10Domains: 'ICD10_domains.csv',
  anatomyMapping: 'anatomy_mapping.csv',
  anatomyRelations: 'anatomy_relations.csv',
  rules: 'rules.csv',
  anatomyTreeIcd10: 'icd11_anatomy_tree_icd10.csv',
  histopathologyAxis: 'ICD11_histopathology_axis.csv',
  icdoTopoGroups: 'icdo_topo_groups.csv',
  // Extracted 2026-09-22 from ICD10_domains.csv's own inclusion/exclusion
  // columns (JSON-array-as-text inside a CSV cell -- doble serialización);
  // now a long-format table (code;kind;note) so a normal CSV reader (and
  // the OMS, if this ever gets shared with them) doesn't need to know
  // there was JSON hiding inside a cell.
  icd10DomainNotes: 'icd10_domain_notes.csv',
};

// Reference label tables `map-v2` itself authored from official WHO
// tabular sources (ICD-O-3.1 PDF + ICD-O-4 Excel, see sources/icdo3.2/README.md
// and sources/icdo4/) -- NOT part of the 8 immutable Datasets/final files,
// tracked with their own provenance in the manifest so that distinction
// never gets blurred.
const REFERENCE_DIR = join(__dirname, '..', 'sources');
export const REFERENCE_FILES = {
  icdo3TopographyLabels: join('icdo3.2', 'icdo3_topography_labels.csv'),
  icdo4MorphologyLabels: join('icdo4', 'icdo4_morphology_labels.csv'),
  // Every term of the ICD-O-4 tabular's "a) Morphology" sheet with its own
  // Level (Preferred/Synonym/Related), not just the Preferred one -- lets
  // the resolver show the term that actually names the selected ICD-11
  // histology when that is a Synonym/Related term of the code (curation
  // 2026-10: 95060/1 Preferred is "Sellar neurocytoma", the ICD-11 entity
  // is "Central neurocytoma", a Related term of the same code).
  icdo4MorphologyTerms: join('icdo4', 'icdo4_morphology_terms.csv'),
};

export function importSources() {
  const sourceManifest = { generatedAt: new Date().toISOString(), sourceDir: repoRelative(SOURCE_DIR), files: {}, referenceDir: repoRelative(REFERENCE_DIR), referenceFiles: {} };
  const data = {};
  for (const [key, filename] of Object.entries(SOURCE_FILES)) {
    const path = join(SOURCE_DIR, filename);
    const hash = sha256File(path);
    const { headers, records } = parseCsvFile(path);
    data[key] = records;
    sourceManifest.files[key] = { filename, sha256: hash, rowCount: records.length, headers };
  }
  for (const [key, relPath] of Object.entries(REFERENCE_FILES)) {
    const path = join(REFERENCE_DIR, relPath);
    const hash = sha256File(path);
    const { headers, records } = parseCsvFile(path);
    data[key] = records;
    sourceManifest.referenceFiles[key] = { filename: relPath, sha256: hash, rowCount: records.length, headers };
  }
  return { data, sourceManifest };
}
