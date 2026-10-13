// Stage 8 (probar y comparar) -- runs cases/*.json against the freshly
// built dist/map.bundle.json + resolve.js. A subset of the Prompt Maestro's
// §9 regression table (the ones this compiler's F0-F7 subset can actually
// exercise); the rest are listed as pending in reports/gap-analysis.md,
// not silently skipped.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSelection } from '../compiler/resolve.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const CASES = join(__dirname, '..', 'cases');

const bundle = JSON.parse(readFileSync(join(DIST, 'map.bundle.json'), 'utf8'));

let pass = 0;
let fail = 0;
for (const file of readdirSync(CASES).filter((f) => f.endsWith('.json'))) {
  const testCase = JSON.parse(readFileSync(join(CASES, file), 'utf8'));
  const result = resolveSelection(testCase.selection, bundle);
  const failures = [];
  for (const [path, expected] of Object.entries(testCase.expect)) {
    const actual = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), result);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`  ${path}: esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`);
    }
  }
  if (failures.length) {
    fail++;
    console.log(`FAIL ${file} -- ${testCase.property || ''}`);
    failures.forEach((f) => console.log(f));
    console.log('  resultado completo:', JSON.stringify(result, null, 1));
  } else {
    pass++;
    console.log(`PASS ${file} -- ${testCase.property || ''}`);
  }
}
console.log(`\n${pass} pasaron, ${fail} fallaron de ${pass + fail}.`);
process.exit(fail ? 1 : 0);
