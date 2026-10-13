import React, { useState } from 'react';

// Column 2 of a tool page: one tab strip, one scroll container. Every pane
// stays mounted (just hidden) so a half-written note or curation survives
// switching tabs.
export function SideTabs({ tabs }) {
  const [active, setActive] = useState(tabs[0].id);
  return (
    <div className="side-tabs">
      <div className="side-tabs-strip" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            className={active === t.id ? 'active' : ''}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" className="side-tabs-pane" hidden={active !== t.id}>
          {t.content}
        </div>
      ))}
    </div>
  );
}

export default SideTabs;
