import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Pure static client build -- no server, no API routes, nothing here talks
// to anything except (a) this app's own static files and (b) WHO's public
// ICD-11 dev/test demo API that the ECT widget itself calls directly from
// the browser (see src/ectConfig.js).
export default defineConfig({
  plugins: [react()],
});
