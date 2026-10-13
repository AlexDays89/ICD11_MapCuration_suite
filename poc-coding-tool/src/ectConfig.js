// WHO's own PUBLIC dev/test demo backend for the ICD-11 API -- explicitly
// documented (https://icd.who.int/docs/icd-api/icd11ect-1.8-EmbeddedCodingTool/)
// as intended for exactly this kind of development/testing use. No
// registration, no client_id/secret, no proxy of ours involved. WHO's
// PRODUCTION API needs a server-side OAuth2 client-credentials token
// (blocked by CORS for direct browser use by design -- confirmed via WHO's
// own API-Authentication docs) -- that's what APA's own backend proxy is
// for. This PoC deliberately stays on the dev/test demo to keep the whole
// capture -> resolve -> render loop client-side only, per the "no backend"
// requirement.
export const ECT_API_SERVER_URL = 'https://icd11restapi-developer-test.azurewebsites.net';

// Fixed per the Prompt Maestro (no "latest version" implicit): ICD-11 MMS
// 2026-01. Confirmed directly against this exact host (not assumed) that it
// answers /mms/{id}, /mms/describe?uri=... and /mms/codeinfo/{code} with
// `Access-Control-Allow-Origin: *`, so entity-detail/describe calls can go
// straight from the browser to this same host, no proxy needed.
export const ICD11_RELEASE = '2026-01';
export const WHO_MMS_BASE = `${ECT_API_SERVER_URL}/icd/release/11/${ICD11_RELEASE}/mms`;
