// Builds the rich per-selection capture record the user explicitly asked
// for: original + normalized query text, the list of candidate results that
// were on screen at selection time (best-effort DOM scrape -- ECT's public
// callback only fires with the final selection, not the intermediate
// search-result list, so this is observational, not from a documented API;
// see `captureLimitations` below, following the Prompt Maestro's rule to
// record what could/couldn't be verified rather than guess), the raw
// selectedEntity payload, the /describe response (added later by the page
// once useEntityDetail resolves it), and the otherPostcoordination toggle
// state at that moment.
import { newFeedbackId } from './feedback/feedbackStore.js';

function normalizeQuery(text) {
  return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Scrapes ECT's own rendered result list (`.entityInList` items, each with
// `.entityTheCode`/`.entityTitle` -- the same DOM shape referenced in
// ideas/codificador_oms_v2's EmbeddedBrowser.tsx) from a container. Must be
// called BEFORE `ECT.Handler.clear(iNo)` runs, since that tears the popup
// down.
export function scrapeCandidates(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll('.entityInList')).map((item) => ({
    code: item.querySelector('.entityTheCode')?.textContent?.trim() || null,
    title: item.querySelector('.entityTitle')?.textContent?.trim() || null,
  }));
}

export function buildCaptureRecord({ instance, entity, queryText, candidates, otherPostcoordinationEnabled }) {
  return {
    selectionId: newFeedbackId(),
    instance,
    timestamp: new Date().toISOString(),
    entity,
    query: {
      original: queryText || entity?.searchQuery || null,
      normalized: normalizeQuery(queryText || entity?.searchQuery || ''),
    },
    searchCandidates: candidates || [],
    describeData: null, // filled in by the page once useEntityDetail resolves it
    indexTerm: null, // filled in by the page from the entity fetch (WHO's own indexTerm field)
    otherPostcoordinationEnabled: Boolean(otherPostcoordinationEnabled),
    captureLimitations:
      candidates && candidates.length > 0
        ? null
        : 'No se pudieron observar candidatos de búsqueda en el DOM al momento de la selección (lista vacía o widget ya la había limpiado).',
  };
}
