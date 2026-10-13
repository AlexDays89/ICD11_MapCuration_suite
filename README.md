# ICD-11 map workbench

Mapa de neoplasias CIE-11 (capítulo 2) hacia CIE-10, CIE-O-3.2 (topografía y morfología) y CIE-O-4 (morfología), junto con el compilador que lo genera y la interfaz con la que se cura.

Todo lo necesario está en este directorio: se editan los datasets, se recompila, y la interfaz muestra el resultado.

## Estructura

| Carpeta | Qué contiene | Se edita a mano |
|---|---|---|
| `datasets/` | Los 9 CSV curados (la fuente de verdad del mapa) y su copia `.xlsx` para editar | Sí |
| `map-v2/compiler/` | Compilador (importar, normalizar, materializar, emitir) y `resolve.js`, el resolver puro | Sí (código) |
| `map-v2/sources/` | Tablas de referencia propias (etiquetas CIE-O-3.2 y términos CIE-O-4), con su procedencia | Rara vez |
| `map-v2/cases/` | Casos de regresión, uno por archivo JSON | Sí |
| `map-v2/dist/` | Artefactos compilados: `map.ttl`, `map.rdf`, `map.normalized.yaml`, `map.bundle.json`, `resolve.js`, `manifest.json` | No, se regeneran |
| `map-v2/reports/` | Análisis de brechas y plan futuro | Sí |
| `poc-coding-tool/` | Interfaz de curación (React + Vite) con el ECT oficial de la OMS | Sí (código) |
| `curation/exports/` | Exportaciones de decisiones de curación y feedback hechas desde la interfaz | Se agregan |
| `tools/` | Utilidades en Python para los datasets (regenerar los Excel desde los CSV) | Rara vez |

## Requisitos

Node 18 o superior y `pnpm`. El compilador no tiene dependencias; solo la interfaz necesita instalar paquetes.

## Uso

```sh
pnpm run app:install   # una sola vez: dependencias de la interfaz
pnpm run map           # compila datasets/ -> map-v2/dist/ y corre los casos de regresión
pnpm run dev           # levanta la interfaz (copia antes el bundle y el resolver recién compilados)
```

Comandos sueltos: `pnpm run map:build`, `pnpm run map:test`, `pnpm run app:build`.

## Ciclo de curación

1. Abrir la interfaz (`pnpm run dev`), seleccionar entidades y registrar por eje: aceptar, corregir o marcar para revisión, con su justificación.
2. Exportar las decisiones desde la interfaz y guardar el JSON en `curation/exports/`.
3. Llevar cada corrección a la fila correspondiente de `datasets/` (el principio es resolver en los datos, no en `resolve.js`).
4. Agregar un caso en `map-v2/cases/` por cada corrección que deba quedar protegida.
5. `pnpm run map`. Revisar la sección `PROBLEMAS detectados` de la salida y que todos los casos pasen.
6. Hacer commit de `datasets/`, `map-v2/cases/` y `map-v2/dist/` juntos, para que el mapa publicado siempre corresponda a sus fuentes (`manifest.json` guarda el SHA-256 de cada fuente y cada salida).

El feedback sobre el contenido de CIE-11 o del ECT no se corrige aquí: se reporta a la OMS (ver `map-v2/WHO_ECT_FEEDBACK.md`).

## Editar los datasets

Los CSV son la fuente de verdad: es lo único que lee el compilador. Usan `;` como separador, UTF-8, celdas vacías para "sin dato" (nunca el texto `undefined`) y booleanos `true`/`false` en minúsculas.

Cada CSV tiene al lado un `.xlsx` con el mismo contenido para editar cómodamente en Excel. Todas sus celdas son de texto, así Excel no reinterpreta nada (booleanos, códigos como `8000` o `2E60`, identificadores largos). Hay dos formas de trabajar:

- **Editar el CSV** y luego regenerar los Excel: `python tools/csv_to_xlsx.py` (requiere `pip install openpyxl`).
- **Editar el `.xlsx`** y guardarlo como CSV (delimitado por `;`, UTF-8) sobre el CSV del mismo nombre. Antes de compilar, revisar el `git diff` del CSV: solo deberían cambiar las celdas editadas.

Nunca exportar un `.xlsx` que no se haya regenerado desde el CSV vigente: un Excel desactualizado ya revirtió correcciones una vez (ver `curation/restauracion-2026-10-14.tsv` y `tools/fix_datasets_2026-10-14.py`, que documenta la reparación completa).

El compilador protege contra los dos errores vistos: se detiene si encuentra un booleano que no sea `true`/`false` en minúsculas, e informa en `PROBLEMAS detectados` cualquier `icdo3_topography_default` que no sea un código de topografía CIE-O.

## Vacíos conocidos en los datos

En `datasets/ICD10_domains.csv`, las filas `C92.0`, `C92.1`, `C92.4` y `C92.5` tienen vacías las columnas `definition`, `note`, `coding_hint`, `text`, `meta_json` y `rubrics_json` desde su origen (el compilador no las usa). Sus notas de inclusión y exclusión sí están completas en `icd10_domain_notes.csv`.

## Antes de publicar

Los datasets y artefactos derivan de CIE-11, CIE-10 y CIE-O, clasificaciones de la OMS con sus propias condiciones de uso y redistribución. Conviene revisarlas, y elegir una licencia para el código, antes de hacer público el repositorio.
