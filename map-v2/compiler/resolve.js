// Pure resolver -- F0-F7 of the Prompt Maestro's spec (§5). No network, no
// RDF, no SPARQL; runs identically in Node (compiler tests) and the browser
// (copied as-is into the bundle's companion file). Takes a plain-object
// `bundle` (the compiler's Maps converted to objects for JSON-serializability)
// and a raw ECT-shaped `selection` ({code, foundationUri}), returns a
// ResolutionSnapshot-shaped result (simplified: single-stem-component only,
// see F0 below for the multi-stem-cluster limitation).
//
// F8 (other axes) is NOT implemented beyond capturing ignored extension
// codes in `messages` -- grade/laterality/extent axes are recorded as
// "captured, sin efecto en este destino" but never change the mapped
// codes. Flagged as pending in reports/gap-analysis.md.

export const STATUS = {
  RESOLVED: 'resolved',
  FALLBACK: 'fallback',
  UNMAPPED: 'unmapped',
  AMBIGUOUS: 'ambiguous',
  CONFLICT: 'conflict',
  INVALID: 'invalid_input',
  UNSUPPORTED: 'unsupported',
  CANDIDATE: 'candidate', // this compiler's own extra status: F5's chapter-validated-but-unreviewed general mapping
  NON_TERMINAL: 'non_terminal', // this compiler's own extra status: stem is a category with real children, ICD-11 mandates coding to the most specific entity
};

const ICDO_BEHAVIOUR_TO_CLINICAL = { 0: 'benign', 1: 'uncertain', 2: 'in_situ', 3: 'malignant', 6: 'malignant' };

function blank(status) {
  return { code: null, status };
}

function withDestLabel(bundle, result) {
  const dest = bundle.icd10Domains[result.code];
  // preferred_long carries the behaviour the bare `preferred` drops
  // ("Malignant neoplasm: Brain, unspecified" vs "Brain, unspecified" --
  // the latter is identical for C71.9 and D43.2); blank on non-leaf
  // categories, where `preferred` is already the full title.
  return { ...result, label: dest ? dest.preferredLong ?? dest.preferred : null };
}

function chapterMatches(candidateCode, stem) {
  if (!stem.icd10Default) return true; // nothing independent to validate against -- don't block on absence of evidence
  return candidateCode.slice(0, 3) === stem.icd10Default.slice(0, 3);
}

// icd11_stem_defaults.csv's "mesenchymal" domain covers sarcomas across
// many sites -- its own observed subdomains are: bone, breast, digestive,
// female_genital, lip_oral_pharynx, liver, male_genital, omentum, other,
// ovary, peritoneum_retroperitoneum, respiratory_thorax, skin,
// small_intestine, soft_tissue, stomach, thorax, uterus. A mesenchymal stem
// is anchored to a specific organ ONLY when its own subdomain names one;
// `soft_tissue`, `other`, and no subdomain at all all mean "generic
// connective/soft tissue", the family's own tissue of origin -- never
// picked by falling through row order in anatomy_relations.csv.
const MESENCHYMAL_ORGAN_SUBDOMAINS = new Set([
  'bone', 'breast', 'digestive', 'female_genital', 'lip_oral_pharynx', 'liver', 'male_genital',
  'omentum', 'ovary', 'peritoneum_retroperitoneum', 'respiratory_thorax', 'skin', 'small_intestine',
  'stomach', 'thorax', 'uterus',
]);

function isMesenchymalSoftTissueDefault(stem) {
  return stem.domain === 'mesenchymal' && !MESENCHYMAL_ORGAN_SUBDOMAINS.has(stem.subdomain);
}

// Root cause of the whole class of bugs this session found (skin-of-limb
// masking soft tissue, skin-of-trunk masking breast): anatomy_relations.csv
// was authored for exactly five superficial/regional tissue families --
// skin, soft_tissue, adipose.superficial, brain/meninges, lip.mucosal --
// its full profile vocabulary, confirmed by enumerating it, is nothing
// more than those. A code like XA12C1 is genuinely "upper trunk", reused
// AS-IS for skin-of-trunk melanoma AND as the closest available
// `precoordinated_topography` stand-in for breast stems (breast has no
// dedicated postcoordination anatomy of its own in this dataset) -- but
// XA12C1 itself has no idea it's ever standing in for "breast"; its own
// {skin,soft_tissue,adipose.superficial} profile rows only describe what
// IS at that trunk region, not what a given STEM means by pointing to it.
// Querying anatomy_relations.csv for a stem whose domain was never one of
// those five families is therefore not "picking the wrong profile" --
// it's asking a question that table was never built to answer. Gating
// eligibility here (rather than only patching the answer afterwards, as
// the exclusion-note guard below still does defensively) stops F4 from
// ever seeing a bogus family/node for e.g. plain "breast"-domain stems,
// and lets F5 use anatomy_mapping.csv's OWN general candidate columns
// instead (which, for XA12C1, already correctly says
// ICD10_malignant_primary=C50.9 -- it's F4 hijacking that answer first,
// not a missing candidate, that caused the original bug).
const ANATOMY_RELATIONS_ELIGIBLE_DOMAINS = new Set(['skin', 'ns', 'pns', 'mesenchymal', 'lip_oral_pharynx']);

function anatomyRelationsApplies(stem) {
  return ANATOMY_RELATIONS_ELIGIBLE_DOMAINS.has(stem.domain);
}

// A stem's own domain/subdomain tells us which TISSUE the extension's
// profile needs to belong to when a region code is shared across tissues
// (see the bug this fixes, right below). Returns the profile prefix to
// prefer, or null when the stem's family gives no such signal.
// `subdomain` was added to icd11_stem_defaults.csv for domain "ns" on
// 2026-09-22 ('brain', 'meninges', 'choroid plexus', 'optical nerve') --
// use it directly when present instead of assuming every "ns" stem is
// brain-anchored.
function stemTissueAnchor(stem) {
  const f = stem.family || '';
  if (f.startsWith('skin.')) return 'skin';
  if (f.includes('lip')) return 'lip.mucosal';
  if (stem.domain === 'pns') return 'soft_tissue';
  if (stem.domain === 'ns') return stem.subdomain === 'meninges' ? 'meninges' : 'brain';
  if (isMesenchymalSoftTissueDefault(stem)) return 'soft_tissue';
  return null; // organ-specific mesenchymal subdomain (breast/liver/stomach/...) -- no generic tissue anchor to force
}

// Real data (anatomy_relations.csv) carries MULTIPLE {profile,node} rows for
// the same anatomy_code in two genuinely different situations, and they
// need two different disambiguation strategies:
//   1. Same tissue, behaviour-driven variants (XA9738 "brain (unspecified)"
//      carries both brain.malignant and brain.nonmalignant; a plain skin
//      code can carry both "skin" and "skin.malignant_exclusion") --
//      disambiguate by the stem's own behaviour.
//   2. DIFFERENT tissues sharing one generic region code (found live:
//      XA5S78 "thigh/lower limb" carries "skin", "soft_tissue" AND
//      "adipose.superficial" rows for the SAME node -- a limb region is
//      relevant to all three). Picking whichever came first in the CSV
//      (the previous behaviour) silently turned a soft-tissue liposarcoma
//      stem (2B59.0, family "mesenchymal.soft_tissue") into a skin
//      diagnosis (C44.7 instead of the correct C49.2). Fix: when the
//      stem's own family names a tissue anchor (see stemTissueAnchor
//      above), filter to that tissue FIRST, before any behaviour
//      disambiguation -- the stem's own declared tissue always outranks
//      row order.
// A dedicated single-profile code (e.g. a meninges-only extension) needs
// none of this -- it only ever has one row.
function pickProfile(stem, behaviour, relRows) {
  if (!relRows || !relRows.length) return { profile: null, node: null };
  if (relRows.length === 1) return relRows[0];

  let candidates = relRows;
  const anchor = stemTissueAnchor(stem);
  if (anchor) {
    const anchored = relRows.filter((r) => r.profile === anchor || r.profile.startsWith(anchor + '.'));
    if (anchored.length) candidates = anchored;
  }
  if (candidates.length === 1) return candidates[0];

  const malignantVariant = candidates.filter((r) => /malignant_exclusion|\.malignant$/.test(r.profile));
  const nonmalignantVariant = candidates.filter((r) => /nonmalignant/.test(r.profile));
  const plain = candidates.filter((r) => !malignantVariant.includes(r) && !nonmalignantVariant.includes(r));
  if (behaviour === 'malignant' && malignantVariant.length) return malignantVariant[0];
  if (behaviour && behaviour !== 'malignant' && nonmalignantVariant.length) return nonmalignantVariant[0];
  // No behaviour: the malignant/non-malignant variants are exactly the
  // choice we can't make (XA9738 -> brain_9 vs unspecified). Undetermined,
  // not whichever row came first.
  if (!behaviour && malignantVariant.length && nonmalignantVariant.length) {
    const nodes = new Set([...malignantVariant, ...nonmalignantVariant].map((r) => r.node));
    return nodes.size === 1 ? { profile: null, node: [...nodes][0] } : { profile: null, node: null };
  }
  if (plain.length) return plain[0];
  return candidates[0];
}

// Maps either the anatomy-resolved `profile` (when anatomy is
// postcoordinated/defaulted) or, failing that, the stem's own
// domain[.subdomain] onto the family vocabulary rules.csv actually uses (8
// values: skin.melanocyte, skin.other, brain, meninges, soft_tissue.other,
// peripheral_nerve, adipose.superficial, lip.mucosal) -- neither raw source
// matches that vocabulary directly (anatomy_relations.csv's own "skin"
// profile never distinguishes melanocyte/other; "pns"/"ns" domains don't
// spell "peripheral_nerve"/"brain" literally). Documented alias, not
// derivable purely from these 8 files -- see reports/gap-analysis.md.
function effectiveFamily(stem, profile) {
  if (!profile) return rawFamilyAlias(stem);
  if (profile === 'meninges') return 'meninges';
  if (profile === 'lip.mucosal') return 'lip.mucosal';
  if (profile === 'adipose.superficial') return 'adipose.superficial';
  if (profile === 'soft_tissue') return stem.domain === 'pns' ? 'peripheral_nerve' : 'soft_tissue.other';
  if (profile.startsWith('brain')) return 'brain';
  if (profile.startsWith('skin')) return stem.family && stem.family.startsWith('skin.') ? stem.family : 'skin.other';
  return rawFamilyAlias(stem);
}

// No anatomy signal at all (neither postcoordinated nor a precoordinated
// default) -- fall back from the stem's own raw family to rules.csv's
// vocabulary using the same domain/subdomain knowledge as
// stemTissueAnchor(), rather than passing the raw "ns.brain"/"ns.meninges"/
// "pns" strings straight to rules.csv where they'd never match.
function rawFamilyAlias(stem) {
  if (stem.domain === 'pns') return 'peripheral_nerve';
  if (stem.domain === 'ns') return stem.subdomain === 'meninges' ? 'meninges' : 'brain';
  if (isMesenchymalSoftTissueDefault(stem)) return 'soft_tissue.other';
  return stem.family;
}

function resolveIcd10({ stem, behaviour, anatomyCode, anatomyExtCode, family, node, bundle, trace, messages }) {
  // icd10_needs_refinement is a TRI-STATE (see normalize.js's triBool):
  // `false` really means "use the static default, no refinement needed"
  // (F2, below). A BLANK cell (`null`) means something clinically
  // different -- "not statically determined": some CNS stems (this
  // dataset's own `ns` domain) declare no stem-level behaviour at all, so
  // there IS no static ICD-10 chapter (malignant C7x / benign D3x /
  // uncertain D4x) until a postcoordinated histology's own ICD-O
  // behaviour digit resolves it (already attempted in F1, before this
  // function runs). Per the user's own domain rule for the OLD map2
  // resolver (ported here): if that derivation didn't succeed -- no
  // postcoordination, or the stem has no morphology default to fall back
  // on either -- the result must stay genuinely UNRESOLVED, never a fake
  // "fallback" to whatever placeholder sat in icd10_default (blank for
  // exactly these stems -- was the literal sentinel "undefined" before the
  // 2026-09-22 data curation, always sanitized to `null` by val() either
  // way).
  if (stem.icd10NeedsRefinement === null && !behaviour) {
    messages.push(
      'El stem no declara comportamiento propio y no se postcoordinó (o no hay) histología que permita derivarlo dinámicamente; el capítulo CIE-10 depende de ese comportamiento y queda sin resolver -- no se usa ningún valor de referencia como si fuera la respuesta.'
    );
    return { code: null, status: STATUS.UNMAPPED, route: 'none', dynamicBehaviourUnresolved: true };
  }

  // F2: declared terminal fallback -- used whenever no anatomy-driven
  // refinement is genuinely needed (icd10NeedsRefinement === false).
  // Never silently overridden.
  if (stem.icd10NeedsRefinement === false) {
    if (stem.icd10Default) {
      trace.push({ step: 'F2', code: stem.icd10Default, source: 'stem.icd10_default' });
      return withDestLabel(bundle, { code: stem.icd10Default, status: STATUS.FALLBACK, route: 'F2', source: 'stem.icd10_default' });
    }
    return { code: null, status: STATUS.UNMAPPED, route: 'F2' };
  }

  // F3: contextual exception/terminal mapping keyed by the ACTUAL
  // postcoordinated extension (never the stem's own default -- that would
  // just reproduce F2). Only trusted when every row for that extension
  // agrees on one ICD-10 target, that target is a real ICD10_domains.csv
  // *leaf* (`isLeafClaml`, not just any "category" kind -- ClaML's own
  // block ranges like "C43" are also kind:"category" but isLeafClaml:false,
  // confirmed via real data: XA0364 maps to bare "C43", a non-leaf grouping
  // that would otherwise silently outrank F4's correct, more specific
  // C43.9), AND it lands in a chapter the stem already independently
  // belongs to.
  if (anatomyExtCode) {
    const rows = bundle.anatomyTreeByExtension[anatomyExtCode];
    if (rows && rows.length) {
      const distinct = [...new Set(rows.map((r) => r.icd10))];
      const dest = distinct.length === 1 ? bundle.icd10Domains[distinct[0]] : null;
      if (dest && dest.isLeafClaml && chapterMatches(distinct[0], stem)) {
        trace.push({ step: 'F3', code: distinct[0], extension: anatomyExtCode });
        return withDestLabel(bundle, { code: distinct[0], status: STATUS.RESOLVED, route: 'F3', source: 'icd11_anatomy_tree_icd10.csv' });
      }
    }
  }

  // Exclusion-note guard, a third resolution safety net beyond F3/F5's own
  // chapter check -- real, found live across 16 stems (breast carcinomas
  // 2C60-2C6Z, and mesenchymal 2B54.0/2B56.2): their precoordinated anatomy
  // resolves to a GENERIC region code whose only row in
  // anatomy_relations.csv is a "skin" profile (no breast/connective-tissue
  // profile exists in that file at all), so `family` above became
  // "skin.other" even though the stem itself isn't skin. Unlike F3/F5, F4
  // has no chapter check of its own -- this closes that gap specifically
  // for the skin-profile-only pattern, using WHO's own ICD-10 tabular text:
  // chapter C50 (breast) literally INCLUDES "connective tissue of breast"
  // and EXCLUDES "skin of breast" (redirecting it to C43.5/C44.5), so a
  // skin-derived candidate for a non-skin stem whose own chapter's
  // exclusion note mentions "skin" is exactly WHO's documented exception,
  // not a valid refinement. Runs AFTER F3 (which already chapter-checks
  // itself and may find a genuinely more specific, valid answer) and gates
  // only F4/F5 -- deliberately narrow (one keyword, one specific mismatch
  // pattern), per the Prompt Maestro's own caution against turning
  // free-text notes into general executable rules.
  if (family && family.startsWith('skin.') && stem.family && !stem.family.startsWith('skin.') && stem.icd10Default) {
    const chapterEntry = bundle.icd10Domains[stem.icd10Default.slice(0, 3)];
    const exclusionText = (chapterEntry?.exclusion || []).join(' ; ');
    if (exclusionText.toLowerCase().includes('skin')) {
      messages.push(
        `Nota de exclusión CIE-10 en ${chapterEntry.code} ("${exclusionText}"): la anatomía disponible solo ofrece un perfil de piel para esta región, pero el stem no es de piel -- se prefiere el default declarado del stem sobre esa anatomía.`
      );
      trace.push({ step: 'F4_exclusion_guard', chapterCode: chapterEntry.code });
      return withDestLabel(bundle, {
        code: stem.icd10Default,
        status: STATUS.FALLBACK,
        route: 'F2_exclusion_guard',
        source: 'stem.icd10_default (anatomía de piel descartada por nota de exclusión CIE-10)',
      });
    }
  }

  // F4/F5 are both keyed by behaviour; without one, no rule applies.
  if (!behaviour && stem.origin !== 'secondary') {
    messages.push('Sin comportamiento declarado ni derivable de una histología: las reglas por comportamiento (F4/F5) no aplican y el CIE-10 queda sin resolver.');
    return { code: null, status: STATUS.UNMAPPED, route: 'none', behaviourNull: true, baselineDefault: stem.icd10Default || null };
  }

  // F4: family + origin + behaviour + node rule (rules.csv).
  if (family && node) {
    const key = [family, stem.origin, behaviour, node].join('|');
    const rule = bundle.rulesByKey[key];
    if (rule) {
      if (rule.conflict) {
        messages.push(`F4: dos reglas en conflicto para "${key}"; no se elige por orden de fila.`);
        return { code: null, status: STATUS.CONFLICT, route: 'F4', key };
      }
      trace.push({ step: 'F4', key });
      if (rule.rationale) messages.push(rule.rationale);
      return withDestLabel(bundle, { code: rule.icd10, status: STATUS.RESOLVED, route: 'F4', ruleKey: key, source: rule.source });
    }
  }

  // F5: general anatomy_mapping.csv candidate, gated by the same
  // chapter-membership check F3 uses -- never invents a chapter the stem
  // doesn't already independently belong to.
  if (anatomyCode) {
    const anat = bundle.anatomyByCode[anatomyCode];
    const behaviourKey = stem.origin === 'secondary' ? 'secondary' : behaviour;
    const candidate = anat && anat.candidate10[behaviourKey];
    if (candidate && chapterMatches(candidate, stem)) {
      trace.push({ step: 'F5', code: candidate });
      messages.push('F5: correspondencia anatómica general (anatomy_mapping.csv), validada contra el capítulo ya conocido del stem; requiere revisión curatorial.');
      return withDestLabel(bundle, { code: candidate, status: STATUS.CANDIDATE, route: 'F5', source: 'anatomy_mapping.csv' });
    }
  }

  messages.push('La postcoordinación requiere refinamiento y no hay una regla revisada disponible; no se sustituye por el default declarado.');
  return { code: null, status: STATUS.UNMAPPED, route: 'none', baselineDefault: stem.icd10Default || null };
}

// F6: ICD-O-3.2 topography -- NEVER derived from the ICD-10 result above.
// Label sources (2026-09-22, see reports/gap-analysis.md §1f): ICD-O
// topography codes ARE ICD-10 topography codes for 260/281 of the codes
// this project actually uses, but the TERM is not always the same (C47.9 is
// "Autonomic nervous system, NOS" in ICD-O, "Peripheral nerves and
// autonomic nervous system, unspecified" in ICD-10 -- curation 2026-10), so
// ICD-O's own Preferred term from
// `sources/icdo3.2/icdo3_topography_labels.csv` (mined from the official
// ICD-O-4 tabular's "b) Topography" sheet, same nomenclature as ICD-O-3.2)
// is tried FIRST; `ICD10_domains.csv`'s `preferred` is only the fallback
// for a code that table lacks. A code with neither gets `label: null`,
// shown as such, never invented.
function topographyLabel(bundle, code) {
  return bundle.icdo3TopographyLabels[code] ?? bundle.icd10Domains[code]?.preferred ?? null;
}

function resolveIcdoTopography({ stem, anatomyCode, profile, node, bundle }) {
  if (profile && node) {
    const topo = bundle.icdoTopoByKey[`${profile}|${node}`];
    if (topo) return { code: topo.icdo3Topography, label: topographyLabel(bundle, topo.icdo3Topography), status: STATUS.RESOLVED, route: 'F6', source: 'icdo_topo_groups.csv' };
  }
  if (anatomyCode) {
    const anat = bundle.anatomyByCode[anatomyCode];
    if (anat && anat.icdoTopography32) return { code: anat.icdoTopography32, label: topographyLabel(bundle, anat.icdoTopography32), status: STATUS.RESOLVED, route: 'F6', source: 'anatomy_mapping.csv' };
  }
  if (stem.icdo3TopographyDefault) {
    return { code: stem.icdo3TopographyDefault, label: topographyLabel(bundle, stem.icdo3TopographyDefault), status: STATUS.FALLBACK, route: 'F6', source: 'stem.icdo3_topography_default' };
  }
  return { code: null, label: null, status: STATUS.UNMAPPED, route: 'F6' };
}

// F7: ICD-O-3.2 morphology + behaviour. NOTE: the two possible sources
// disagree on format -- ICD11_histopathology_axis.csv's icdo3_morpho_code
// ALWAYS already includes the "/behaviour" suffix (verified: 1700/1700
// rows), while icd11_stem_defaults.csv's ICDO_3_morphology_code NEVER does
// (verified: 0/405 rows) and needs it appended from its own separate
// behaviour column. Never assume one format for both sources.
function resolveIcdoMorphology({ stem, histology, histologyCode, behaviour, messages }) {
  let morphoCode = null;
  let behaviourCode = null;
  let source = null;
  let label = null;
  if (histology) {
    morphoCode = histology.icdo3MorphoCode || null; // already "base/behaviour"
    behaviourCode = histology.icdo3BehaviourCode || null;
    source = histologyCode;
    label = histology.titleEn || null; // ICD11_histopathology_axis.csv's own titles are intact (unlike anatomy_mapping.csv's)
  } else if (stem.icdo3MorphologyCode) {
    morphoCode = stem.icdo3MorphologyCode; // bare base code, no slash
    behaviourCode = stem.icdo3BehaviourCode;
    source = 'stem_default';
  } else {
    return { code: null, label: null, status: STATUS.UNMAPPED, route: 'F7' };
  }
  if (!morphoCode) return { code: null, label: null, status: STATUS.UNMAPPED, route: 'F7' };

  const derivedBehaviour = ICDO_BEHAVIOUR_TO_CLINICAL[behaviourCode];
  const secondaryOk = derivedBehaviour === 'malignant' && stem.origin === 'secondary' && behaviourCode === '6';
  if (derivedBehaviour && behaviour && behaviour !== 'unknown' && derivedBehaviour !== behaviour && !secondaryOk) {
    messages.push('F7: el comportamiento del stem y el de la histopatología seleccionada difieren; revisar antes de codificar.');
    return { code: null, label: null, status: STATUS.CONFLICT, route: 'F7', catalogCode: morphoCode };
  }
  const baseCode = morphoCode.includes('/') ? morphoCode.split('/')[0] : morphoCode;
  const full = morphoCode.includes('/') ? morphoCode : behaviourCode ? `${morphoCode}/${behaviourCode}` : morphoCode;
  return { code: full, baseCode, behaviourCode, label, status: STATUS.RESOLVED, route: 'F7', source };
}

// F7 companion: ICD-O-4 morphology + behaviour, shown ALONGSIDE ICD-O-3.2
// (never derived from it -- ICD-O-4 has its own 5-digit code and its own
// stem-default columns, `ICDO_4_morphology_code`/`ICD_O_4_behaviour_code`,
// pending/empty for many stems -- see reports/gap-analysis.md, ICD-O-4 is
// still being rolled out). Same two-source-format caveat as F7 (verify
// before assuming): `ICD11_histopathology_axis.csv`'s `icdo4_morpho_code`
// already includes the slash; the stem-default column does not.
function resolveIcdoMorphology4({ stem, histology, histologyCode, behaviour, messages, bundle }) {
  let morphoCode = null;
  let behaviourCode = null;
  let source = null;
  if (histology && histology.icdo4MorphoCode) {
    morphoCode = histology.icdo4MorphoCode;
    behaviourCode = histology.icdo4BehaviourCode || null;
    source = histologyCode;
  } else if (stem.icdo4MorphologyCode) {
    morphoCode = stem.icdo4MorphologyCode;
    behaviourCode = stem.icdo4BehaviourCode;
    source = 'stem_default';
  } else {
    return { code: null, label: null, status: STATUS.UNMAPPED, route: 'F7_icdo4' };
  }
  if (!morphoCode) return { code: null, label: null, status: STATUS.UNMAPPED, route: 'F7_icdo4' };

  const derivedBehaviour = ICDO_BEHAVIOUR_TO_CLINICAL[behaviourCode];
  const secondaryOk = derivedBehaviour === 'malignant' && stem.origin === 'secondary' && behaviourCode === '6';
  if (derivedBehaviour && behaviour && behaviour !== 'unknown' && derivedBehaviour !== behaviour && !secondaryOk) {
    messages.push('F7 (CIE-O-4): el comportamiento del stem y el de la histopatología seleccionada difieren; revisar antes de codificar.');
    return { code: null, label: null, status: STATUS.CONFLICT, route: 'F7_icdo4', catalogCode: morphoCode };
  }
  const baseCode = morphoCode.includes('/') ? morphoCode.split('/')[0] : morphoCode;
  const full = morphoCode.includes('/') ? morphoCode : behaviourCode ? `${morphoCode}/${behaviourCode}` : morphoCode;
  // icdo4_morphology_labels.csv is keyed by the FULL "code/behaviour" (that's
  // how the ICD-O-4 tabular itself distinguishes e.g. 87210/0 vs 87210/3 as
  // different rows), not by the bare base code -- look up `full`, not `baseCode`.
  const preferredLabel = bundle.icdo4MorphologyLabels[full] ?? null;
  // A code's Preferred term is not always the entity that was selected:
  // 95060/1 is "Sellar neurocytoma" (Preferred) but also "Central
  // neurocytoma" (Related), and the ICD-11 histology XH0C11 IS the latter.
  // When the selected histology's own title is literally one of the code's
  // terms, show that term (with its level); otherwise the Preferred one.
  const title = histology && source === histologyCode ? (histology.titleEn || '').trim().toLowerCase() : '';
  const matched = title ? (bundle.icdo4MorphologyTerms?.[full] || []).find((t) => t.term.trim().toLowerCase() === title) : null;
  const label = matched ? matched.term : preferredLabel;
  const labelLevel = matched ? matched.level : preferredLabel ? 'Preferred' : null;
  return { code: full, baseCode, behaviourCode, label, labelLevel, preferredLabel, status: STATUS.RESOLVED, route: 'F7_icdo4', source };
}

export function resolveSelection(selection, bundle) {
  const trace = [];
  const messages = [];
  const rawExpr = String(selection.code || selection.expression || '').trim();
  const out = {
    expression: rawExpr,
    mapVersion: bundle.meta.version,
    status: STATUS.UNMAPPED,
    stem: null,
    anatomy: null,
    node: null,
    family: null,
    icd10: blank(STATUS.UNMAPPED),
    icdoTopography: blank(STATUS.UNMAPPED),
    icdoMorphology: blank(STATUS.UNMAPPED),
    icdoMorphology4: blank(STATUS.UNMAPPED),
    messages,
    trace,
  };

  // F0: capture and parse the expression.
  if (rawExpr.includes('/')) {
    out.status = STATUS.UNSUPPORTED;
    messages.push('F0: expresión con varios stems separados por "/"; esta versión no combina anatomías de componentes distintos.');
    return out;
  }
  const parts = rawExpr.replace(/\s+/g, '').split('&').filter(Boolean);
  if (!parts.length) {
    out.status = STATUS.INVALID;
    messages.push('F0: expresión vacía o no reconocida.');
    return out;
  }
  const stemCode = parts[0];
  const extCodes = [...new Set(parts.slice(1))];
  const stem = bundle.stemsByCode[stemCode];
  if (!stem) {
    out.status = STATUS.UNMAPPED;
    messages.push('F0: el stem no está en icd11_stem_defaults.csv (fuera del alcance de neoplasias cubierto por este mapa).');
    return out;
  }
  out.stem = { code: stem.code, label: stem.titleEn, family: stem.family, origin: stem.origin, behaviour: stem.behaviour, foundationUri: stem.foundationUri, isLeaf: stem.isLeaf };
  trace.push({ step: 'F0', stemCode, extensions: extCodes });

  // F1: effective clinical context.
  const anatomyExtCodes = extCodes.filter((c) => bundle.anatomyByCode[c] || bundle.anatomyRelationsByCode[c]);
  const histologyExtCodes = extCodes.filter((c) => bundle.histologyByCode[c]);
  const unrecognized = extCodes.filter((c) => !anatomyExtCodes.includes(c) && !histologyExtCodes.includes(c));
  if (anatomyExtCodes.length > 1 || histologyExtCodes.length > 1) {
    out.status = STATUS.AMBIGUOUS;
    messages.push('F1: hay varias anatomías o histopatologías postcoordinadas; se requiere una regla explícita de combinación, no se infiere.');
    return out;
  }
  const postAnatomy = anatomyExtCodes[0] || null;
  const postHistology = histologyExtCodes[0] || null;
  const anatomyCode = postAnatomy || stem.precoordinatedTopography || null;
  const histologyCode = postHistology || stem.precoordinatedMorphology || null;
  const anatomySource = postAnatomy ? 'postcoordination' : anatomyCode ? 'precoordination' : null;
  const histology = histologyCode ? bundle.histologyByCode[histologyCode] : null;

  // A behaviour nobody declared or derived stays `null` -- never a
  // placeholder. It used to become 'unknown', which is itself a real value
  // in rules.csv ("uncertain or unknown behaviour", ICD-10 D37-D48), so a
  // grouper like 2A01 silently matched meninges|primary|unknown|* -> D42.9.
  // User's rule (2026-09-24): null resolves as null; only declared or
  // derived data may drive a rule or a fallback.
  let behaviour = stem.behaviour && stem.behaviour !== 'undefined' ? stem.behaviour : null;
  if (!behaviour) {
    const derived = histology && ICDO_BEHAVIOUR_TO_CLINICAL[histology.icdo3BehaviourCode];
    if (derived) {
      behaviour = derived;
      trace.push({ step: 'F1_behaviour_from_histology', code: histologyCode, value: behaviour });
    } else {
      trace.push({ step: 'F1_behaviour_null' });
    }
  }

  // Only query anatomy_relations.csv's profile/node table for the domains
  // it was actually authored for -- see anatomyRelationsApplies() for why
  // asking it about e.g. a plain "breast"-domain stem is the wrong
  // question, not just a wrong answer.
  const relRows = anatomyCode && anatomyRelationsApplies(stem) ? bundle.anatomyRelationsByCode[anatomyCode] || [] : [];
  const { profile, node } = pickProfile(stem, behaviour, relRows);
  out.anatomy = anatomyCode ? { code: anatomyCode, source: anatomySource, profile, node } : null;
  out.node = node || null;
  out.family = effectiveFamily(stem, profile);

  out.icd10 = resolveIcd10({ stem, behaviour, anatomyCode, anatomyExtCode: postAnatomy, family: out.family, node, bundle, trace, messages });
  out.icdoTopography = resolveIcdoTopography({ stem, anatomyCode, profile, node, bundle });
  out.icdoMorphology = resolveIcdoMorphology({ stem, histology, histologyCode, behaviour, messages });
  out.icdoMorphology4 = resolveIcdoMorphology4({ stem, histology, histologyCode, behaviour, messages, bundle });

  if (stem.domain === 'heme') {
    messages.push('Familia hematolinfoide: la topografía CIE-O se resuelve de forma independiente del CIE-10 (sitio propio del stem, no derivado del grupo CIE-10).');
  }
  if (unrecognized.length) {
    messages.push(`F8: extensiones conservadas sin efecto en este destino (no soportadas en esta versión): ${unrecognized.join(', ')}.`);
  }

  const results = [out.icd10, out.icdoTopography, out.icdoMorphology];
  out.status = results.some((r) => r.status === STATUS.CONFLICT)
    ? STATUS.CONFLICT
    : results.some((r) => r.status === STATUS.AMBIGUOUS)
      ? STATUS.AMBIGUOUS
      : out.icd10.status === STATUS.UNMAPPED
        ? STATUS.UNMAPPED
        : results.some((r) => r.status === STATUS.CANDIDATE)
          ? STATUS.CANDIDATE
          : results.every((r) => r.code)
            ? STATUS.RESOLVED
            : results.some((r) => r.code)
              ? 'partial'
              : STATUS.UNMAPPED;

  // ICD-11 mandates coding to the most specific entity available -- a
  // non-terminal category is never itself the final answer, regardless of
  // how cleanly its own defaults resolved. Computed, not guessed: see
  // normalize.js's isLeaf (derived from the real code hierarchy).
  if (!stem.isLeaf && out.status !== STATUS.CONFLICT && out.status !== STATUS.AMBIGUOUS) {
    out.status = STATUS.NON_TERMINAL;
    messages.push('El stem es una categoría no terminal (tiene subcódigos reales). El resultado sirve para explorar; seleccione una categoría terminal antes de usar el código.');
  }

  return out;
}
