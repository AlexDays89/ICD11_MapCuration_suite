// API CIE-11 de producción de la OMS, autenticada con OAuth2 (client
// credentials). El token lo obtiene el servidor de Vite con las credenciales
// de `.env` (ver server/icdTokenMiddleware.js) y el navegador lo pide a
// ICD_TOKEN_URL; con él llaman a la API tanto el widget ECT como
// useEntityDetail.
export const ECT_API_SERVER_URL = (import.meta.env.VITE_ICD_API_SERVER_URL || 'https://id.who.int').replace(/\/+$/, '');

// Release fijo de la CIE-11 MMS (sin "latest" implícito).
export const ICD11_RELEASE = import.meta.env.VITE_ICD11_RELEASE || '2026-01';
export const WHO_MMS_BASE = `${ECT_API_SERVER_URL}/icd/release/11/${ICD11_RELEASE}/mms`;

export const ICD_TOKEN_URL = '/api/icd-token';

// Caché del token en memoria + deduplicación de pedidos simultáneos.
const EXPIRY_MARGIN_MS = 60_000;
let cachedToken = null; // { value, expiresAt }
let inflight = null;

export async function getIcdToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt - EXPIRY_MARGIN_MS) return cachedToken.value;
  if (!inflight) {
    inflight = fetch(ICD_TOKEN_URL, { headers: { Accept: 'application/json' } })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.access_token) {
          throw new Error(`No se pudo obtener el token de la API CIE-11: ${json.error || `HTTP ${res.status}`}`);
        }
        cachedToken = { value: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 0) * 1000 };
        return cachedToken.value;
      })
      .finally(() => (inflight = null));
  }
  return inflight;
}
