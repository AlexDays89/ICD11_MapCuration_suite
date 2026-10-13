import React, { useEffect, useState } from 'react';
import { decisionsForExpression, newCurationId, saveCurationDecision } from './curationStore.js';
import { subscribeStore } from '../storeEvents.js';

const AXES = [
  ['icd10', 'CIE-10'],
  ['icdoTopography', 'CIE-O-3.2 · topografía'],
  ['icdoMorphology', 'CIE-O-3.2 · morfología'],
  ['icdoMorphology4', 'CIE-O-4 · morfología'],
];

const DECISION_LABEL = {
  accepted: 'Aceptado',
  changed: 'Cambiado',
  flagged: 'Marcado para revisar',
};

// Curación real bajo la resolución CIE (Prompt Maestro §8.3, "Vía B"): el
// usuario acepta la propuesta, la corrige eligiendo/escribiendo el código
// correcto, o la marca para revisar -- siempre con un fundamento. Esto no
// modifica el mapa compilado (map-v2/); queda como una propuesta local,
// exportable, que un curador puede convertir después en un patch real del
// compilador (ver map-v2/reports/gap-analysis.md §6).
//
// `rawEntity` (el ISelectedEntity crudo del ECT -- query, título,
// selectedText, foundationUri, linearizationUri) se guarda junto con la
// decisión, no solo el código: pedido explícito del usuario 2026-09-22 para
// poder cruzar más adelante con conceptos de Foundation que el buscador
// expone pero que no están linealizados en MMS -- sin decidir esa
// integración ahora, alcanza con no perder el string+etiquetas+URI.
export function CurationPanel({ expression, result, rawEntity }) {
  const [axis, setAxis] = useState('icd10');
  const [decision, setDecision] = useState('accepted');
  const [correctedCode, setCorrectedCode] = useState('');
  const [rationale, setRationale] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [existing, setExisting] = useState(() => decisionsForExpression(expression));

  useEffect(() => {
    setExisting(decisionsForExpression(expression));
    setEditingId(null);
    setMessage('');
  }, [expression]);

  // Edits/deletes/imports done from the Feedback tab show up here too.
  useEffect(() => subscribeStore(() => setExisting(decisionsForExpression(expression))), [expression]);

  const proposed = result?.[axis];

  function save() {
    if (decision !== 'accepted' && !rationale.trim()) {
      setMessage('Escribe el fundamento antes de guardar un cambio o una marca para revisar.');
      return;
    }
    const record = {
      curationId: editingId || newCurationId(),
      createdAt: existing.find((d) => d.curationId === editingId)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expression,
      mapVersion: result?.mapVersion || null,
      axis,
      proposedCode: proposed?.code ?? null,
      proposedStatus: proposed?.status ?? null,
      proposedRoute: proposed?.route ?? null,
      decision,
      correctedCode: decision === 'changed' ? correctedCode.trim() || null : null,
      rationale: rationale.trim() || null,
      stemCode: result?.stem?.code ?? null,
      family: result?.family ?? null,
      node: result?.node ?? null,
      rawEntity: rawEntity
        ? {
            query: rawEntity.searchQuery ?? null,
            title: rawEntity.title ?? null,
            selectedText: rawEntity.selectedText ?? null,
            code: rawEntity.code ?? null,
            foundationUri: rawEntity.foundationUri ?? null,
            linearizationUri: rawEntity.linearizationUri ?? null,
          }
        : null,
    };
    saveCurationDecision(record);
    // Clear the form right away so the next save is always a NEW decision --
    // staying in edit mode let a later save (other axis/code) overwrite
    // this one silently.
    reset();
    setMessage(`Decisión guardada para ${expression} · ${AXES.find(([id]) => id === axis)?.[1] || axis}.`);
  }

  function edit(record) {
    setAxis(record.axis);
    setDecision(record.decision);
    setCorrectedCode(record.correctedCode || '');
    setRationale(record.rationale || '');
    setEditingId(record.curationId);
    setMessage('Editando decisión guardada.');
  }

  function reset() {
    setDecision('accepted');
    setCorrectedCode('');
    setRationale('');
    setEditingId(null);
    setMessage('');
  }

  return (
    <div className="curation-panel">
      <div className="curation-panel-header">
        <h3>
          Curación de <code>{expression}</code>
        </h3>
      </div>

      <div className="curation-panel-controls">
        <label>
          Eje
          <select value={axis} onChange={(e) => setAxis(e.target.value)}>
            {AXES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="curation-proposed">
          Propuesto: <code>{proposed?.code ?? '—'}</code> ({proposed?.status ?? 'sin resolución'})
        </span>
      </div>
      {rawEntity && (
        <p className="curation-panel-rawentity-note">
          Se guardará junto con la decisión: query «{rawEntity.searchQuery || rawEntity.selectedText || '—'}», título «{rawEntity.title || '—'}», URI Foundation y de linealización -- para poder cruzar con Foundation más adelante.
        </p>
      )}

      <div className="curation-panel-decision">
        <label>
          <input type="radio" name="curation-decision" checked={decision === 'accepted'} onChange={() => setDecision('accepted')} />
          Aceptar lo propuesto
        </label>
        <label>
          <input type="radio" name="curation-decision" checked={decision === 'changed'} onChange={() => setDecision('changed')} />
          Elegir/escribir el código correcto
        </label>
        <label>
          <input type="radio" name="curation-decision" checked={decision === 'flagged'} onChange={() => setDecision('flagged')} />
          Marcar para revisar (sin código propio todavía)
        </label>
      </div>

      {decision === 'changed' && (
        <input
          className="curation-code-input"
          placeholder="Código correcto (p. ej. C49.2)"
          value={correctedCode}
          onChange={(e) => setCorrectedCode(e.target.value)}
        />
      )}

      <textarea
        rows={3}
        placeholder="Fundamento: qué está bien, qué cambia y por qué (obligatorio salvo al aceptar)…"
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
      />

      <div className="curation-panel-actions">
        <button type="button" onClick={save}>
          {editingId ? 'Actualizar decisión' : 'Guardar decisión'}
        </button>
        {editingId && (
          <button type="button" onClick={reset}>
            Nueva
          </button>
        )}
      </div>
      {message && <p className="curation-panel-message">{message}</p>}

      {existing.length > 0 && (
        <details className="curation-panel-list">
          <summary>Decisiones guardadas para esta expresión ({existing.length})</summary>
          {existing.map((d) => (
            <button key={d.curationId} className="curation-panel-item" onClick={() => edit(d)}>
              <code>{AXES.find(([id]) => id === d.axis)?.[1] || d.axis}</code>
              <span>
                {DECISION_LABEL[d.decision]}
                {d.decision === 'changed' ? ` → ${d.correctedCode}` : ''}
              </span>
              <small>{d.rationale}</small>
            </button>
          ))}
        </details>
      )}
    </div>
  );
}

export default CurationPanel;
