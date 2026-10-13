// Stage 3-4 (normalize + validate) of the Prompt Maestro's pipeline.
// Builds the single normalized intermediate model every emitter (TTL,
// RDF/XML, YAML, bundle) reads from -- no emitter re-derives anything from
// the raw CSV rows itself.
//
// Column-name reference (verified against the real files, not assumed --
// re-verified 2026-09-22 after the user updated icd11_stem_defaults.csv:
// TitleEN/TitleES were renamed to icd11_title_en/icd11_title_es with the
// leading "- - -" depth-dash prefixes stripped, DepthInKind/IsResidual/isLeaf
// were added, subdomain is now populated for domain "ns" too -- 'brain',
// 'meninges', 'choroid plexus', 'optical nerve' -- and
// "precoordinated_morphology" lost its trailing space):
//   icd11_stem_defaults.csv: id, Foundation URI, Linearization URI, Code,
//     DepthInKind, IsResidual, isLeaf, icd11_title_en, icd11_title_es, origin,
//     behaviour, domain, subdomain, precoordinated_topography,
//     precoordinated_morphology, icd10_default, icd10_needs_refinement,
//     icd10_refinement_axis, icdo3_topography_default, icdo4_topography_default,
//     ICDO_3_morphology_code, ICD_O_3_behaviour_code, ICDO_4_morphology_code, ICD_O_4_behaviour_code
//   -- curado 2026-09-22: ya no hay celdas con el string literal
//   "undefined" (era un sentinel de "no determinado estáticamente" en hasta
//   54.7% de las filas de una columna); ahora son celdas vacías reales, que
//   val() ya trata como null. Ver reports/future-plan.md §6.
//   anatomy_mapping.csv: id, Foundation URI, Linearization URI, Code, TitleEN,
//     TitleES, ClassKind, DepthInKind, browser, isLeaf, top_node, nodes,
//     node_relations, uri_anatomy_ltree, anatomy_ltree, ICD10_malignant_primary,
//     ICD10_malignant_secondary, ICD10_benign, ICD10_in_situ, ICD10_uncertain,
//     ICD10_unknown, ICDO_3_2, ICDO_4
//     -- TitleEN/TitleES: el usuario recalculó y limpió las fórmulas de Excel
//     2026-09-22 (antes "#¡NOMBRE?" en 97-99% de las filas); siguen sin usarse
//     para display en este compilador, pero ya no están corruptas.
//     `browser` es un placeholder muerto (literalmente el string "browser" en
//     las 3538 filas). `node_relations` trae un mapa perfil->nodo inline por
//     código -- hallazgo real, NO integrado todavía (ver future-plan.md §6.0).
//   anatomy_relations.csv: anatomy_code, foundation_uri, profile, node, status
//   rules.csv: family, origin, behaviour, node, icd10, status, rationale, source
//   icd11_anatomy_tree_icd10.csv: anatomy_extension, stem_ltree, foundation_uri,
//     linearization_uri, icd11_label_EN, icd11_label_ES, icd11_extension_uripath_ltree,
//     top_parent_for_terminal, icd11_extension_semantic_ltree, ICD-10, icd10_label,
//     composite_ltree -- curado 2026-09-22: icd11_label_EN/ES tenían el mismo
//     error de fórmula Excel que anatomy_mapping.csv (98.5%/98.8% de las 1288
//     filas) más prefijos de guiones; reconstruidos 100% por cruce exacto de
//     código (anatomy_extension == anatomy_mapping.Code) contra ese archivo ya
//     limpio. También se eliminó una columna fantasma sin nombre (4 filas con
//     el literal "PLACEHOLDER", residuo de autoría).
//   ICD11_histopathology_axis.csv: id, Foundation URI, Linearization URI, Code,
//     TitleEN, TitleES, ClassKind, DepthInKind, isLeaf, BrowserLink,
//     Linearization_URI_Code, icdo3_morpho_code, icdo3_behaviour_code,
//     icdo4_morpho_code, icdo4_behaviour_code -- curado 2026-09-22: prefijos de
//     guiones quitados de TitleEN/TitleES (100% de las 1885 filas los tenía);
//     la columna venía mal nombrada "Title" (era el título en español),
//     renombrada a TitleES. 2 filas conservan un "?" suelto dentro del título
//     que no se pudo verificar (mojibake probable, no una convención clínica
//     real -- la traducción ES no lo tiene); no se adivinó el reemplazo.
//   icdo_topo_groups.csv: key (profile|node), icdo3_topography, source, status
//   ICD10_domains.csv: code, kind, preferred, preferred_long, domain_ltree,
//     origin, behaviour, domain, subdomain, ICD11_top_node, profile, nodes,
//     claml_parent_codes, claml_child_codes, is_leaf_claml, ... --
//     inclusion/exclusion moved out 2026-09-22 into icd10_domain_notes.csv
//     (code, kind, note), one real row per note instead of a JSON array
//     encoded as text inside a single CSV cell.
//   icd10_domain_notes.csv (new 2026-09-22): code, kind ('inclusion'|
//     'exclusion'), note -- long-format extraction of what used to be
//     ICD10_domains.csv's own inclusion/exclusion columns.

// Curación 2026-09-22: los 8 CSV de origen (+ icd10_domain_notes.csv) ya no
// tienen el error de fórmula Excel "#¡NOMBRE?", ni prefijos de guiones de
// profundidad en los títulos, ni el sentinel de texto "undefined", ni
// booleanos con mayúscula (True/False) -- todo eso se limpió en el propio
// dato (ver reports/future-plan.md §6). bool()/triBool()/val() ya no
// necesitan tolerar esas variantes; si una reaparece, es una regresión de
// los datos, no algo que el compilador deba volver a parchar en silencio.
// 2026-10-14: reapareció una (una re-exportación desde Excel dejó
// "True"/"False"), y leerla en silencio como `false` marcó todos los stems
// como no terminales (isLeaf) y anuló F3 (is_leaf_claml). El formato
// canónico sigue siendo solo `true`/`false` en minúsculas; cualquier otro
// valor detiene la compilación con un mensaje claro en vez de tolerarse o
// de leerse mal.
function assertCanonicalBoolean(v) {
  if (v === undefined || v === null || v === '' || v === 'true' || v === 'false') return;
  throw new Error(
    `Booleano no canónico en los datasets: "${v}". El formato es true/false en minúsculas (celda de texto en Excel); corrija el CSV antes de compilar.`
  );
}

function bool(v) {
  assertCanonicalBoolean(v);
  return v === 'true';
}

// Tri-state boolean: 'true'/'false' map to real booleans, blank (or
// absent) is `null` -- "not statically declared", NEVER coerced to false.
// Distinguishing this from bool() matters for icd10_needs_refinement: a
// blank there means "behaviour itself isn't known yet, resolution is
// dynamic" (the CNS pattern), which is NOT the same claim as an explicit
// "false" ("no refinement needed, use the static default").
function triBool(v) {
  assertCanonicalBoolean(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

// Sanitizes a raw cell value: '' becomes `null`. Every plain string/code/
// label field read from these CSVs goes through this, never a bare
// `|| null` -- also used for labels (icd11_title_en, TitleEN/ES, preferred)
// now that the source files carry clean values directly (no dash prefixes,
// no Excel formula errors baked in).
function val(v) {
  if (v === undefined || v === null) return null;
  const t = typeof v === 'string' ? v.trim() : v;
  return t === '' ? null : t;
}

export function normalize(raw) {
  const problems = []; // §validate: cross-reference issues found, never silently dropped

  // ---- stems ----------------------------------------------------------
  const stemsByCode = new Map();
  const stemsByFoundationUri = new Map();
  const stemsByLinearizationUri = new Map();
  for (const r of raw.stems) {
    const domain = val(r.domain);
    const subdomain = val(r.subdomain);
    const family = subdomain ? `${domain}.${subdomain}` : domain;
    const stem = {
      id: r.id,
      foundationUri: val(r['Foundation URI']),
      linearizationUri: val(r['Linearization URI']),
      code: val(r.Code),
      depthInKind: r.DepthInKind !== '' ? Number(r.DepthInKind) : null,
      isResidual: bool(r.IsResidual),
      isLeafDeclared: r.isLeaf !== '' ? bool(r.isLeaf) : null,
      titleEn: val(r.icd11_title_en),
      titleEs: val(r.icd11_title_es),
      origin: val(r.origin),
      behaviour: val(r.behaviour), // null = not statically declared (see triBool note on icd10NeedsRefinement)
      domain,
      subdomain,
      family,
      precoordinatedTopography: val(r.precoordinated_topography),
      precoordinatedMorphology: val(r.precoordinated_morphology),
      icd10Default: val(r.icd10_default),
      // tri-state: true/false are real declarations; null means "not
      // statically determined" (the CNS pattern -- behaviour, and
      // therefore the ICD-10 chapter, isn't known until postcoordinated
      // histology resolves it). See resolve.js's resolveIcd10.
      icd10NeedsRefinement: triBool(r.icd10_needs_refinement),
      icd10RefinementAxis: val(r.icd10_refinement_axis),
      icdo3TopographyDefault: val(r.icdo3_topography_default),
      icdo4TopographyDefault: val(r.icdo4_topography_default),
      icdo3MorphologyCode: val(r.ICDO_3_morphology_code),
      icdo3BehaviourCode: val(r.ICD_O_3_behaviour_code),
      icdo4MorphologyCode: val(r.ICDO_4_morphology_code),
      icdo4BehaviourCode: val(r.ICD_O_4_behaviour_code),
      sourceRow: r.__row,
    };
    if (stem.foundationUri) stemsByFoundationUri.set(stem.foundationUri, stem);
    if (stem.linearizationUri) stemsByLinearizationUri.set(stem.linearizationUri, stem);
    if (stem.code) {
      if (stemsByCode.has(stem.code)) {
        problems.push({ kind: 'duplicate_stem_code', code: stem.code, rows: [stemsByCode.get(stem.code).sourceRow, stem.sourceRow] });
      }
      stemsByCode.set(stem.code, stem);
    }
  }

  // icd11_stem_defaults.csv DOES carry its own isLeaf/DepthInKind/IsResidual
  // columns (an earlier pass of this file missed them and derived isLeaf
  // from the code hierarchy instead -- corrected 2026-09-22 per the user's
  // report). The declared column is authoritative; the code-hierarchy
  // check below only fills in the rare row where isLeaf is genuinely blank,
  // as a documented fallback, never overriding a real declared value.
  const allCodes = [...stemsByCode.keys()];
  for (const stem of stemsByCode.values()) {
    const derived = !allCodes.some((c) => c !== stem.code && c.startsWith(stem.code + '.'));
    if (stem.isLeafDeclared === null) {
      problems.push({ kind: 'missing_declared_isLeaf', code: stem.code, row: stem.sourceRow });
    }
    stem.isLeaf = stem.isLeafDeclared !== null ? stem.isLeafDeclared : derived;
  }

  // ---- anatomy identity (anatomy_mapping.csv) --------------------------
  const anatomyByCode = new Map();
  for (const r of raw.anatomyMapping) {
    const code = r.Code || null;
    if (!code) continue; // non-leaf grouping rows with no extension code carry no resolvable identity
    const candidate10 = {
      malignant: r.ICD10_malignant_primary || null,
      secondary: r.ICD10_malignant_secondary || null,
      benign: r.ICD10_benign || null,
      in_situ: r.ICD10_in_situ || null,
      uncertain: r.ICD10_uncertain || null,
      unknown: r.ICD10_unknown || null,
    };
    anatomyByCode.set(code, {
      code,
      foundationUri: r['Foundation URI'] || null,
      linearizationUri: r['Linearization URI'] || null,
      titleEn: val(r.TitleEN),
      titleEs: val(r.TitleES),
      classKind: r.ClassKind || null,
      isLeaf: bool(r.isLeaf),
      candidate10,
      icdoTopography32: r.ICDO_3_2 || null,
      icdoTopography4: r.ICDO_4 || null,
      sourceRow: r.__row,
    });
  }

  // ---- anatomy_relations.csv: anatomy_code -> {profile: node} ---------
  // Real data has MULTIPLE rows per anatomy_code (one per applicable
  // profile, e.g. XA9738 carries both brain.malignant and
  // brain.nonmalignant) -- never a single profile per code.
  const anatomyRelationsByCode = new Map();
  for (const r of raw.anatomyRelations) {
    const code = r.anatomy_code;
    if (!code) continue;
    if (!anatomyRelationsByCode.has(code)) anatomyRelationsByCode.set(code, []);
    anatomyRelationsByCode.get(code).push({
      foundationUri: r.foundation_uri || null,
      profile: r.profile || null,
      node: r.node || null,
      status: r.status || null,
      sourceRow: r.__row,
    });
  }

  // ---- rules.csv: family|origin|behaviour|node -> rule -----------------
  const rulesByKey = new Map();
  const rulesFamilies = new Set();
  for (const r of raw.rules) {
    const key = [r.family, r.origin, r.behaviour, r.node].join('|');
    rulesFamilies.add(r.family);
    const rule = {
      family: r.family,
      origin: r.origin,
      behaviour: r.behaviour,
      node: r.node,
      icd10: r.icd10,
      status: r.status,
      rationale: r.rationale,
      source: r.source,
      sourceRow: r.__row,
    };
    if (rulesByKey.has(key)) {
      // §4.3: two rules of equal scope competing -> conflict, never pick by row order.
      problems.push({ kind: 'conflicting_rule', key, rows: [rulesByKey.get(key).sourceRow, rule.sourceRow] });
      rulesByKey.get(key).conflict = true;
      rule.conflict = true;
    }
    rulesByKey.set(key, rule);
  }

  // ---- icd11_anatomy_tree_icd10.csv: contextual crosswalk --------------
  const anatomyTreeByExtension = new Map();
  for (const r of raw.anatomyTreeIcd10) {
    const ext = r.anatomy_extension;
    const icd10 = r['ICD-10'];
    if (!ext || !icd10) continue; // grouping-only rows, not terminal mappings
    if (!anatomyTreeByExtension.has(ext)) anatomyTreeByExtension.set(ext, []);
    anatomyTreeByExtension.get(ext).push({
      stemLtree: r.stem_ltree || null,
      icd10: icd10,
      icd10Label: r.icd10_label || null,
      topParentForTerminal: r.top_parent_for_terminal || null,
      sourceRow: r.__row,
    });
  }

  // ---- ICD11_histopathology_axis.csv: XH code -> morphology/behaviour --
  const histologyByCode = new Map();
  for (const r of raw.histopathologyAxis) {
    const code = r.Code;
    if (!code) continue;
    histologyByCode.set(code, {
      code,
      foundationUri: r['Foundation URI'] || null,
      titleEn: val(r.TitleEN),
      classKind: r.ClassKind || null,
      isLeaf: bool(r.isLeaf),
      icdo3MorphoCode: r.icdo3_morpho_code || null,
      icdo3BehaviourCode: r.icdo3_behaviour_code || null,
      icdo4MorphoCode: r.icdo4_morpho_code || null,
      icdo4BehaviourCode: r.icdo4_behaviour_code || null,
      sourceRow: r.__row,
    });
  }

  // ---- icdo_topo_groups.csv: "profile|node" -> icdo3 topography --------
  const icdoTopoByKey = new Map();
  for (const r of raw.icdoTopoGroups) {
    icdoTopoByKey.set(r.key, { icdo3Topography: r.icdo3_topography, source: r.source, status: r.status, sourceRow: r.__row });
  }

  // ---- ICD10_domains.csv: destination catalog --------------------------
  // inclusion/exclusion notes used to be JSON-array-encoded text inside a
  // single cell (e.g. '["skin of breast C43.5 C44.5"]'); extracted
  // 2026-09-22 into their own long-format table (icd10_domain_notes.csv:
  // code;kind;note) -- one real row per note instead of JSON hidden inside
  // a CSV cell. Rebuilt here into the same {inclusion:[], exclusion:[]}
  // shape resolve.js already expects, so nothing downstream changes.
  const notesByCode = new Map();
  for (const r of raw.icd10DomainNotes) {
    if (!notesByCode.has(r.code)) notesByCode.set(r.code, { inclusion: [], exclusion: [] });
    const bucket = notesByCode.get(r.code);
    if (r.kind === 'inclusion') bucket.inclusion.push(r.note);
    else if (r.kind === 'exclusion') bucket.exclusion.push(r.note);
  }
  const icd10Domains = new Map();
  for (const r of raw.icd10Domains) {
    const notes = notesByCode.get(r.code);
    icd10Domains.set(r.code, {
      code: r.code,
      kind: r.kind,
      preferred: val(r.preferred),
      preferredLong: val(r.preferred_long), // carries the behaviour ("Malignant neoplasm: Brain, unspecified"); blank on non-leaf categories
      domainLtree: r.domain_ltree || null,
      isLeafClaml: bool(r.is_leaf_claml),
      inclusion: notes?.inclusion ?? [],
      exclusion: notes?.exclusion ?? [],
      note: r.note || null,
      sourceRow: r.__row,
    });
  }

  // ---- reference label tables (map-v2's own, not Datasets/final) --------
  // See reports/gap-analysis.md §1f/§2026-09-22 morphology note and
  // sources/icdo3.2/README.md + sources/icdo4/ for provenance. Used only to
  // attach a display label -- never to change which code gets resolved.
  const icdo3TopographyLabels = new Map();
  for (const r of raw.icdo3TopographyLabels) icdo3TopographyLabels.set(r.code, r.label);
  // A stem's ICD-O-3.2 topography default must be a real ICD-O topography
  // code. Caught live 2026-10-14: re-exporting an older xlsx over the CSV
  // silently brought back C19.0/C20.0/C21.9 (none exist in ICD-O) on 14 stems.
  for (const stem of stemsByCode.values()) {
    const t = stem.icdo3TopographyDefault;
    if (t && !icdo3TopographyLabels.has(t)) problems.push({ kind: 'invalid_icdo3_topography_default', code: stem.code, value: t, row: stem.sourceRow });
  }
  const icdo4MorphologyLabels = new Map();
  for (const r of raw.icdo4MorphologyLabels) icdo4MorphologyLabels.set(r.code, r.label);
  const icdo4MorphologyTerms = new Map();
  for (const r of raw.icdo4MorphologyTerms) {
    if (!icdo4MorphologyTerms.has(r.code)) icdo4MorphologyTerms.set(r.code, []);
    icdo4MorphologyTerms.get(r.code).push({ level: r.level, term: r.term });
  }

  return {
    stemsByCode,
    stemsByFoundationUri,
    stemsByLinearizationUri,
    anatomyByCode,
    anatomyRelationsByCode,
    rulesByKey,
    rulesFamilies,
    anatomyTreeByExtension,
    histologyByCode,
    icdoTopoByKey,
    icd10Domains,
    icdo3TopographyLabels,
    icdo4MorphologyLabels,
    icdo4MorphologyTerms,
    problems,
  };
}
