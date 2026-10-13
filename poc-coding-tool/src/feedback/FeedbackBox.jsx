import React, { useState } from 'react';
import { newFeedbackId, saveFeedback } from './feedbackStore.js';

export const VERDICTS = [
  ['review', 'Requiere revisión'],
  ['correct', 'Correcta'],
  ['incorrect', 'Incorrecta'],
  ['missing', 'Falta relación'],
];

// Textbox de feedback, presente por separado en la página Browser y en la
// página Coding Tool (namespace distinto -> stores distintos, sin mezclar).
// Captura el subconjunto directamente útil del contrato §8.1 del Prompt
// Maestro: selección cruda, snapshot del capture log (query + candidatos +
// describe) y el estado del toggle otherPostcoordination en el momento del
// guardado -- todo sin backend, cacheado y exportable en cualquier momento.
//
// Solo crea registros nuevos: tras guardar, el formulario se limpia para que
// el siguiente feedback nunca sobrescriba el anterior con otro código. La
// revisión/edición de lo guardado vive en la pestaña "Feedback".
export function FeedbackBox({ namespace, selection, captureRecord, otherPostcoordinationEnabled, mapVersion }) {
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [verdict, setVerdict] = useState('review');
  const [message, setMessage] = useState('');

  const targetCode = selection?.code || null;

  function save() {
    if (!note.trim()) return;
    const now = new Date().toISOString();
    const record = {
      feedbackId: newFeedbackId(),
      revision: 1,
      createdAt: now,
      updatedAt: now,
      selectionId: captureRecord?.selectionId || null,
      textOriginal: note.trim(),
      note: note.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      verdict,
      rawSelectionPayload: selection || null,
      captureRecord: captureRecord || null,
      otherPostcoordinationEnabled: Boolean(otherPostcoordinationEnabled),
      mapVersion: mapVersion || null,
      instance: namespace,
    };
    saveFeedback(namespace, record);
    setNote('');
    setTags('');
    setVerdict('review');
    setMessage(`Feedback guardado para ${targetCode || '(sin código)'}. Revísalo o edítalo en la pestaña Feedback.`);
  }

  return (
    <div className="feedback-box">
      <div className="feedback-box-header">
        <h3>Nuevo feedback ({namespace})</h3>
      </div>
      <p className="feedback-box-target">
        Se guardará para: <code>{targetCode || 'ninguna selección'}</code>
        {selection?.title && <span> · {selection.title}</span>}
      </p>

      <textarea
        rows={6}
        placeholder="Qué corregir, resultado esperado y fundamento…"
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setMessage('');
        }}
      />
      <div className="feedback-box-controls">
        <select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
          {VERDICTS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <input placeholder="tags separados por coma" value={tags} onChange={(e) => setTags(e.target.value)} />
        <button type="button" onClick={save} disabled={!note.trim()}>
          Guardar
        </button>
      </div>
      {message && <p className="feedback-box-message">{message}</p>}
    </div>
  );
}

export default FeedbackBox;
