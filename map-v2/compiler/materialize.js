// Stage 6 (materialize): turns normalize.js's Map-based model into the
// plain-object "bundle" resolve.js and every emitter consumes. Kept as its
// own stage (not inlined into normalize or emit) because the Prompt
// Maestro treats materialization as a distinct pipeline step (§6.6) whose
// output must be reproducible byte-for-byte from the same normalized model.
function mapToObj(map) {
  const obj = {};
  for (const [k, v] of map) obj[k] = v;
  return obj;
}

function mapOfArraysToObj(map) {
  const obj = {};
  for (const [k, v] of map) obj[k] = v;
  return obj;
}

export function materialize(model, meta) {
  return {
    meta,
    stemsByCode: mapToObj(model.stemsByCode),
    anatomyByCode: mapToObj(model.anatomyByCode),
    anatomyRelationsByCode: mapOfArraysToObj(model.anatomyRelationsByCode),
    rulesByKey: mapToObj(model.rulesByKey),
    anatomyTreeByExtension: mapOfArraysToObj(model.anatomyTreeByExtension),
    histologyByCode: mapToObj(model.histologyByCode),
    icdoTopoByKey: mapToObj(model.icdoTopoByKey),
    icd10Domains: mapToObj(model.icd10Domains),
    icdo3TopographyLabels: mapToObj(model.icdo3TopographyLabels),
    icdo4MorphologyLabels: mapToObj(model.icdo4MorphologyLabels),
    icdo4MorphologyTerms: mapOfArraysToObj(model.icdo4MorphologyTerms),
  };
}
