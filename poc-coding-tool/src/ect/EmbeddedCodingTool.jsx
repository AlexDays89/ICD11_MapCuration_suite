import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useECT } from './ECTProvider.jsx';
import { scrapeCandidates } from '../captureLog.js';

// Ported from ideas/codificador_oms_v2/components/CIE11/EmbeddedCodingTool.tsx
// (TSX -> plain JSX, types dropped, otherwise the same bind/select pattern).
export function EmbeddedCodingTool({
  instanceId: propInstanceId,
  settings = {},
  onSelect,
  onInputChange,
  placeholder = 'Buscar en CIE-11...',
  inputWidth = '100%',
  inlineResults = true,
  resultHeight,
}) {
  const { isConfigured, configureInstance, bindInstance, clearInstance, searchInstance } = useECT();
  const reactId = useId();
  const instanceId = propInstanceId || reactId.replace(/:/g, '');
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const boundRef = useRef(false);
  const autoSearchFiredRef = useRef(false);
  const lastTypedQueryRef = useRef('');

  const [selectedEntity, setSelectedEntity] = useState(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (!isConfigured || boundRef.current) return;
    const attemptBind = () => {
      const input = document.querySelector(`input[data-ctw-ino="${instanceId}"]`);
      if (input) {
        configureInstance(instanceId, {
          ...settings,
          popupMode: !inlineResults,
          searchByCodeOrURI: settings.searchByCodeOrURI ?? true,
        });
        bindInstance(instanceId);
        boundRef.current = true;
      } else {
        setTimeout(attemptBind, 50);
      }
    };
    const timer = setTimeout(attemptBind, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured]);

  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const handleEntitySelection = useCallback(
    (entity) => {
      if (!inputRef.current) return;
      autoSearchFiredRef.current = false;
      setSelectedEntity(entity);
      // Scrape the on-screen candidate list BEFORE clearInstance tears the
      // popup down -- see captureLog.js for why this is best-effort.
      const candidates = scrapeCandidates(resultsRef.current);
      const queryText = lastTypedQueryRef.current;
      setInputValue(entity.code ? `${entity.code} - ${entity.title}` : entity.title);
      try {
        clearInstance(entity.iNo);
      } catch {
        // ignore -- ECT may already have closed its own popup
      }
      onSelectRef.current?.(entity, instanceId, { queryText, candidates });
    },
    [instanceId, clearInstance]
  );

  useEffect(() => {
    if (!isConfigured) return;
    const globalKey = `__ect_handler_${instanceId}`;
    window[globalKey] = handleEntitySelection;
    return () => {
      delete window[globalKey];
    };
  }, [isConfigured, instanceId, handleEntitySelection]);

  function handleInputChange(e) {
    const value = e.target.value;
    setInputValue(value);
    lastTypedQueryRef.current = value;
    onInputChange?.(value);
    if (!value.trim()) setSelectedEntity(null);
  }

  const handleFocus = useCallback(() => {
    if (selectedEntity?.title && inputRef.current) {
      const title = selectedEntity.title;
      inputRef.current.value = title;
      setInputValue(title);
      if (!autoSearchFiredRef.current) {
        autoSearchFiredRef.current = true;
        searchInstance(instanceId, title);
      }
      setTimeout(() => inputRef.current?.select(), 50);
    } else {
      inputRef.current?.select();
    }
  }, [selectedEntity, instanceId, searchInstance]);

  return (
    <>
      {!inlineResults && resultHeight && (
        <style>{`.ectComponent .popupMode .popupModeResults{max-height:${resultHeight}!important;overflow-y:auto!important;}`}</style>
      )}
      <div style={{ width: inputWidth }}>
        <input
          ref={inputRef}
          type="text"
          className="ctw-input"
          autoComplete="off"
          placeholder={placeholder}
          data-ctw-ino={instanceId}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
        />
      </div>
      <div
        ref={resultsRef}
        className="ctw-window"
        data-ctw-ino={instanceId}
        style={inlineResults && resultHeight ? { height: resultHeight, overflowY: 'auto' } : undefined}
      />
    </>
  );
}

export default EmbeddedCodingTool;
