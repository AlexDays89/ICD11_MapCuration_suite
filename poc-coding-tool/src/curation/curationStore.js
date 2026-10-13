// Local cache of curation decisions -- Prompt Maestro §8.3 "Vía B:
// conocimiento para reconstruir el mapa" (distinct from FeedbackBox, which
// is §8.2 "Vía A: hallazgos sobre ECT/API/terminología"). One shared store
// across both pages (Browser/Coding Tool): a decision about whether
// "2A00.0&XH7F82 -> C71.9" is correct doesn't depend on which widget was
// used to reach it. No backend for this iteration, same as feedbackStore.js.
import { notifyStoreChanged } from '../storeEvents.js';
import { downloadJson, fileStamp } from '../feedback/feedbackStore.js';

const KEY = 'poc-coding-tool:curation-decisions';

export function newCurationId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function loadCurationDecisions() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCurationDecisions(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) {
    console.error('No se pudo guardar la decisión de curación (¿espacio agotado?):', e);
  }
  notifyStoreChanged();
  return list;
}

export function saveCurationDecision(record) {
  const list = loadCurationDecisions();
  const idx = list.findIndex((d) => d.curationId === record.curationId);
  if (idx >= 0) list[idx] = record;
  else list.unshift(record);
  return writeCurationDecisions(list);
}

export function deleteCurationDecision(curationId) {
  return writeCurationDecisions(loadCurationDecisions().filter((d) => d.curationId !== curationId));
}

export function clearCurationDecisions() {
  return writeCurationDecisions([]);
}

// Same merge rule as importFeedback: by curationId, newest updatedAt wins.
export function importCurationDecisions(records) {
  const list = loadCurationDecisions();
  let count = 0;
  for (const r of records.filter((x) => x?.curationId)) {
    const idx = list.findIndex((d) => d.curationId === r.curationId);
    if (idx < 0) list.unshift(r);
    else if ((r.updatedAt || '') > (list[idx].updatedAt || '')) list[idx] = r;
    else continue;
    count++;
  }
  list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  writeCurationDecisions(list);
  return count;
}

export function decisionsForExpression(expression) {
  return loadCurationDecisions().filter((d) => d.expression === expression);
}

export function exportCurationDecisions() {
  downloadJson(`curation-decisions-${fileStamp()}.json`, loadCurationDecisions());
}
