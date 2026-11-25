import { createContext, useContext } from 'react';

// Separado de ECTProvider.jsx para que ese archivo exporte solo componentes
// (requisito de React Fast Refresh).
export const ECTContext = createContext(null);

export function useECT() {
  const ctx = useContext(ECTContext);
  if (!ctx) throw new Error('useECT must be used within an ECTProvider');
  return ctx;
}
