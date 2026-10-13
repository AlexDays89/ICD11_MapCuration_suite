# Plan futuro — map-v2

Este documento responde a un pedido explícito del usuario (2026-09-22): dejar por escrito el principio de diseño que debe guiar el trabajo de aquí en adelante, qué se revisó de `map2` y qué se recomienda portar, y el diseño del pipeline de curación interactiva para la siguiente iteración. **No implementa nada de esto todavía** — es la base para decidir antes de tocar código otra vez.

## 1. Principio de diseño: la resolución vive en las tablas, no en el resolver

Hoy en la misma sesión resolvimos cuatro bugs reales (región compartida piel/tejido-blando, sentinel `"undefined"`, comportamiento dinámico CNS, y el hallazgo de mama) **escribiendo lógica nueva en `resolve.js`** — heurísticas como `stemTissueAnchor()`, `MESENCHYMAL_ORGAN_SUBDOMAINS`, `ANATOMY_RELATIONS_ELIGIBLE_DOMAINS`, la guarda de nota de exclusión. Funciona y está probado (12 casos de regresión), pero cada una de esas constantes/heurísticas es conocimiento clínico codificado en JavaScript, no en una tabla que un curador pueda leer, editar o versionar sin tocar código.

**Principio para adelante**: cada vez que el resolver necesite una heurística nueva para tapar un hueco de datos, la pregunta correcta no es "¿cómo lo resuelvo en `resolve.js`?" sino **"¿qué fila, columna o tabla nueva evita que el resolver necesite adivinar?"**. El objetivo es que el compilador (import→normalize→validate→materialize→emit) se acerque a una función casi de solo lectura de las tablas maestras, y que `resolve.js` quede reducido a lo mínimo irreducible: F0 (parseo), F1 (ensamblar contexto desde columnas ya explícitas), y una búsqueda directa por clave — sin heurísticas de desambiguación por dominio/subdominio escritas a mano.

Ejemplos concretos de qué movería cada heurística de hoy a una tabla:

| Heurística de hoy (en `resolve.js`) | Tabla/columna que la reemplazaría |
|---|---|
| `MESENCHYMAL_ORGAN_SUBDOMAINS` (set fijo de subdominios "de órgano") | Una columna `tissue_anchor` en `icd11_stem_defaults.csv` (o una tabla `subdomain_tissue_anchor.csv` aparte), poblada por el curador, no inferida por código |
| `ANATOMY_RELATIONS_ELIGIBLE_DOMAINS` (qué dominios pueden usar `anatomy_relations.csv`) | Una columna `applies_to_domain`/`applies_to_family` en `anatomy_relations.csv` misma, o un `scope` explícito por fila -- así una fila de "piel de tronco" nunca podría ni intentar aplicarse a un stem de mama, sin que el resolver tenga que saberlo de antemano |
| Guarda de nota de exclusión (parseo de `exclusion` buscando la palabra "skin") | Una tabla `chapter_exclusions.csv` curada (código de capítulo, tejido excluido, capítulo destino), derivada UNA VEZ de las notas de la OMS por un curador que las lee y decide, no re-parseada en cada resolución |
| `pickProfile()` eligiendo entre variantes de comportamiento (`brain.malignant`/`brain.nonmalignant`) | Ya está bien modelado como datos (`anatomy_relations.csv` ya tiene ambas filas) -- lo único que falta en la tabla es una forma explícita de decir "estas dos filas son variantes de comportamiento del mismo lugar", en vez de que el resolver lo infiera por el nombre del perfil |

## 2. Qué se revisó de `map2` (hallazgo importante, cambia la prioridad)

**Hallazgo clave**: `C:\ICDmaps\map2\sources\final\` contiene el MISMO conjunto de 8 archivos que `Datasets/final` (probablemente una instantánea anterior, antes de las columnas `isLeaf`/`DepthInKind`/`IsResidual`/`subdomain` que el usuario agregó hoy). Es decir, **`map2` ya compiló una vez este mismo linaje de datos**, no solo el linaje viejo (`MAPPING V2 WITH ONTO.xlsx`) que la memoria de sesiones anteriores describía.

Esto cambia la recomendación original (revisar el TTL compilado de 6MB) por una mejor: **revisar las tablas de autoría de `map2/domains/*/authoring/*.tsv`, no el TTL compilado**. El TTL es un artefacto derivado (triples RDF); las TSV de autoría son el conocimiento curado en su forma más portable, ya en filas que se pueden re-importar a una tabla nueva.

Tablas de autoría existentes por dominio:

- `neoplasms-other-sites/authoring/anatomy_covering_rule.tsv` -- **2972 filas, 72 capítulos CIE-10 distintos**. Construida con la jerarquía anatómica REAL de la API viva de la OMS (no adivinada) más un algoritmo de conjuntos-cobertura que agrupa subárboles enteros por capítulo compartido. **Verificación concreta hecha hoy**: esta tabla ya tiene, para el mismo stem `2B56.2` (Angiosarcoma of breast) y para `2C60`/`2C61` (carcinomas de mama), una fila con `anchor_title: "Breast"` sobre la MISMA entidad Foundation (`831985561`) que en `Datasets/final` quedó colapsada a la región genérica "trunk" -- es decir, **`map2` ya resolvió exactamente el hueco de mama que hoy tapamos con la guarda de exclusión de CIE-10, y lo hizo con una anatomía específica real, no con un fallback al default del stem**. Candidata #1 para minar y traer a `map-v2` como enriquecimiento de `anatomy_relations.csv`/`anatomy_mapping.csv` (o una tabla nueva `anatomy_covering_rule.csv` equivalente).
- `neoplasms-cns/authoring/review_status.tsv` + `histology_override.tsv` -- 42 stems de CNS, 41 aprobados uno por uno contra la API viva de la OMS, con 1 corrección real documentada (meningioma). Ya verificamos hoy que **el dato de mama de `Datasets/final` para meningioma YA está correcto** (no hace falta el parche), pero el resto de los 42 no se verificó punto por punto contra esta tabla -- candidata para una pasada de verificación cruzada, no de copiado ciego.
- `neoplasms-other-sites/authoring/histology_postcoordination_rule.tsv`, y el equivalente en `hematolymphoid`/`secondary`/`cutaneous` -- reglas minadas de capturas de producción reales (no de la API), para el caso "solo histología postcoordinada, sin anatomía" -- un flujo que `map-v2`'s `resolve.js` (F7) ya cubre en principio pero sin estas reglas específicas cargadas.
- `neoplasms-cutaneous/authoring/context_rule.tsv` -- reglas contextuales cutáneas ya curadas, útil para comparar contra `rules.csv`'s familias `skin.melanocyte`/`skin.other`.

**Recomendación concreta**: la próxima sesión de trabajo en datos (no de código) debería empezar minando `anatomy_covering_rule.tsv` (other-sites) contra `Datasets/final`'s `anatomy_mapping.csv`/`anatomy_relations.csv`, con el mismo criterio de seguridad que `map2` ya usaba (nunca inventar un capítulo que el stem no tenga ya evidencia independiente de pertenecer) -- exactamente la misma función `chapterMatches()` que `map-v2/compiler/resolve.js` ya implementa, solo que aplicada en tiempo de COMPILACIÓN (enriqueciendo la tabla) en vez de en tiempo de RESOLUCIÓN (parcheando la respuesta).

## 3. Pipeline de curación interactiva -- diseño para la próxima iteración

Este es el diseño (no la implementación) del ciclo completo del Prompt Maestro §8.3, usando lo que ya existe (`CurationPanel`, `captureLog`, `feedbackStore`) como los primeros eslabones:

```
1. Observación        ya existe: captureLog.js (query + candidatos + describe + toggle)
2. Caso reproducible   ya existe: cada registro de captureLog trae selectionId + snapshot completo
3. Propuesta           ya existe: CurationPanel (aceptar / escribir código correcto / marcar) + rationale
        ↓ FALTA A PARTIR DE AQUÍ ↓
4. Revisión            [nuevo] un curador (puede ser el mismo usuario, en otro momento) repasa las
                        decisiones exportadas y las marca aceptadas/rechazadas/pendientes -- hoy
                        CurationPanel no distingue "lo que yo propuse" de "lo que ya se revisó y se
                        acepta como definitivo"
5. Parche              [nuevo] una decisión ACEPTADA se convierte en una fila candidata real para
                        una de las 8 tablas maestras (o una tabla `patches.csv` aparte que el
                        compilador aplica antes de emitir) -- con su propia procedencia
                        (selectionId, curationId, fecha, quién aceptó)
6. Reconstrucción      ya existe el mecanismo: `node compiler/build.js` -- falta que lea `patches.csv`
                        (o las tablas enriquecidas directamente) como una fuente más en `import.js`
7. Regresión           ya existe: `node test/run-cases.mjs` -- falta que cada patch aceptado genere
                        automáticamente su propio caso de regresión (hoy los 12 casos se escriben a mano)
8. Versión             ya existe en parte: `manifest.json` trae hashes de las 8 fuentes -- falta que
                        también hashee `patches.csv` y quede en el historial de versiones del mapa
```

**Piezas concretas a diseñar en la próxima iteración de código** (ninguna implementada hoy):
- Un formato para `patches.csv` (o `patches/*.json`, uno por decisión) que `compiler/import.js` pueda leer como una fuente más -- probablemente: `{targetTable, targetKey, column, newValue, sourceRef: curationId, acceptedAt, acceptedBy, rationale}`.
- Una vista de "revisión pendiente" en el frontend (probablemente una página nueva, no dentro de `MapPanel`) que liste todas las decisiones de `curationStore.js` con estado `changed`/`flagged` que aún no se convirtieron en patch, para que un curador las procese en lote.
- Decidir si los patches se aplican como una fila NUEVA en la tabla original (ej.: agregar una fila a `anatomy_relations.csv` con el perfil `breast` para `XA12C1`) o como una capa de override separada que nunca modifica los 8 CSV originales (más fiel al mandato del Prompt Maestro de "copia de origen inmutable", §2.2) -- la recomendación es la segunda opción: los 8 CSV de `Datasets/final` nunca se editan a mano: los patches viven en `map-v2/patches/` y el compilador los aplica como una etapa de integración adicional, con puntero de vuelta a la fila/motivo que se está corrigiendo.

## 4. Backlog del frontend (`poc-coding-tool`), reunido 2026-09-22 antes de iterar

Ninguno de estos puntos se implementó todavía -- son las dudas y hallazgos que el usuario planteó antes de empezar la próxima iteración de código, ya diagnosticados (algunos verificados en vivo) para que la iteración empiece con el diagnóstico ya hecho.

### 4.1 Curación: confirmado que es por eje, no por código completo

`CurationPanel`/`curationStore.js` ya guardan una decisión por `(expression, axis)` -- `axis` es `icd10` | `icdoTopography` | `icdoMorphology`, cada uno con su propio registro, propio código propuesto y propio fundamento. Un mismo código completo puede tener hasta 3 decisiones (una por eje). No hace falta cambiar nada aquí, solo estaba sin documentar.

### 4.2 Visualizar el flujo de resolución (F0→F1→F3/F4/F5→F6/F7), no solo el JSON crudo

`resolve.js` ya construye un `trace[]` (pasos como `F0`, `F1_behaviour_from_histology`, `F4`, `F4_exclusion_guard`) pero hoy solo se ve como JSON crudo en "Selección, fuentes y trazabilidad". Diseño propuesto para la iteración: un componente que dibuje el `trace` como una secuencia de pasos (F0 → F1 → ruta elegida de CIE-10 → F6 → F7), cada uno con su estado (aplicado / descartado / no aplica) y el campo de la tabla maestra que lo alimentó -- así un caso que falla se puede leer como "F3 se descartó porque el destino no es hoja (`isLeafClaml=false`)" en vez de tener que leer el JSON a mano. Esto también ayuda a decidir §1 (qué heurística mover a tabla): si un paso se descarta siempre por el mismo motivo, ese motivo es candidato a convertirse en una columna.

### 4.3 Bug confirmado en vivo: pestañas "Entidad"/"Describe" -- `Error: Failed to fetch`

**Causa raíz diagnosticada, no solo reproducida**: `useEntityDetail.js` usa `entity.linearizationUri` tal cual como URL para `fetch()`. Ese campo que devuelve el widget ECT es un identificador CANÓNICO en el espacio de nombres `id.who.int` (ej. `http://id.who.int/icd/release/11/2026-01/mms/1237451411`), **no necesariamente el endpoint real a consultar** -- confirmado con `read_network_requests` en vivo: la petición que realmente sale es `GET http://id.who.int/icd/release/11/2026-01/mms/1237451411` (nótese `http://`, no `https://`, y el host de producción `id.who.int` en vez de `WHO_MMS_BASE`, el host público de pruebas configurado), que devuelve `503`. Lo mismo afecta a `describeUri` (usa `rawLinUri` completo, con el separador `" & "` compuesto sin procesar, como un solo parámetro `uri`).

**Arreglo ya identificado** (no aplicado -- pendiente para cuando se retome código): extraer el ID numérico de la entidad de la URI (el viejo `mapCapture.js`, borrado en la Fase 1 de este proyecto, ya tenía exactamente esta función -- `entityIdFromLinearizationSegment()`, regex `/\/(\d+)(?:\/other)?$/`) y reconstruir la URL contra `WHO_MMS_BASE` en vez de reusar la URI de la OMS tal cual. Aplica igual para el primer segmento de una expresión postcoordinada (usar solo la entidad base) y para el describe (que debería probablemente consultarse por componente, no con el compuesto completo como un solo `uri`).

### 4.4 Bug confirmado en vivo: CIE-O muestra el estado ("Resuelto") en el lugar de la etiqueta

`MapPanel.jsx` renderiza `x?.label || STATUS_LABEL[x?.status] || 'Sin resolución'` -- como `resolve.js` nunca adjunta `.label` a `icdoTopography`/`icdoMorphology` (solo `icd10` lo tiene, vía `withDestLabel()` contra `ICD10_domains.csv`), el resultado siempre cae al texto de estado. **Dos cosas separadas que hay que dejar de fusionar**: la etiqueta del código (qué es) y el estado de la resolución (cómo se llegó a él) deben mostrarse como dos campos distintos, nunca uno sustituyendo al otro.

Fuentes de etiqueta real disponibles hoy, por eje:
- **Morfología**: cuando la fuente es histología postcoordinada (F7 vía `ICD11_histopathology_axis.csv`), esa tabla SÍ tiene `TitleEN`/`Title` reales (no rotos por el bug de Excel) -- se puede adjuntar directamente. Cuando la fuente es el default del stem (`ICDO_3_morphology_code`), todavía no hay etiqueta -- ver §4.4.1, hoja "a) Morphology" del Excel, no extraída todavía.
- **Topografía**: **resuelto 2026-09-22** -- ver `reports/gap-analysis.md` §1f y `sources/icdo3.2/icdo3_topography_labels.csv` (nuevo). 278/281 códigos de topografía usados hoy ya tienen etiqueta real disponible (260 vía `ICD10_domains.csv`, 18 vía la tabla nueva); los 3 restantes (`C19.0`,`C20.0`,`C21.9`) no tienen etiqueta porque son códigos que no existen en CIE-O-3 -- un hallazgo de calidad de datos real en `icd11_stem_defaults.csv`, no un hueco de esta tabla. Falta wire-up en `resolve.js`/`normalize.js` (leer el nuevo archivo) y en `MapPanel.jsx` (mostrar etiqueta y estado como dos campos separados, nunca uno sustituyendo al otro) -- ninguno de los dos se tocó todavía.

#### 4.4.1 Fuentes adicionales del mismo Excel, no usadas todavía
`C:\ICDmaps\Datasets\ICD_O_4_Tabular.xlsx` tiene además: hoja "a) Morphology" (nomenclatura CIE-O-4, códigos de 5 dígitos, con niveles `Preferred`/`Synonym` -- candidata para etiquetar morfología-por-default de stem, el hueco que queda arriba); hoja "c) Topography optional" (variante CIE-O-4 con 5º dígito, ej. `C00.00` -- solo relevante si `map-v2` llega a exponer CIE-O-4 como salida independiente, ver `gap-analysis.md` §2); hoja "Comparación Topography", no revisada. Ver `sources/icdo3.2/README.md` para el detalle de procedencia de lo que sí se extrajo.

### 4.5 Guardar el string crudo (con etiquetas) junto al mapeo aprobado, para poder unir a Foundation después

Pedido concreto: cuando se "Acepta" una resolución en `CurationPanel`, guardar junto con la decisión el payload crudo de la selección (query original, `selectedText`, `title`, `foundationUri`, `linearizationUri`) -- no solo el código propuesto/aceptado. Hoy `CurationPanel` no recibe la entidad cruda en absoluto (solo `expression` y `result`); `captureLog.js` sí la captura pero queda en un store distinto (`feedbackStore`, no `curationStore`). Para la próxima iteración: pasar el `captureRecord`/`selection` completo a `CurationPanel` y guardarlo dentro de cada decisión aceptada, exactamente con la idea explícita del usuario: no hace falta decidir HOY cómo integrar los conceptos de Foundation que no están linealizados en MMS pero que el buscador sí expone -- alcanza con no perder el string+etiquetas+URI Foundation ahora, para poder cruzarlos después.

### 4.6 Enriquecimiento a demanda vía los endpoints de la OMS (no en cada búsqueda)

Idea del usuario, para diseñar (no implementada): en vez de llamar `search`/`autocode`/`codeinfo`/`describe` en cada tecleo, ofrecer un botón explícito ("guardar con contexto enriquecido") que, solo cuando el curador lo pide para un caso puntual que quiere preservar bien, dispare esas llamadas y adjunte sus respuestas completas al registro guardado (feedback o curación). Encaja directamente en el pipeline de curación diseñado en §3 -- sería parte del paso 2 ("Caso reproducible"), como un enriquecimiento opcional bajo demanda, no automático.

### 4.7 `WHO_ECT_FEEDBACK.md` (nuevo)

Creado hoy en `C:\ICDmaps\map-v2\WHO_ECT_FEEDBACK.md`, mismo propósito que el archivo homónimo de `map2`: hallazgos reales y reproducibles sobre la calidad de la búsqueda/autocódigo de la propia OMS (dos casos documentados hoy: `entity/search` flexisearch ordena peor lo más específico; `autocode` de Foundation sin postcoordinación elige la entidad equivocada donde el autocódigo de linealización sí acierta). Separado de las brechas de curación de `map-v2` -- este archivo es insumo para reportar a la OMS, no algo que el compilador deba intentar corregir.

## 5. Próximos pasos concretos, en orden sugerido

1. Minar `map2/domains/neoplasms-other-sites/authoring/anatomy_covering_rule.tsv` contra `anatomy_relations.csv`/`anatomy_mapping.csv` -- identificar qué perfiles de órgano (mama y otros) se pueden agregar como filas reales, no como excepción en código.
2. Diseñar y escribir el esquema de `patches.csv` + la etapa del compilador que lo aplica (§3).
3. Mover las heurísticas de hoy (tabla de la §1) a columnas/tablas reales, una por una, verificando con los 12 casos de regresión existentes que el resultado no cambia -- recién ahí se puede borrar la heurística equivalente de `resolve.js`.
4. Construir la vista de "revisión pendiente" en el frontend.
5. Repetir la verificación cruzada estilo `map2` (comportamiento declarado vs. comportamiento de la histología default) para los dominios que `map2` no llegó a revisar completo (todo salvo CNS).

## 6. Curación de las 8 fuentes base, pensando en la versión publicable (2026-09-22)

Pedido explícito del usuario: identificar qué suciedad de datos hoy se parcha en el compilador (`normalize.js`) que en realidad debería arreglarse en los CSV de origen, antes de convertir esto en algo que la propia OMS pueda probar. Medido con números reales sobre los 8 archivos, no adivinado. **Este documento se escribe antes de tocar ningún CSV**, según lo pedido ("documenta primero y luego cura los datos").

### 6.0 Un archivo ya fue curado a mano por el usuario mientras se escribía este análisis -- y expuso un bug real

`anatomy_mapping.csv` fue editado y re-guardado por el usuario (mismo día, antes de ejecutar la curación de los otros 7): recalculó las fórmulas de Excel que producían `#¡NOMBRE?` en `TitleEN`/`TitleES` (rotas en 97.1%/98.7% de las 3538 filas) y lo guardó como **UTF-8 con BOM**. Verificado: 0 errores `#¡NOMBRE?` restantes, 0 filas con el prefijo de guiones de profundidad, acentos correctos (`"Células sanguíneas"`).

**Esto expuso un bug activo, no solo un problema de estilo**: `compiler/lib/csv.js` lee los 8 archivos como Latin-1 (`readLatin1`), asumiendo una codificación uniforme. Con `anatomy_mapping.csv` ahora en UTF-8, cada carácter acentuado se corrompe al pasar por el compilador (`"Células sanguíneas"` → `"CÃ©lulas sanguÃ­neas"`, verificado directamente en `dist/map.bundle.json`). El BOM también corrompe el primer header (`"id"` → `"ï»¿id"`), inofensivo hoy solo porque `normalize.js` no lee `r.id` para `anatomyMapping`, pero es la misma clase de bug. **Fix incluido en este mismo pase de curación** (ver 6.3): convertir los otros 7 archivos a UTF-8 también y hacer que `csv.js` lea UTF-8 de forma uniforme (tolerando BOM si aparece), en vez de Latin-1.

**Hallazgo aparte, no tocado en este pase**: la edición del usuario reveló una columna `node_relations` en `anatomy_mapping.csv` (ya existía, no fue agregada ahora -- solo visible tras el fix de encoding) con un mapa JSON inline `{perfil: nodo}` por código de anatomía -- ej. `{"skin": "lip", "soft_tissue": "head_neck", "adipose.superficial": "head_neck", "lip.mucosal": "external_upper"}`. Es el mismo vocabulario perfil→nodo que hoy vive como filas independientes en `anatomy_relations.csv`, pero en línea por código. Es exactamente el tipo de enriquecimiento que el principio de la §1 pide (dato en tabla, no heurística en `resolve.js`) y podría eventualmente simplificar o reemplazar `pickProfile()`/`stemTissueAnchor()`. **Decisión explícita del usuario: no integrar todavía** -- "si decidimos integrarla, hay que estudiar muy bien las implicancias y como se seguirá enriqueciendola, para que no se rompa nada de lo que llevamos". Queda como candidata para una sesión propia de análisis antes de tocar `resolve.js`/`normalize.js` con esto. También se encontró una columna `browser` en el mismo archivo cuyo valor es literalmente el string `"browser"` en las 3538 filas -- placeholder muerto, no se toca, no se usa en ningún lado.

### 6.1 Suciedad medida en los 7 archivos restantes (antes de curar)

| Issue | Archivo | Alcance medido |
|---|---|---|
| Prefijo `"- - - - "` de profundidad horneado en el título | `ICD11_histopathology_axis.csv` | 100% de 1885 filas en `TitleEN` y `Title` |
| Columna mal nombrada `Title` (en realidad es el título en español) | mismo archivo | 1838/1885 filas donde `Title` ≠ `TitleEN` tras quitar el prefijo -- confirmado que es la traducción ES, mismo problema que ya se corrigió en `icd11_stem_defaults.csv` |
| 2 filas con caracteres `?` sueltos dentro del título (no el prefijo) | mismo archivo | `"- - - - ?Benign ??Triton tumour"` / `"- - - - ?Mesenchymal hamartoma"` -- la versión en español no tiene el `?`, indicio de mojibake de un carácter especial perdido, no de una convención clínica real. **No se adivina el reemplazo**: se deja igual y se flaggea aquí para verificar contra la entidad Foundation en vivo más adelante. |
| Literal string `"undefined"` en vez de celda vacía | `icd11_stem_defaults.csv` | hasta 54.7% en `precoordinated_morphology`, 40.9% en `precoordinated_topography`, y 8 columnas más (30/1290 en `behaviour`, 29 en `icd10_default`, 11 en cada default de topografía ICD-O, ~25 en cada código/comportamiento de morfología ICD-O) |
| Booleanos con capitalización inconsistente entre columnas | `icd11_stem_defaults.csv`, `ICD10_domains.csv`, `ICD11_histopathology_axis.csv`, `anatomy_mapping.csv` | `IsResidual`/`isLeaf` usan `True`/`False`; `icd10_needs_refinement` ya usa `true`/`false`/`''` (el único ya canónico); `is_leaf_claml` usa `True`/`False`/`''` |
| JSON-array-como-texto dentro de una celda CSV | `ICD10_domains.csv` (`inclusion`/`exclusion`) | 273/899 filas con `inclusion` no vacío, 160/899 con `exclusion` no vacío, hasta 13 items por celda -- doble serialización (CSV con quoting + JSON adentro) en vez de una tabla larga |
| Columna fantasma sin nombre, con datos reales | `icd11_anatomy_tree_icd10.csv` | header vacío al final (`;` sobrante); 4/1288 filas tienen contenido ahí, y las 4 dicen literalmente `"PLACEHOLDER"` -- confirmado que es residuo de autoría, no dato perdido |
| Codificación Latin-1 (los otros 7, ver 6.0) | todos salvo `anatomy_mapping.csv` | causa el bug de corrupción de acentos si conviven con un archivo UTF-8 |

`anatomy_relations.csv`, `rules.csv`, `icdo_topo_groups.csv` se revisaron también (columna `status`, literal `"undefined"`, guiones) -- sin hallazgos, solo necesitan la conversión de encoding.

**Hallazgos adicionales, encontrados durante la ejecución (no estaban en el análisis original) por una verificación final de "cero residuos" antes de borrar código**:
- `ICD10_domains.csv` también tenía el sentinel `"undefined"` en `origin`/`behaviour` (5 filas) -- no se había revisado esta columna en el análisis inicial, solo `icd11_stem_defaults.csv`.
- `icd11_anatomy_tree_icd10.csv` tenía el MISMO error de fórmula Excel `#¡NOMBRE?` que `anatomy_mapping.csv` en `icd11_label_EN`/`icd11_label_ES` (98.5%/98.8% de las 1288 filas) más prefijos de guiones en las filas que sí estaban limpias (16). A diferencia de `anatomy_mapping.csv`, aquí no hubo edición manual del usuario -- se reconstruyó **100% de las filas rotas** por cruce exacto de código (`anatomy_extension == anatomy_mapping.Code`) contra el `anatomy_mapping.csv` ya limpio, verificado antes de escribir (cobertura 1269/1269 y 1273/1273, no una muestra parcial). Estas dos columnas no las lee `normalize.js` hoy (igual que pasaba con las de `anatomy_mapping.csv` antes de este pase), así que el arreglo es puramente de calidad del dato base, sin efecto en la resolución actual.

### 6.2 Lo que NO se toca en este pase (fuera del alcance aprobado)

- Armonización de nombres de columna entre los 8 archivos (`Foundation URI` vs `foundation_uri`, `Code` vs `code`, `TitleEN` vs `icd11_title_en` vs `preferred`) -- identificado como mejora para la versión publicable, pero de mayor alcance (toca cada accessor de `import.js`/`normalize.js` en los 8 archivos a la vez); no se aprobó para este pase, queda pendiente.
- Integración de `node_relations` (ver 6.0) -- pendiente de estudio propio.
- Los 2 títulos con mojibake en `ICD11_histopathology_axis.csv` (ver tabla 6.1) -- flaggeados, no adivinados.

### 6.3 Curas aplicadas en este pase (aprobado explícitamente por el usuario, 2026-09-22)

1. `csv.js`: leer los 8 archivos como UTF-8 (tolerando BOM si aparece) en vez de Latin-1 -- arregla el bug de 6.0 de raíz.
2. `icd11_stem_defaults.csv`: `"undefined"` literal → celda vacía en todas las columnas; `IsResidual`/`isLeaf` → `true`/`false`.
3. `ICD11_histopathology_axis.csv`: quitar el prefijo de guiones de `TitleEN`/`Title` (valor limpio horneado en el archivo); renombrar `Title` → `TitleES`; `isLeaf` → `true`/`false`.
4. `ICD10_domains.csv`: `is_leaf_claml` → `true`/`false`/`''`; `inclusion`/`exclusion` extraídos a una tabla larga nueva `icd10_domain_notes.csv` (`code;kind;note`), columnas originales eliminadas.
5. `icd11_anatomy_tree_icd10.csv`: columna fantasma (`"PLACEHOLDER"` en 4 filas) eliminada.
6. `anatomy_mapping.csv`: sin tocar el trabajo del usuario (títulos, BOM) -- solo se normaliza `isLeaf` a `true`/`false` para consistencia con el resto.
7. Código que queda obsoleto y se elimina en `normalize.js` tras verificar que ningún archivo ya tiene el problema que parchaba: `cleanLabel()`/`stripDepthDashes()`/`NOMBRE_ERROR` (reemplazados por `val()` en los 4 sitios que los usaban), la tolerancia a `True`/`1` en `bool()` y a mayúsculas en `triBool()` (quedan solo `'true'`/`'false'`), `parseNoteArray()` y el JSON.parse de `inclusion`/`exclusion` (reemplazado por una lectura directa de `icd10_domain_notes.csv`), y la rama `t === 'undefined'` de `val()` una vez confirmado que ningún archivo la usa ya.
8. Verificación después de cada archivo: `node test/run-cases.mjs` (12 casos) debe seguir en verde; si algo rompe, se revierte ese archivo puntual y se avisa antes de seguir.

**Resultado real de la ejecución (2026-09-22)**: los 8 archivos se convirtieron a UTF-8, `csv.js` ahora lee UTF-8 uniformemente (`readUtf8()`, tolera BOM), y una verificación final de "cero residuos" sobre los 9 archivos (8 + `icd10_domain_notes.csv`) confirmó `anyUndef=false, anyNombre=false, anyDash=false, anyCapBool=false` antes de tocar el código. Recién ahí se simplificó `normalize.js`: `cleanLabel()`/`stripDepthDashes()`/`NOMBRE_ERROR` eliminados (reemplazados por `val()` en los 5 sitios que los usaban), `bool()` reducido a `v === 'true'`, `triBool()` reducido a solo `'true'`/`'false'`/`null`, y `val()` perdió la rama de `"undefined"` (queda solo trim + vacío→null). `resolve.js` no necesitó cambios funcionales (solo un comentario desactualizado). Ningún caso de regresión cambió: 12/12 en verde en cada paso, verificado individualmente por archivo, no solo al final. Ninguna fila se perdió en ningún archivo (conteos idénticos antes/después). `poc-coding-tool` se reconstruyó contra el bundle curado sin errores.
