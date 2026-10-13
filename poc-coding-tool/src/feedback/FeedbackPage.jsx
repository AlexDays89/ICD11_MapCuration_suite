import React, { useEffect, useMemo, useRef, useState } from 'react';
import { VERDICTS } from './FeedbackBox.jsx';
import {
  FEEDBACK_NAMESPACES,
  clearFeedback,
  deleteFeedback,
  downloadBlob,
  downloadJson,
  fileStamp,
  importFeedback,
  loadFeedback,
  saveFeedback,
} from './feedbackStore.js';
import {
  clearCurationDecisions,
  deleteCurationDecision,
  importCurationDecisions,
  loadCurationDecisions,
  saveCurationDecision,
} from '../curation/curationStore.js';
import { subscribeStore } from '../storeEvents.js';
import { buildXlsx } from './xlsx.js';

const VERDICT_LABEL = Object.fromEntries(VERDICTS);
const DECISIONS = [
  ['accepted', 'Aceptado'],
  ['changed', 'Cambiado'],
  ['flagged', 'Marcado para revisar'],
];
const DECISION_LABEL = Object.fromEntries(DECISIONS);
const AXIS_LABEL = {
  icd10: 'CIE-10',
  icdoTopography: 'CIE-O-3.2 topo',
  icdoMorphology: 'CIE-O-3.2 morfo',
  icdoMorphology4: 'CIE-O-4 morfo',
};

// One row shape for both caches, so a single table can list them.
function loadRows() {
  const feedback = FEEDBACK_NAMESPACES.flatMap((ns) =>
    loadFeedback(ns).map((r) => ({
      kind: 'feedback',
      id: r.feedbackId,
      instance: r.instance || ns,
      code: r.rawSelectionPayload?.code || '(sin código)',
      title: r.rawSelectionPayload?.title || '',
      status: VERDICT_LABEL[r.verdict] || r.verdict,
      text: r.note || '',
      tags: (r.tags || []).join(', '),
      updatedAt: r.updatedAt,
      record: r,
    }))
  );
  const curation = loadCurationDecisions().map((r) => ({
    kind: 'curation',
    id: r.curationId,
    instance: '—',
    code: r.expression || r.rawEntity?.code || '(sin código)',
    title: r.rawEntity?.title || '',
    status: `${AXIS_LABEL[r.axis] || r.axis}: ${DECISION_LABEL[r.decision] || r.decision}${
      r.decision === 'changed' ? ` ${r.proposedCode ?? '—'} → ${r.correctedCode ?? '—'}` : ` (${r.proposedCode ?? '—'})`
    }`,
    text: r.rationale || '',
    tags: '',
    updatedAt: r.updatedAt,
    record: r,
  }));
  return [...feedback, ...curation].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleString('es-CL') : '—';
}

// Pestaña "Feedback": revisión de todo lo guardado en caché local (feedback
// de ambas instancias + decisiones de curación), con edición en un modal,
// importación/exportación en un solo paso (JSON o Excel) y borrado total
// cuando se quiere partir de nuevo. localStorage persiste entre sesiones.
export function FeedbackPage() {
  const [rows, setRows] = useState(loadRows);
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);

  useEffect(() => subscribeStore(() => setRows(loadRows())), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (kind === 'all' || r.kind === kind) &&
        (!q || [r.code, r.title, r.text, r.tags, r.status].some((v) => v.toLowerCase().includes(q)))
    );
  }, [rows, kind, query]);

  const counts = {
    feedback: rows.filter((r) => r.kind === 'feedback').length,
    curation: rows.filter((r) => r.kind === 'curation').length,
  };
  const openRow = rows.find((r) => r.id === openId) || null;

  function exportJson() {
    downloadJson(`poc-coding-tool-cache-${fileStamp()}.json`, {
      exportedAt: new Date().toISOString(),
      feedback: FEEDBACK_NAMESPACES.flatMap((ns) => loadFeedback(ns)),
      curationDecisions: loadCurationDecisions(),
    });
  }

  function exportExcel() {
    const fb = FEEDBACK_NAMESPACES.flatMap((ns) => loadFeedback(ns));
    const cur = loadCurationDecisions();
    const blob = buildXlsx([
      {
        name: 'Feedback',
        rows: [
          ['feedbackId', 'instancia', 'código', 'título', 'veredicto', 'nota', 'tags', 'otherPostcoordination', 'linearizationUri', 'foundationUri', 'mapVersion', 'revisión', 'creado', 'actualizado'],
          ...fb.map((r) => [
            r.feedbackId, r.instance, r.rawSelectionPayload?.code, r.rawSelectionPayload?.title, r.verdict, r.note,
            (r.tags || []).join(', '), r.otherPostcoordinationEnabled ? 'sí' : 'no', r.rawSelectionPayload?.linearizationUri,
            r.rawSelectionPayload?.foundationUri, r.mapVersion, r.revision, r.createdAt, r.updatedAt,
          ]),
        ],
      },
      {
        name: 'Curación',
        rows: [
          ['curationId', 'expresión', 'título', 'eje', 'propuesto', 'estado propuesto', 'ruta', 'decisión', 'código corregido', 'fundamento', 'stem', 'familia', 'nodo', 'linearizationUri', 'foundationUri', 'mapVersion', 'creado', 'actualizado'],
          ...cur.map((r) => [
            r.curationId, r.expression, r.rawEntity?.title, r.axis, r.proposedCode, r.proposedStatus, r.proposedRoute, r.decision,
            r.correctedCode, r.rationale, r.stemCode, r.family, r.node, r.rawEntity?.linearizationUri, r.rawEntity?.foundationUri,
            r.mapVersion, r.createdAt, r.updatedAt,
          ]),
        ],
      },
    ]);
    downloadBlob(`poc-coding-tool-cache-${fileStamp()}.xlsx`, blob);
  }

  // Accepts this tab's combined export and the older per-store exports
  // (plain arrays of feedback or curation records), several files at once.
  async function importFiles(files) {
    let fb = 0;
    let cur = 0;
    const errors = [];
    for (const file of files) {
      try {
        const data = JSON.parse(await file.text());
        const items = Array.isArray(data) ? data : [...(data.feedback || []), ...(data.curationDecisions || [])];
        fb += importFeedback(items.filter((x) => x?.feedbackId));
        cur += importCurationDecisions(items.filter((x) => x?.curationId));
      } catch (e) {
        errors.push(`${file.name}: ${e.message}`);
      }
    }
    setMessage(
      `Importado: ${fb} feedback, ${cur} decisiones de curación (nuevos o más recientes).` +
        (errors.length ? ` Errores: ${errors.join('; ')}` : '')
    );
  }

  function clearAll() {
    if (!window.confirm('¿Borrar todo el feedback y las decisiones de curación de la caché local? Exporta antes si los necesitas.')) return;
    FEEDBACK_NAMESPACES.forEach(clearFeedback);
    clearCurationDecisions();
    setMessage('Caché vaciada.');
  }

  return (
    <div className="feedback-page">
      <div className="feedback-page-toolbar">
        <div className="segmented">
          {[
            ['all', `Todo (${rows.length})`],
            ['feedback', `Feedback (${counts.feedback})`],
            ['curation', `Curación (${counts.curation})`],
          ].map(([id, label]) => (
            <button key={id} className={kind === id ? 'active' : ''} onClick={() => setKind(id)}>
              {label}
            </button>
          ))}
        </div>
        <input
          className="feedback-page-search"
          placeholder="Buscar código, título, texto…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="feedback-page-actions">
          <button onClick={exportJson} disabled={rows.length === 0}>Exportar JSON</button>
          <button onClick={exportExcel} disabled={rows.length === 0}>Exportar Excel</button>
          <button onClick={() => fileRef.current?.click()}>Importar JSON</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            multiple
            hidden
            onChange={(e) => {
              importFiles([...e.target.files]);
              e.target.value = '';
            }}
          />
          <button className="danger" onClick={clearAll} disabled={rows.length === 0}>Vaciar caché</button>
        </div>
      </div>
      {message && <p className="feedback-page-message">{message}</p>}

      {filtered.length === 0 ? (
        <p className="feedback-page-empty">
          {rows.length === 0 ? 'Aún no hay feedback ni decisiones guardadas en esta caché.' : 'Nada coincide con el filtro.'}
        </p>
      ) : (
        <div className="feedback-table-wrap">
          <table className="feedback-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Instancia</th>
                <th>Código</th>
                <th>Estado</th>
                <th>Texto</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.kind}-${r.id}`} onClick={() => setOpenId(r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenId(r.id)}>
                  <td><span className={`kind-badge kind-${r.kind}`}>{r.kind === 'feedback' ? 'Feedback' : 'Curación'}</span></td>
                  <td>{r.instance}</td>
                  <td className="code-cell" title={r.title}><code>{r.code}</code></td>
                  <td>{r.status}</td>
                  <td>{r.text ? <div className="text-clamp">{r.text}</div> : <span className="muted">—</span>}</td>
                  <td className="date-cell">{fmtDate(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openRow && <RecordModal key={openRow.id} row={openRow} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function RecordModal({ row, onClose }) {
  const r = row.record;
  const isFeedback = row.kind === 'feedback';
  const [note, setNote] = useState(isFeedback ? r.note || '' : r.rationale || '');
  const [tags, setTags] = useState((r.tags || []).join(', '));
  const [verdict, setVerdict] = useState(r.verdict || 'review');
  const [decision, setDecision] = useState(r.decision || 'accepted');
  const [correctedCode, setCorrectedCode] = useState(r.correctedCode || '');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function save() {
    const now = new Date().toISOString();
    if (isFeedback) {
      if (!note.trim()) return setError('La nota no puede quedar vacía.');
      saveFeedback(row.instance, {
        ...r,
        note: note.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        verdict,
        revision: (r.revision || 1) + 1,
        updatedAt: now,
      });
    } else {
      if (decision !== 'accepted' && !note.trim()) return setError('Escribe el fundamento para un cambio o una marca para revisar.');
      saveCurationDecision({
        ...r,
        decision,
        correctedCode: decision === 'changed' ? correctedCode.trim() || null : null,
        rationale: note.trim() || null,
        updatedAt: now,
      });
    }
    onClose();
  }

  function remove() {
    if (!window.confirm(`¿Eliminar este registro de ${row.code}?`)) return;
    if (isFeedback) deleteFeedback(row.instance, r.feedbackId);
    else deleteCurationDecision(r.curationId);
    onClose();
  }

  const ctx = isFeedback ? r.rawSelectionPayload : r.rawEntity;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Registro ${row.code}`}>
        <div className="modal-header">
          <div>
            <span className={`kind-badge kind-${row.kind}`}>{isFeedback ? `Feedback · ${row.instance}` : 'Curación'}</span>
            <h3>
              <code>{row.code}</code>
            </h3>
            {ctx?.title && <p className="modal-subtitle">{ctx.title}</p>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="modal-body">
          <dl className="modal-meta">
            {!isFeedback && (
              <>
                <dt>Eje</dt>
                <dd>{AXIS_LABEL[r.axis] || r.axis}</dd>
                <dt>Propuesto</dt>
                <dd>
                  <code>{r.proposedCode ?? '—'}</code> ({r.proposedStatus ?? '—'}, ruta {r.proposedRoute ?? '—'})
                </dd>
              </>
            )}
            {isFeedback && (
              <>
                <dt>otherPostcoordination</dt>
                <dd>{r.otherPostcoordinationEnabled ? 'ON' : 'OFF'}</dd>
                <dt>Revisión</dt>
                <dd>{r.revision || 1}</dd>
              </>
            )}
            <dt>Creado / actualizado</dt>
            <dd>
              {fmtDate(r.createdAt)} / {fmtDate(r.updatedAt)}
            </dd>
            <dt>Mapa</dt>
            <dd>{r.mapVersion || '—'}</dd>
          </dl>

          {isFeedback ? (
            <div className="modal-row">
              <select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
                {VERDICTS.map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
              <input placeholder="tags separados por coma" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
          ) : (
            <div className="modal-row">
              <select value={decision} onChange={(e) => setDecision(e.target.value)}>
                {DECISIONS.map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
              {decision === 'changed' && (
                <input className="mono" placeholder="Código correcto" value={correctedCode} onChange={(e) => setCorrectedCode(e.target.value)} />
              )}
            </div>
          )}

          <textarea
            rows={10}
            value={note}
            placeholder={isFeedback ? 'Nota' : 'Fundamento'}
            onChange={(e) => {
              setNote(e.target.value);
              setError('');
            }}
          />
          {isFeedback && r.textOriginal && r.textOriginal !== note && (
            <details className="modal-json">
              <summary>Texto original</summary>
              <p className="modal-original">{r.textOriginal}</p>
            </details>
          )}
          {error && <p className="modal-error">{error}</p>}

          <details className="modal-json">
            <summary>Registro completo (JSON)</summary>
            <pre>{JSON.stringify(r, null, 2)}</pre>
          </details>
        </div>

        <div className="modal-footer">
          <button className="danger" onClick={remove}>Eliminar</button>
          <span className="spacer" />
          <button onClick={onClose}>Cancelar</button>
          <button className="primary" onClick={save}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

export default FeedbackPage;
