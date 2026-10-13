import React from 'react';
import { useECT } from './ECTProvider.jsx';

// The user's explicit ask: a button to enable/disable "other
// postcoordination" *before* picking a code. Native ECT behaviour rejects
// postcoordination values outside a stem's declared scale; enabling this
// flag opens the "Other postcoordination" scale (WHO's own generic X-chapter
// escape hatch, `postcoordinationScale/otherPostcoordination` -- confirmed
// reading the installed package source) so a granular combination can be
// captured for feedback/escalation to WHO even when it isn't natively
// offered for that stem.
export function OtherPostcoordinationToggle({ className = '' }) {
  const { otherPostcoordination, setOtherPostcoordination, isConfigured } = useECT();
  return (
    <button
      type="button"
      className={`other-postcoordination-toggle ${otherPostcoordination ? 'on' : 'off'} ${className}`}
      disabled={!isConfigured}
      onClick={() => setOtherPostcoordination(!otherPostcoordination)}
      title="Activar/desactivar la postcoordinación abierta (otherPostcoordination) antes de seleccionar un código"
    >
      Other postcoordination: {otherPostcoordination ? 'ON' : 'OFF'}
    </button>
  );
}

export default OtherPostcoordinationToggle;
