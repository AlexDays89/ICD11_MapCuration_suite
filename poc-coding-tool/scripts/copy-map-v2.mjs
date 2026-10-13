// Mirrors map-v2's compiled artifacts into this app's public/ and src/
// folders -- same "just copy the dist output, don't rebuild map-v2's logic
// into this app" pattern the old copy-bundles.mjs used for map2. Keeps
// ../map-v2 the single source of truth for the compiler; run
// `node compiler/build.js` there first whenever ../datasets changes.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_V2_DIST = join(__dirname, '..', '..', 'map-v2', 'dist');
const PUBLIC_DIR = join(__dirname, '..', 'public');
const SRC_MAPLAB_DIR = join(__dirname, '..', 'src', 'maplab');

function copy(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`copied ${src} -> ${dest}`);
}

const bundlePath = join(MAP_V2_DIST, 'map.bundle.json');
if (!existsSync(bundlePath)) {
  console.error(`Not found: ${bundlePath}. Run "node compiler/build.js" in map-v2/ first.`);
  process.exit(1);
}

copy(bundlePath, join(PUBLIC_DIR, 'map-v2.bundle.json'));
copy(join(MAP_V2_DIST, 'resolve.js'), join(SRC_MAPLAB_DIR, 'resolve.js'));

console.log('Done.');
