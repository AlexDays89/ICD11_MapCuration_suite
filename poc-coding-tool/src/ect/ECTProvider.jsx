import React, { useEffect, useRef, useState } from 'react';
import * as ECT from '@whoicd/icd11ect';
import '@whoicd/icd11ect/style.css';
import { ECT_API_SERVER_URL, ICD11_RELEASE, getIcdToken } from '../ectConfig.js';
import { ECTContext } from './ectContext.js';

export function ECTProvider({ children }) {
  const [isConfigured, setIsConfigured] = useState(false);
  const configuredRef = useRef(false);

  const settingsRef = useRef({
    apiServerUrl: ECT_API_SERVER_URL,
    apiSecured: true,
    language: 'es',
    source: 'mms',
    minorVersion: ICD11_RELEASE,
    autoBind: false,
    enableSelectButton: 'all',
    otherPostcoordination: false,
    browserHierarchyRootURIs: ['http://id.who.int/icd/entity/1630407678', 'http://id.who.int/icd/entity/979408586'],
  });
  const [otherPostcoordination, setOtherPostcoordinationState] = useState(false);


  const callbacksRef = useRef({

    getNewTokenFunction: () => getIcdToken(),
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
