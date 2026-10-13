// Minimal RFC4180-ish CSV parser, semicolon-delimited (the 8 Datasets/final
// files all use ';' -- confirmed by inspecting headers directly). Handles
// quoted fields (with embedded ';', newlines, and doubled '""' escapes),
// which several columns need (JSON arrays like ["C00-C97"], free-text
// rationale with embedded quotes). No dependency -- Node's own fs is enough
// for files this size (<=1.5MB each).
import { readFileSync } from 'node:fs';

// All 8 source files are UTF-8 as of the 2026-09-22 curation pass (curated
// from a prior mix of Latin-1 and, for one file re-saved by hand, UTF-8
// with BOM -- that mismatch corrupted every accented character read from
// the UTF-8 file, e.g. "Células sanguíneas" -> "CÃ©lulas sanguÃ­neas",
// found live in dist/map.bundle.json). Strips a leading BOM if present so
// re-saving from Excel (which adds one) never corrupts the first header.
export function readUtf8(path) {
  let text = readFileSync(path, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

export function parseCsv(text, delimiter = ';') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Parses a CSV file into an array of objects keyed by header. Duplicate
// headers get an internal alias (`col`, `col__2`, `col__3`, ...) per the
// Prompt Maestro's explicit rule that a duplicate header must never
// silently overwrite another column.
export function parseCsvFile(path) {
  const rows = parseCsv(readUtf8(path));
  if (rows.length === 0) return { headers: [], records: [] };
  const rawHeaders = rows[0];
  const seen = new Map();
  const headers = rawHeaders.map((h) => {
    const trimmed = h.trim();
    const count = (seen.get(trimmed) || 0) + 1;
    seen.set(trimmed, count);
    return count === 1 ? trimmed : `${trimmed}__${count}`;
  });
  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0] === '') continue; // trailing blank line
    const rec = {};
    for (let c = 0; c < headers.length; c++) {
      rec[headers[c]] = cells[c] !== undefined ? cells[c] : '';
    }
    rec.__row = r + 1; // 1-indexed, header is row 1
    records.push(rec);
  }
  return { headers, records };
}
