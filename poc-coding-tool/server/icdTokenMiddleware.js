// Obtención del token OAuth2 (client credentials) para la API CIE-11 de la
// OMS. Corre en Node, dentro del servidor de Vite (dev y preview): el
// endpoint de tokens de la OMS no admite CORS y el client_secret no puede
// llegar al navegador, así que el navegador pide el token a esta ruta local
// y luego llama a la API directamente con `Authorization: Bearer <token>`.

export const ICD_TOKEN_ROUTE = '/api/icd-token';

// Margen antes del vencimiento para renovar el token (segundos).
const EXPIRY_MARGIN_S = 300;

export function createIcdTokenMiddleware(env) {
  const clientId = env.ICD_CLIENT_ID;
  const clientSecret = env.ICD_CLIENT_SECRET;
  const tokenEndpoint = env.ICD_TOKEN_ENDPOINT || 'https://icdaccessmanagement.who.int/connect/token';
  const scope = env.ICD_SCOPE || 'icdapi_access';

  let cached = null; // { accessToken, expiresAt (ms) }
  let inflight = null;

  async function requestToken() {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    });
    const res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`El endpoint de tokens respondió HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    const json = await res.json();
    if (!json.access_token) throw new Error('La respuesta del endpoint de tokens no trae access_token');
    const expiresIn = Number(json.expires_in) || 3600;
    return { accessToken: json.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  }

  async function getToken() {
    if (cached && Date.now() < cached.expiresAt - EXPIRY_MARGIN_S * 1000) return cached;
    if (!inflight) {
      inflight = requestToken()
        .then((t) => (cached = t))
        .finally(() => (inflight = null));
    }
    return inflight;
  }

  return async function icdTokenMiddleware(req, res, next) {
    if (req.url.split('?')[0] !== ICD_TOKEN_ROUTE) return next();

    const send = (status, payload) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(payload));
    };

    if (!clientId || !clientSecret) {
      send(500, { error: 'Faltan ICD_CLIENT_ID / ICD_CLIENT_SECRET en poc-coding-tool/.env (ver .env.example)' });
      return;
    }
    try {
      const { accessToken, expiresAt } = await getToken();
      send(200, { access_token: accessToken, expires_in: Math.floor((expiresAt - Date.now()) / 1000) });
    } catch (err) {
      send(502, { error: err instanceof Error ? err.message : String(err) });
    }
  };
}
