// Tiny indentation-based YAML stringifier -- no dependency. Only needs to
// handle the shapes this compiler actually emits (nested plain objects,
// arrays of strings/objects, strings/numbers/booleans/null) for
// `dist/map.normalized.yaml`, which per the Prompt Maestro (§6.1, §10) is a
// readable CONFIG/inspection view (schema, policies, profile aliases,
// per-source counts and detected problems) -- not a dump of the whole
// bundle (1290+ stems would make that pointless to read).
function scalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '' || /^[\s]|[\s]$/.test(s) || /[:#\-\[\]{}",'&*!|>%@`]/.test(s) || /^(true|false|null|~|-?\d+(\.\d+)?)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

function toYaml(value, indent) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]\n`;
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          const entries = Object.entries(item);
          if (entries.length === 0) return `${pad}- {}\n`;
          let out = `${pad}- ${entries[0][0]}: ${scalar(entries[0][1])}\n`;
          for (const [k, v] of entries.slice(1)) {
            out += typeof v === 'object' && v !== null ? `${pad}  ${k}:\n${toYaml(v, indent + 2)}` : `${pad}  ${k}: ${scalar(v)}\n`;
          }
          return out;
        }
        return `${pad}- ${scalar(item)}\n`;
      })
      .join('');
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return `${pad}{}\n`;
    return entries
      .map(([k, v]) => {
        if (v !== null && typeof v === 'object') {
          const isEmptyArr = Array.isArray(v) && v.length === 0;
          const isEmptyObj = !Array.isArray(v) && Object.keys(v).length === 0;
          if (isEmptyArr) return `${pad}${k}: []\n`;
          if (isEmptyObj) return `${pad}${k}: {}\n`;
          return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
        }
        return `${pad}${k}: ${scalar(v)}\n`;
      })
      .join('');
  }
  return `${pad}${scalar(value)}\n`;
}

export function toYamlDocument(value) {
  return `# Generado por compiler/build.js. Vista de inspección, no editable a mano.\n${toYaml(value, 0)}`;
}
