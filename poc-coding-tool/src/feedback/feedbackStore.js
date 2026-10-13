// Local-only feedback cache, per instance ("browser" / "codingtool" --
// deliberately NOT shared between the two, per the user's ask). No backend
// for this iteration ("por mientras el feedback se guardará en cache"):
// localStorage (persists across sessions until "Vaciar caché" in the
// Feedback tab) + JSON/Excel export, per Prompt Maestro §8.1's minimum
// ("Usa almacenamiento persistente local... No exijas un servidor adicional
// solamente para el piloto").
import { notifyStoreChanged } from '../storeEvents.js';

const KEY_PREFIX = 'poc-coding-tool:feedback:';
export const FEEDBACK_NAMESPACES = ['browser', 'codingtool'];

export function newFeedbackId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function loadFeedback(namespace) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + namespace);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeFeedback(namespace, list) {
  try {
    localStorage.setItem(KEY_PREFIX + namespace, JSON.stringify(list));
  } catch (e) {
    console.error('No se pudo guardar en localStorage (¿espacio agotado?):', e);
  }
  notifyStoreChanged();
  return list;
}

export function saveFeedback(namespace, record) {
  const list = loadFeedback(namespace);
  const idx = list.findIndex((f) => f.feedbackId === record.feedbackId);
  if (idx >= 0) list[idx] = record;
  else list.unshift(record);
  return writeFeedback(namespace, list);
}

export function deleteFeedback(namespace, feedbackId) {
  return writeFeedback(namespace, loadFeedback(namespace).filter((f) => f.feedbackId !== feedbackId));
}

export function clearFeedback(namespace) {
  return writeFeedback(namespace, []);
}

// Merges previously exported records back into the cache (by feedbackId;
// the most recently updated copy wins). Returns how many were added/updated.
export function importFeedback(records) {
  let count = 0;
  for (const ns of FEEDBACK_NAMESPACES) {
    const incoming = records.filter((r) => r?.feedbackId && (r.instance || 'browser') === ns);
    if (incoming.length === 0) continue;
    const list = loadFeedback(ns);
    for (const r of incoming) {
      const idx = list.findIndex((f) => f.feedbackId === r.feedbackId);
      if (idx < 0) list.unshift(r);
      else if ((r.updatedAt || '') > (list[idx].updatedAt || '')) list[idx] = r;
      else continue;
      count++;
    }
    list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    writeFeedback(ns, list);
  }
  return count;
}

export function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(name, value) {
  downloadBlob(name, new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
}

export function fileStamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

export function exportFeedback(namespace) {
  downloadJson(`feedback-${namespace}-${fileStamp()}.json`, loadFeedback(namespace));
}
