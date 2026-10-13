import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as ECT from '@whoicd/icd11ect';
import '@whoicd/icd11ect/style.css';
import { ECT_API_SERVER_URL, ICD11_RELEASE } from '../ectConfig.js';

// Ported from ideas/codificador_oms_v2/components/CIE11/ECTProvider.tsx --
// same configure-once / per-instance-overwrite pattern, adapted to plain
// JSX (no primereact/Next) and to WHO's public dev/test API instead of a
// production OAuth2-proxied one (see ectConfig.js).
const ECTContext = createContext(null);

export function useECT() {
  const ctx = useContext(ECTContext);
  if (!ctx) throw new Error('useECT must be used within an ECTProvider');
  return ctx;
}

export function ECTProvider({ children }) {
  const [isConfigured, setIsConfigured] = useState(false);
  const configuredRef = useRef(false);

  // otherPostcoordination is a GLOBAL flag inside the installed
  // @whoicd/icd11ect@1.8.0 package (verified by reading its own minified
  // source: `Ve.otherPostcoordination`, checked only against the global
  // settings object, never merged from `Ve.overwrite[iNo]` the way
  // per-instance settings like chaptersFilter/language are) -- so toggling
  // it can't go through `overwriteConfiguration(iNo, ...)` like every other
  // per-instance setting; it needs `ECT.Handler.configure(...)` again.
  // That call itself runs `disableSearchboxes()` first (also verified in
  // the same source), which tears down every bound instance's rendered
  // widget -- re-`bind()`ing the same iNo afterwards was NOT enough to
  // restore it in manual testing (widget stayed stuck on "Loading..."
  // indefinitely). What does work: force React to fully unmount and
  // remount the widget components (EmbeddedBrowser/EmbeddedCodingTool key
  // off `otherPostcoordination` in BrowserPage/CodingToolPage), which
  // re-renders their container div from scratch and re-runs their own
  // mount effect (configureInstance + bindInstance against a clean node).
  const settingsRef = useRef({
    apiServerUrl: ECT_API_SERVER_URL,
    apiSecured: false,
    language: 'es',
    source: 'mms',
    minorVersion: ICD11_RELEASE,
    autoBind: false,
    enableSelectButton: 'all',
    otherPostcoordination: false,
  });
  const [otherPostcoordination, setOtherPostcoordinationState] = useState(false);

  // ECT hands back `selectedEntity.iNo` as its OWN internal id (can be an
  // inner id like "InnerCodingTool browser_1", not necessarily the exact
  // instanceId we passed to `bind()`) -- confirmed here empirically (a
  // direct `window['__ect_handler_' + iNo]` lookup missed real selections
  // during manual testing). Ported the fuzzy-match fallback from
  // ECTProvider.tsx: try an exact key first, then substring-contains either
  // direction across every registered handler, then (if only one instance
  // is registered at all) call that one directly.
  const callbacksRef = useRef({
    selectedEntityFunction: (selectedEntity) => {
      const iNo = String(selectedEntity.iNo || '');
      const codingToolKeys = Object.keys(window).filter((k) => k.startsWith('__ect_handler_'));
      const browserKeys = Object.keys(window).filter((k) => k.startsWith('__ect_browser_handler_'));
      const allKeys = [...codingToolKeys, ...browserKeys];

      const exact = window[`__ect_handler_${iNo}`] || window[`__ect_browser_handler_${iNo}`];
      if (exact) {
        exact(selectedEntity);
        return;
      }
      const fuzzyKey = allKeys.find((k) => {
        const handlerId = k.replace('__ect_handler_', '').replace('__ect_browser_handler_', '');
        return iNo.includes(handlerId) || handlerId.includes(iNo);
      });
      if (fuzzyKey) {
        window[fuzzyKey](selectedEntity);
        return;
      }
      if (allKeys.length === 1) {
        window[allKeys[0]](selectedEntity);
      }
    },
  });

  useEffect(() => {
    if (configuredRef.current) return;
    configuredRef.current = true;
    ECT.Handler.configure(settingsRef.current, callbacksRef.current);
    setIsConfigured(true);
  }, []);

  function configureInstance(iNo, instanceSettings) {
    ECT.Handler.overwriteConfiguration(iNo, instanceSettings);
  }

  function bindInstance(iNo) {
    ECT.Handler.bind(iNo);
  }

  function clearInstance(iNo) {
    ECT.Handler.clear(iNo);
  }

  function searchInstance(iNo, query) {
    ECT.Handler.search?.(iNo, query);
  }

  // Re-configures globally with the new flag; BrowserPage/CodingToolPage
  // remount their widget (keyed off `otherPostcoordination`) to pick it up
  // cleanly -- see the note above settingsRef for why that's necessary.
  function setOtherPostcoordination(enabled) {
    settingsRef.current = { ...settingsRef.current, otherPostcoordination: enabled };
    ECT.Handler.configure(settingsRef.current, callbacksRef.current);
    setOtherPostcoordinationState(enabled);
  }

  return (
    <ECTContext.Provider
      value={{
        isConfigured,
        configureInstance,
        bindInstance,
        clearInstance,
        searchInstance,
        otherPostcoordination,
        setOtherPostcoordination,
      }}
    >
      {children}
    </ECTContext.Provider>
  );
}

export default ECTProvider;
