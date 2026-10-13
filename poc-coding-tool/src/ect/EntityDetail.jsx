import React, { useState } from 'react';

// Ported from the EntityDetail component inside
// ideas/codificador_oms_v2/components/CIE11/EmbeddedBrowser.tsx (lines
// ~358-508) -- same 5-tab lateral JSON panel, used identically by both the
// Browser page and the Coding Tool page so their side output is the same
// shape either way (part of the user's explicit ask).
function Pre({ children }) {
  return (
    <pre className="entity-detail-pre">{JSON.stringify(children, null, 2)}</pre>
  );
}

export function EntityDetail({
  entity,
  events = [],
  entityData,
  entityDataLoading,
  entityDataError,
  describeData,
  describeLoading,
  className = '',
}) {
  const [tab, setTab] = useState('fields');

  if (!entity) {
    return <div className={`entity-detail-empty ${className}`}>Ninguna entidad seleccionada</div>;
  }

  const fields = [
    { label: 'Código', value: entity.code },
    { label: 'Título', value: entity.title },
    { label: 'URI linealización', value: entity.linearizationUri },
    { label: 'URI fundación', value: entity.foundationUri },
    { label: 'Texto seleccionado', value: entity.selectedText },
    { label: 'Query', value: entity.searchQuery },
    { label: 'Instancia (iNo)', value: entity.iNo },
  ];

  const tabButton = (id, label, badge) => (
    <button className={`entity-detail-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
      {label} {badge}
    </button>
  );

  return (
    <div className={`entity-detail ${className}`}>
      <div className="entity-detail-tabs">
        {tabButton('fields', 'Campos')}
        {tabButton('json', 'JSON ECT')}
        {tabButton('api', 'Entidad', entityDataLoading ? '⏳' : '')}
        {tabButton('describe', 'Describe', describeLoading ? '⏳' : '')}
        {tabButton('history', 'Historial', events.length > 0 ? `(${events.length})` : '')}
      </div>

      {tab === 'fields' && (
        <div className="entity-detail-fields">
          {fields
            .filter((f) => f.value)
            .map(({ label, value }) => (
              <div key={label} className="entity-detail-field">
                <span className="entity-detail-field-label">{label}: </span>
                <span className="entity-detail-field-value">{value}</span>
              </div>
            ))}
        </div>
      )}

      {tab === 'json' && <Pre>{entity}</Pre>}

      {tab === 'api' && (
        <div className="entity-detail-panel">
          {entityDataLoading && <p className="entity-detail-note">Cargando datos de WHO API...</p>}
          {entityDataError && <p className="entity-detail-error">Error: {entityDataError}</p>}
          {!entityDataLoading && !entityDataError && !entityData && (
            <p className="entity-detail-note muted">Sin datos de API aún</p>
          )}
          {entityData && <Pre>{entityData}</Pre>}
        </div>
      )}

      {tab === 'describe' && (
        <div className="entity-detail-panel">
          {describeLoading && <p className="entity-detail-note">Cargando describe...</p>}
          {!describeLoading && !describeData && <p className="entity-detail-note muted">Sin datos de describe aún</p>}
          {describeData && <Pre>{describeData}</Pre>}
        </div>
      )}

      {tab === 'history' && (
        <div className="entity-detail-panel">
          {events.length === 0 ? (
            <p className="entity-detail-note muted">Sin eventos aún</p>
          ) : (
            [...events].reverse().map((ev, i) => (
              <details key={i} className="entity-detail-history-item">
                <summary>
                  #{events.length - i} — {ev.entity?.code || '(sin código)'} · {(ev.entity?.title || '').slice(0, 40)}
                </summary>
                <Pre>{ev}</Pre>
              </details>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default EntityDetail;
