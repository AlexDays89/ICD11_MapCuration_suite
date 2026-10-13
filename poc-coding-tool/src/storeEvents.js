// Tiny change-notification bus for the local caches (feedback + curation),
// so the Feedback tab, the inline FeedbackBox and CurationPanel all see an
// edit/delete/import made from any of them without a reload. Also relays
// the browser's own `storage` event, so a second open tab stays in sync.
const EVENT = 'poc-coding-tool:store-changed';

export function notifyStoreChanged() {
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeStore(callback) {
  const onStorage = (e) => {
    if (!e.key || e.key.startsWith('poc-coding-tool:')) callback();
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}
