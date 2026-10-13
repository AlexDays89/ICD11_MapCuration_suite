# map-v2 — compilador de mapas oncológicos (CIE-11 → CIE-10 / CIE-O-3.2)

Compilador reproducible desde los CSV curados de `../datasets` hacia un modelo normalizado único, emitido como RDF/Turtle, RDF/XML, una vista YAML de inspección y un bundle JSON aplanado para el navegador. Implementa un subconjunto (F0–F7) de los flujos de resolución especificados en el documento de diseño "Prompt maestro: compilador y laboratorio de mapas".

**Estado real, no reclamado más allá de lo probado**: ver `reports/gap-analysis.md` antes de asumir cobertura de nada que no esté ahí listado como hecho.

## Instalación

Sin dependencias externas (Node ≥ 18, ESM nativo). No hace falta `npm install`.

## Comandos

```sh
node compiler/build.js   # compila ../datasets -> dist/
node test/run-cases.mjs  # corre los casos de regresión de cases/ contra dist/map.bundle.json
```

`dist/` se regenera por completo en cada build (no editar sus archivos a mano).

## Salidas (`dist/`)

| Archivo | Contenido |
|---|---|
| `map.bundle.json` | Modelo aplanado para el navegador (`stemsByCode`, `anatomyByCode`, `rulesByKey`, etc.) + `resolve.js` copiado al lado. |
| `resolve.js` | Función pura `resolveSelection(selection, bundle)` — sin red, misma copia usada en Node (tests) y en `poc-coding-tool`. |
| `map.ttl` / `map.rdf` | Mismo grafo RDF, dos serializaciones (Turtle / RDF-XML), generadas del mismo array de triples. |
| `map.normalized.yaml` | Vista de inspección (no editable): esquema, releases fijadas, alias documentados, recuentos, problemas detectados. |
| `manifest.json` | Hashes SHA-256 de cada archivo fuente y cada salida, recuentos, metadatos de versión. |

## Consumidores actuales

- `../poc-coding-tool/src/maplab/MapPanel.jsx` (vía `pnpm run copy-map-v2`, que copia `map.bundle.json` + `resolve.js`).

## Límites actuales

F8 (grado/lateralidad/otros ejes), SHACL, expresiones multi-stem, y el ciclo completo de feedback→parche→recompilación NO están implementados. Ver `reports/gap-analysis.md` para el detalle completo y las decisiones de curación pendientes.
