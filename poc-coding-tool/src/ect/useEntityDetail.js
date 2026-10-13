import { useCallback, useState } from 'react';
import { WHO_MMS_BASE } from '../ectConfig.js';

// Ported from ideas/codificador_oms_v2/hooks/useEntityDetail.ts, with the
// Next.js `/api/who-proxy` route dropped: this project's WHO_MMS_BASE points
// at the public dev/test host, confirmed (via curl, not assumed) to answer
// with `Access-Control-Allow-Origin: *` on /mms/{id}, /mms/describe and
// /mms/codeinfo, so the browser can fetch it directly.
async function whoFetch(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'Accept-Language': 'es', 'API-Version': 'v2' } });
  if (!res.ok) throw new Error(`WHO API HTTP ${res.status}: ${url}`);
  return res.json();
}

// REAL BUG FOUND 2026-09-22 (via read_network_requests, not guessed): the
// ECT widget's own `linearizationUri`/`foundationUri` fields are namespaced
// under `id.who.int` -- WHO's canonical IDENTIFIER space, not necessarily a
// fetchable endpoint on whichever host we configured. Using it directly as
// a fetch URL sent `GET http://id.who.int/icd/release/11/2026-01/mms/<id>`
// straight at production (wrong host, wrong protocol, no auth) -> 503,
// surfacing as "Failed to fetch" and silently aborting the describe call
// too (same try block). Fix: extract just the numeric entity id and always
// rebuild the URL against our own configured WHO_MMS_BASE.
function entityIdFromUriSegment(seg) {
  const s = (seg || '').trim();
  const m = /\/(\d+)(?:\/(?:other|unspecified))?$/.exec(s);
  return m ? m[1] : null;
}

// A postcoordinated selection's `linearizationUri`/`code` is a composite
// ("<stemUri> & <extUri1> & <extUri2>", "<stemCode>&<extCode1>&<extCode2>").
// `/mms/{id}` only resolves a single entity, so entity-detail lookups need
// just the BASE stem. `/describe`, in contrast, DOES accept the full
// composite ("stem&postcoord&postcoord") and returns the postcoordinated
// description -- confirmed by the user 2026-09-22, so describe must be
// called with the whole raw string, not just the base.
function firstComposite(value) {
  return (value || '').split('&')[0]?.trim() || null;
}

export function useEntityDetail() {
  const [entityData, setEntityData] = useState(null);
  const [describeData, setDescribeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [describeLoading, setDescribeLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDetail = useCallback(async (entity) => {
    setLoading(true);
    setDescribeData(null);
    setError(null);

    try {
      // Con postcoordinación, linearizationUri/code pueden ser compuestos
      // ("...mms/BA00 & ...mms/XA1234", "BA00&XA1234") -- la entidad base
      // va antes del separador.
      const rawLinUri = entity.linearizationUri || null;
      const baseLinUri = firstComposite(rawLinUri);
      const baseCode = entity.code?.split(/[&/]/)[0]?.trim() ?? null;

      let entityId = entityIdFromUriSegment(baseLinUri);
      if (!entityId && baseCode) {
        const codeinfo = await whoFetch(`${WHO_MMS_BASE}/codeinfo/${encodeURIComponent(baseCode)}?flexiblemode=true`);
        entityId = entityIdFromUriSegment(codeinfo.stemId);
        if (!entityId) throw new Error('stemId no encontrado en codeinfo');
      }
      if (!entityId) throw new Error('Sin URI ni código para consultar');

      const data = await whoFetch(`${WHO_MMS_BASE}/${entityId}`);
      setEntityData({
        raw: data,
        stemId: data['@id'],
        browserUrl: data.browserUrl,
        code: data.code,
        title: typeof data.title === 'object' ? data.title['@value'] : data.title,
        classKind: data.classKind,
        child: data.child,
        parent: data.parent,
        indexTerm: data.indexTerm,
        source: data.source,
      });

      // Describe soporta la URI compuesta completa (stem&postcoord&postcoord)
      // -- se envía tal cual, sin recortar al primer componente, para que la
      // descripción devuelta refleje toda la postcoordinación seleccionada.
      const describeUri = rawLinUri || entity.foundationUri || data.source;
      if (describeUri) {
        setDescribeLoading(true);
        whoFetch(`${WHO_MMS_BASE}/describe?uri=${encodeURIComponent(describeUri)}`)
          .then((d) => setDescribeData(d))
          .catch(() => null)
          .finally(() => setDescribeLoading(false));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setEntityData(null);
    setDescribeData(null);
    setError(null);
  }, []);

  return { entityData, describeData, loading, describeLoading, error, fetchDetail, clear };
}

export default useEntityDetail;
