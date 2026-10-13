import { MAPV2 } from './triples.js';

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Serializes the SAME triple array toTurtle() consumes -- real RDF/XML
// (not Turtle wrapped in XML tags), per the Prompt Maestro's explicit
// correction that "map.rdf" must be actual RDF/XML.
export function toRdfXml(triples) {
  const bySubject = new Map();
  for (const t of triples) {
    const key = t.s.value;
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(t);
  }
  let out = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  out += `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:xsd="http://www.w3.org/2001/XMLSchema#" xmlns:map2v2="${MAPV2}">\n`;
  for (const [subjectUri, group] of bySubject) {
    out += `  <rdf:Description rdf:about="${escapeXml(subjectUri)}">\n`;
    for (const t of group) {
      const predLocal = t.p.value.slice(MAPV2.length);
      if (t.o.lit) {
        const dt = t.o.datatype && t.o.datatype !== 'xsd:string' ? ` rdf:datatype="http://www.w3.org/2001/XMLSchema#${t.o.datatype.split(':')[1]}"` : '';
        out += `    <map2v2:${predLocal}${dt}>${escapeXml(t.o.value)}</map2v2:${predLocal}>\n`;
      } else {
        out += `    <map2v2:${predLocal} rdf:resource="${escapeXml(t.o.value)}"/>\n`;
      }
    }
    out += `  </rdf:Description>\n`;
  }
  out += `</rdf:RDF>\n`;
  return out;
}
