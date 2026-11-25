import React, { useCallback, useEffect, useId, useRef } from 'react';
import { useECT } from './ectContext.js';
import { scrapeCandidates } from '../captureLog.js';

export function EmbeddedBrowser({
  instanceId: propInstanceId,
  settings = {},
  onSelect,
  className = '',
  title = 'CIE-11 Browser',
  subtitle,
  initialURI,
  initialChapter,
  width = '100%',
  height = '600px',
  widgetHeight = height,
}) {
  const { isConfigured, configureInstance, bindInstance, clearInstance } = useECT();
  const reactId = useId();
  const instanceId = propInstanceId || `browser-${reactId.replace(/:/g, '')}`;
  const boundRef = useRef(false);
  const containerRef = useRef(null);

  function getInitialURI() {
    if (initialURI) return initialURI;
    if (initialChapter) return `http://id.who.int/icd/entity/${initialChapter}`;
    return settings.browserURI;
  }

  useEffect(() => {
    if (!isConfigured || boundRef.current) return;
    const attemptBind = () => {
      const container = document.querySelector(`div[data-ctw-ino="${instanceId}"]`);
      if (container) {
        configureInstance(instanceId, { ...settings, browserURI: getInitialURI(), height: widgetHeight });
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
      const ectInput = containerRef.current?.querySelector('.embeddedBrowserSearchbox');
      const innerId = ectInput?.getAttribute('data-ctw-ino') || entity.iNo;
      // Scrape query text + on-screen candidates before clearInstance tears
      // the popup down (same reasoning as EmbeddedCodingTool.jsx).
      const queryText = ectInput?.value || '';
      const candidates = scrapeCandidates(containerRef.current);
      clearInstance(innerId);
      onSelectRef.current?.(entity, instanceId, { queryText, candidates });
    },
    [instanceId, clearInstance]
  );

  useEffect(() => {
    if (!isConfigured) return;
    const globalKey = `__ect_browser_handler_${instanceId}`;
    window[globalKey] = handleEntitySelection;
    return () => {
      delete window[globalKey];
    };
  }, [isConfigured, instanceId, handleEntitySelection]);

  return (
    <div className={className} style={{ width }}>
      {title && <p className="browser-title">{title}</p>}
      {subtitle && <p className="browser-subtitle">{subtitle}</p>}
      <div ref={containerRef} className="ctw-eb-window" data-ctw-ino={instanceId} style={{ overflow: 'auto', height }} />
    </div>
  );
}

export default EmbeddedBrowser;
