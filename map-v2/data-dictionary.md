# Diccionario de datos — 8 archivos de `Datasets/final`

Columnas verificadas contra los archivos reales (no contra una versión previa). Ver `reports/gap-analysis.md` para hallazgos de calidad de datos y decisiones pendientes.

## `icd11_stem_defaults.csv` (1290 filas, 1247 con `Code`)

Identidad y defaults de cada stem CIE-11. `family` **no es una columna del archivo** — el compilador la calcula como `domain.subdomain` (o solo `domain` si no hay subdominio). **Sí tiene columnas de terminalidad reales** (`DepthInKind`, `IsResidual`, `isLeaf`) — usadas como fuente autoritativa por el compilador; la jerarquía de `Code` solo se usa como respaldo si `isLeaf` viniera vacío (no ocurre en la práctica). Nota real: un código puede extender el mismo grupo decimal sin insertar un nuevo punto (`2A20.0` → `2A20.00`), así que cualquier heurística de terminalidad basada solo en el separador `.` es insuficiente por sí sola — usar siempre el `isLeaf` declarado primero. Solo 876/1290 filas tienen `Foundation URI` (dato incompleto real, no error de importación).

## `ICD10_domains.csv` (899 filas)

Catálogo CIE-10 con jerarquía ClaML. `is_leaf_claml` es la única señal fiable de terminalidad real — `kind:"category"` NO implica terminal (un bloque como `C43` es `category` pero `isLeafClaml:false`). El compilador la usa para validar candidatos de F3/F5 antes de aceptarlos.

## `anatomy_mapping.csv` (3539 filas, 3506 con `Code`)

Identidad de extensiones anatómicas + candidatos CIE-10 por comportamiento + topografía CIE-O. **`TitleEN`/`TitleES` rotos por error de fórmula Excel en 3501/3539 filas** — nunca usados para mostrar nada; las columnas funcionales (códigos, candidatos) están intactas. Falta completar manualmente: etiquetas de anatomía reales (posible fuente: cruzar contra `icd11_anatomy_tree_icd10.csv` o la API viva de la OMS, no incluido en este compilador).

## `anatomy_relations.csv` (1411 filas, 574 códigos distintos)

Fuente editable de pertenencia anatomía→perfil→nodo. **Un mismo `anatomy_code` puede tener varias filas** (un perfil por comportamiento aplicable, p. ej. `brain.malignant`/`brain.nonmalignant` para el mismo código genérico cerebral) — nunca asumir una sola fila por código.

## `rules.csv` (198 filas)

Reglas `family|origin|behaviour|node → icd10`. 8 familias reales observadas: `skin.melanocyte`, `skin.other`, `brain`, `meninges`, `soft_tissue.other`, `peripheral_nerve`, `adipose.superficial`, `lip.mucosal`. Esta vocabulario **no coincide 1:1** con `domain.subdomain` de los stems ni con `profile` de `anatomy_relations.csv` — ver `reports/gap-analysis.md` §3 para el mapeo exacto usado y qué queda pendiente (`adipose.superficial` no tiene origen limpio en los stems).

## `icd11_anatomy_tree_icd10.csv` (1288 filas, 815 con mapeo terminal real)

Crosswalk contextual anatomía→CIE-10, mezclado con filas de agrupación (sin `anatomy_extension` ni `ICD-10`, solo jerarquía `stem_ltree`). Un mapeo terminal puede apuntar a un código CIE-10 NO hoja (bloque) — siempre validar contra `ICD10_domains.csv.isLeafClaml` antes de usarlo como respuesta final.

## `ICD11_histopathology_axis.csv` (1885 filas, 1700 con `Code`)

Morfología+comportamiento CIE-O por extensión histológica (XH). `icdo3_morpho_code` **siempre incluye el sufijo `/comportamiento`** (formato `"8721/3"`) — diferente del formato de `icd11_stem_defaults.csv` (ver abajo). No mezclar el manejo de ambos.

## `icdo_topo_groups.csv` (22 filas)

Topografía CIE-O por `perfil|nodo` (clave compuesta). Solo cubre las familias "híbridas" (piel, tejido blando, adiposo) — cerebro/meninges/hematolinfoide resuelven su topografía por otra vía (ver `resolve.js`, F6).

## Formato de morfología CIE-O: inconsistencia real entre fuentes

| Fuente | `icdo3_morpho_code` incluye `/comportamiento` |
|---|---|
| `ICD11_histopathology_axis.csv` | Sí, siempre (1700/1700 filas) |
| `icd11_stem_defaults.csv` (`ICDO_3_morphology_code`) | Nunca (0/405 filas) — usa `ICD_O_3_behaviour_code` aparte |

`compiler/resolve.js` (F7) maneja ambos casos explícitamente; cualquier código nuevo que lea estas columnas debe hacer lo mismo, no asumir un formato único.

## Qué calcula el compilador (no está en ninguna columna)

- `stem.family` = `domain.subdomain` o `domain`.
- `stem.isLeaf` = inferido de la jerarquía de `Code`.
- `effectiveFamily` (F1) = anatomía postcoordinada puede sobreescribir la familia cruda del stem (ver `resolve.js`).
- Validación de terminalidad de cualquier candidato CIE-10 de F3/F5 contra `ICD10_domains.csv.isLeafClaml`.
- Detección de reglas en conflicto (misma clave `family|origin|behaviour|node`, dos filas distintas).
