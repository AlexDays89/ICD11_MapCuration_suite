import React, { useEffect, useState } from 'react';
import { ECTProvider } from './ect/ECTProvider.jsx';
import { BrowserPage } from './pages/BrowserPage.jsx';
import { CodingToolPage } from './pages/CodingToolPage.jsx';
import { FeedbackPage } from './feedback/FeedbackPage.jsx';
import { FEEDBACK_NAMESPACES, loadFeedback } from './feedback/feedbackStore.js';
import { loadCurationDecisions } from './curation/curationStore.js';
import { subscribeStore } from './storeEvents.js';

function cachedCount() {
  return FEEDBACK_NAMESPACES.reduce((n, ns) => n + loadFeedback(ns).length, 0) + loadCurationDecisions().length;
}

export default function App() {
  const [page, setPage] = useState('browser');
  const [count, setCount] = useState(cachedCount);

  useEffect(() => subscribeStore(() => setCount(cachedCount())), []);

  return (
    <ECTProvider>
      <div className="app">
        <header className="app-header">
          <h1>Map2 · prueba de concepto</h1>
          <nav className="page-tabs">
            <button className={page === 'browser' ? 'active' : ''} onClick={() => setPage('browser')}>
              Browser
            </button>
            <button className={page === 'codingtool' ? 'active' : ''} onClick={() => setPage('codingtool')}>
              Coding Tool
            </button>
            <button className={page === 'feedback' ? 'active' : ''} onClick={() => setPage('feedback')}>
              Feedback{count > 0 && <span className="tab-count">{count}</span>}
            </button>
          </nav>
          <p className="subtitle">Herramienta local de navegación y curación de mapa y ECT</p>
        </header>

        {/* Browser/Coding Tool stay mounted (hidden) so the ECT widgets keep
            their state; the Feedback tab mounts on demand and reads the cache. */}
        <main className="app-main">
          <div className="page" hidden={page !== 'browser'}>
            <BrowserPage />
          </div>
          <div className="page" hidden={page !== 'codingtool'}>
            <CodingToolPage />
          </div>
          {page === 'feedback' && (
            <div className="page">
              <FeedbackPage />
            </div>
          )}
        </main>
      </div>
    </ECTProvider>
  );
}
