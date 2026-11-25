import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createIcdTokenMiddleware } from './server/icdTokenMiddleware.js';

// Expone GET /api/icd-token en `vite dev` y `vite preview`. Las credenciales
// (ICD_CLIENT_ID / ICD_CLIENT_SECRET, ver .env.example) se leen solo aquí,
// del lado de Node; nunca se incluyen en el bundle del cliente.
function icdTokenPlugin(env) {
  const middleware = createIcdTokenMiddleware(env);
  return {
    name: 'icd-oauth-token',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Prefijo '' para leer también las variables sin VITE_ (solo en Node).
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), icdTokenPlugin(env)],
  };
});
