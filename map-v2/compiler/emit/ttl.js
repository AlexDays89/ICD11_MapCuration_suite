import { MAPV2 } from './triples.js';

function escapeTtlString(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function termTtl(t) {
  if (!t.lit) return `<${t.value}>`;
  const dt = t.datatype && t.datatype !== 'xsd:string' ? `^^${t.datatype}` : '';
  return `"${escapeTtlString(t.value)}"${dt}`;
}

// Groups triples by subject so each resource prints once with all its
// predicates (standard Turtle "subject a Type ; p1 o1 ; p2 o2 ." style) --
// purely a readability choice, doesn't change the graph.
export function toTurtle(triples) {
  const bySubject = new Map();
  for (const t of triples) {
    const key = t.s.value;
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(t);
  }
  let out = `@prefix map2v2: <${MAPV2}> .\n@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n\n`;
  for (const [subjectUri, group] of bySubject) {
    out += `<${subjectUri}>\n`;
    out += group.map((t) => `  map2v2:${t.p.value.slice(MAPV2.length)} ${termTtl(t.o)}`).join(' ;\n');
    out += ' .\n\n';
  }
  return out;
}
