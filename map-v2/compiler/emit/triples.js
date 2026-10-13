// Builds ONE abstract triple list from the normalized model. Both
// emit/ttl.js and emit/rdf.js serialize THIS SAME array -- never re-derive
// triples independently -- so Turtle and RDF/XML can't diverge (Prompt
// Maestro §4: "Ambos deben representar el mismo grafo; no deben mantenerse
// a mano por separado").
//
// Local vocabulary (no published IRI exists for this project; minted here,
// documented, never presented as an external standard):
export const MAPV2 = 'http://icdmaps.local/map-v2#';

function uri(local) {
  return { value: MAPV2 + local, lit: false };
}
function lit(value, datatype) {
  return { value: String(value), lit: true, datatype };
}

export function buildTriples(model) {
  const triples = [];
  const add = (s, p, o) => triples.push({ s, p: uri(p), o });

  // ---- Stems -----------------------------------------------------------
  for (const [code, stem] of model.stemsByCode) {
    const s = uri(`stem/${encodeURIComponent(code)}`);
    add(s, 'type', uri('Stem'));
    add(s, 'code', lit(stem.code));
    if (stem.foundationUri) add(s, 'foundationUriObserved', lit(stem.foundationUri));
    if (stem.linearizationUri) add(s, 'linearizationUri', lit(stem.linearizationUri));
    if (stem.titleEn) add(s, 'titleEn', lit(stem.titleEn, 'xsd:string'));
    if (stem.origin) add(s, 'origin', lit(stem.origin));
    if (stem.behaviour) add(s, 'behaviour', lit(stem.behaviour));
    if (stem.domain) add(s, 'domain', lit(stem.domain));
    if (stem.subdomain) add(s, 'subdomain', lit(stem.subdomain));
    if (stem.family) add(s, 'family', lit(stem.family));
    if (stem.precoordinatedTopography) add(s, 'precoordinatedTopography', uri(`anatomy/${encodeURIComponent(stem.precoordinatedTopography)}`));
    if (stem.precoordinatedMorphology) add(s, 'precoordinatedMorphology', uri(`histology/${encodeURIComponent(stem.precoordinatedMorphology)}`));
    if (stem.icd10Default) add(s, 'icd10Default', lit(stem.icd10Default));
    add(s, 'icd10NeedsRefinement', lit(stem.icd10NeedsRefinement, 'xsd:boolean'));
    if (stem.icdo3TopographyDefault) add(s, 'icdo3TopographyDefault', lit(stem.icdo3TopographyDefault));
    if (stem.icdo3MorphologyCode) add(s, 'icdo3MorphologyCode', lit(stem.icdo3MorphologyCode));
    if (stem.icdo3BehaviourCode) add(s, 'icdo3BehaviourCode', lit(stem.icdo3BehaviourCode));
  }

  // ---- Anatomy extensions ------------------------------------------------
  for (const [code, anat] of model.anatomyByCode) {
    const s = uri(`anatomy/${encodeURIComponent(code)}`);
    add(s, 'type', uri('AnatomyExtension'));
    add(s, 'code', lit(anat.code));
    if (anat.foundationUri) add(s, 'foundationUriObserved', lit(anat.foundationUri));
    if (anat.classKind) add(s, 'classKind', lit(anat.classKind));
    add(s, 'isLeaf', lit(anat.isLeaf, 'xsd:boolean'));
    if (anat.icdoTopography32) add(s, 'icdoTopography32', lit(anat.icdoTopography32));
    for (const [behaviourKey, code10] of Object.entries(anat.candidate10)) {
      if (code10) add(s, `candidateIcd10_${behaviourKey}`, lit(code10));
    }
  }
  for (const [code, rows] of model.anatomyRelationsByCode) {
    const s = uri(`anatomy/${encodeURIComponent(code)}`);
    for (const row of rows) {
      // A blank-node-free flattening: one triple per (profile,node) pair,
      // literal-packed as "profile=node" -- keeps the graph queryable
      // without inventing intermediate resources this data doesn't need.
      add(s, 'hasProfileNode', lit(`${row.profile}=${row.node}`));
    }
  }

  // ---- Histology extensions ----------------------------------------------
  for (const [code, h] of model.histologyByCode) {
    const s = uri(`histology/${encodeURIComponent(code)}`);
    add(s, 'type', uri('HistologyExtension'));
    add(s, 'code', lit(h.code));
    if (h.titleEn) add(s, 'titleEn', lit(h.titleEn, 'xsd:string'));
    if (h.icdo3MorphoCode) add(s, 'icdo3MorphologyCode', lit(h.icdo3MorphoCode));
    if (h.icdo3BehaviourCode) add(s, 'icdo3BehaviourCode', lit(h.icdo3BehaviourCode));
    if (h.icdo4MorphoCode) add(s, 'icdo4MorphologyCode', lit(h.icdo4MorphoCode));
    if (h.icdo4BehaviourCode) add(s, 'icdo4BehaviourCode', lit(h.icdo4BehaviourCode));
  }

  // ---- Rules (conditional mapping rules, per §4.3 -- resources with
  // condition properties, never owl:sameAs/skos:exactMatch) --------------
  let ruleIndex = 0;
  for (const [key, rule] of model.rulesByKey) {
    ruleIndex += 1;
    const s = uri(`rule/${ruleIndex}`);
    add(s, 'type', uri('MappingRule'));
    add(s, 'ruleKey', lit(key));
    add(s, 'appliesToFamily', lit(rule.family));
    add(s, 'appliesToOrigin', lit(rule.origin));
    add(s, 'appliesToBehaviour', lit(rule.behaviour));
    add(s, 'appliesToNode', lit(rule.node));
    add(s, 'targetIcd10Code', lit(rule.icd10));
    add(s, 'status', lit(rule.status));
    if (rule.rationale) add(s, 'rationale', lit(rule.rationale, 'xsd:string'));
    if (rule.source) add(s, 'sourceRef', lit(rule.source, 'xsd:string'));
    if (rule.conflict) add(s, 'hasConflict', lit(true, 'xsd:boolean'));
  }

  // ---- ICD-O topography groups -------------------------------------------
  for (const [key, topo] of model.icdoTopoByKey) {
    const s = uri(`topogroup/${encodeURIComponent(key)}`);
    add(s, 'type', uri('IcdoTopographyGroup'));
    add(s, 'groupKey', lit(key));
    add(s, 'icdo3Topography', lit(topo.icdo3Topography));
    if (topo.source) add(s, 'sourceRef', lit(topo.source, 'xsd:string'));
    if (topo.status) add(s, 'status', lit(topo.status));
  }

  return triples;
}
