import React, { useEffect, useMemo, useState } from 'react';
import { resolveSelection } from './resolve.js';
import { CurationPanel } from '../curation/CurationPanel.jsx';

const STATUS_LABEL = {
  resolved: 'Resuelto',
  fallback: 'Resuelto por defecto (fallback)',
  candidate: 'Revisar relación',
  unmapped: 'Sin relación',
  ambiguous: 'Ambiguo',
  conflict: 'Conflicto',
  invalid_input: 'Entrada inválida',
  non_terminal: 'Categoría no terminal',
  unsupported: 'Expresión no soportada',
  partial: 'Resolución parcial',
};

let mapDataPromise = null;
function loadMapData() {
  if (!mapDataPromise) {
    mapDataPromise = fetch('/map-v2.bundle.json').then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar map-v2.bundle.json (${r.status})`);
      return r.json();
    });
  }
  return mapDataPromise;
}

// Fase 2: reemplaza el map.v2.json/resolve-map.js ad-hoc de laboratorio-mapas
// por el compilador real de ../map-v2 (F0-F7 desde los 8 CSV de
// Datasets/final, ver map-v2/reports/gap-analysis.md). Misma UI de Fase 1 --
// solo cambia la fuente de datos y el resolver, ambos copiados tal cual
// (sin red, función pura) desde map-v2/dist y map-v2/compiler/resolve.js.
export function MapPanel({ selection, onData }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadMapData()
      .then((d) => {
        setData(d);
        onData?.(d);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = useMemo(() => (data && selection ? resolveSelection(selection, data) : null), [data, selection]);

  if (error) return <div className="map-panel map-panel-error">{error}</div>;
  if (!selection) {
    return <div className="map-panel map-panel-empty">Selecciona un código para ver su resolución.</div>;
  }
  if (!result) return <div className="map-panel">Cargando mapa…</div>;

  const stem = result.stem;

  return (
    <div className="map-panel">
      <div className="map-panel-header">
        {/* Expresión completa (stem + postcoordinaciones), no solo el stem. */}
        <code>{result.expression}</code>
        <h3>{stem?.label || 'Selección no reconocida'}</h3>
        {stem?.code && stem.code !== result.expression && <small className="map-panel-stem">stem {stem.code}</small>}
        <span className={`map-status map-status-${result.status}`}>{STATUS_LABEL[result.status] || result.status}</span>
      </div>

      <div className="map-panel-grid">
        {[
          ['CIE-10', result.icd10],
          ['CIE-O-3.2 · topografía', result.icdoTopography],
          ['CIE-O-3.2 · morfología', result.icdoMorphology],
          ['CIE-O-4 · morfología', result.icdoMorphology4],
        ].map(([label, x]) => (
          <article key={label} className="map-result-card">
            <h4>{label}</h4>
            <strong>{x?.code || '—'}</strong>
            {/* Etiqueta (qué es el código) y estado (cómo se llegó a él) son
                dos cosas distintas -- nunca una sustituye a la otra. */}
            <p className="map-result-label">{x?.label || (x?.code ? 'Sin etiqueta disponible' : '—')}</p>
            <span className={`map-result-status map-status-${x?.status}`}>{STATUS_LABEL[x?.status] || x?.status || '—'}</span>
          </article>
        ))}
      </div>

      {result.messages.length > 0 && (
        <div className="map-panel-rationale">
          {result.messages.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
        </div>
      )}

      <CurationPanel expression={result.expression} result={result} rawEntity={selection} />

      <details className="map-panel-technical">
        <summary>Selección, fuentes y trazabilidad</summary>
        <pre>{JSON.stringify({ selection, result }, null, 2)}</pre>
      </details>
    </div>
  );
}

export default MapPanel;
