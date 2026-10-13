# Hallazgos reales sobre la API/ECT de la OMS

Mismo propósito que el archivo equivalente de `map2` (`C:\ICDmaps\map2\WHO_ECT_FEEDBACK.md`): gaps o errores reales, reproducibles, en la propia herramienta/API de la OMS -- separado de las brechas de curación de `map-v2` (ver `reports/gap-analysis.md`). Pensado como insumo para reportar a la OMS, no como algo que `map-v2` deba intentar corregir por su cuenta.

## 1. `entity/search` (flexisearch) ordena peor los resultados más específicos

**Endpoint**: `GET https://id.who.int/icd/entity/search?q=<texto>&useFlexisearch=true&flatResults=true&propertiesToBeSearched=Title,Synonym,NarrowerTerm,FullySpecifiedName,Definition,Exclusion&releaseId=2026-01&highlightingEnabled=true`

**Búsqueda**: `carcinoma urotelial papilar no invasor de bajo grado vesical` (2026-09-22).

**Observado**: los primeros resultados devueltos son todos variantes **invasoras** de carcinoma urotelial vesical -- ninguno de los primeros resultados corresponde al concepto específico buscado (no invasor, bajo grado, papilar). El texto de búsqueda incluye explícitamente "no invasor" y "bajo grado", que deberían desempatar a favor de la entidad correcta.

**Evidencia cruda**: `C:\ICDmaps\response_1790072938610.json` (respuesta completa del endpoint, guardada por el usuario). Las etiquetas (`title`) vienen con marcado HTML (`<em class='found'>...</em>`) para resaltar coincidencias, lo que dificulta leer la respuesta cruda sin procesarla primero.

## 2. `mms/autocode` (sin postcoordinación) elige la entidad equivocada; `mms/autocode` de linealización CON postcoordinación sí acierta

**Mismo texto de búsqueda que el hallazgo 1.**

**Endpoint A (Foundation, sin linealización)**: `GET https://id.who.int/icd/entity/autocode?searchText=<texto>&releaseId=2026-01`
Resultado: `matchingText: "carcinoma urotelial vesical"`, `foundationURI: .../entity/1237451411`, `matchScore: 0.532` -- **pierde por completo** la especificidad "no invasor, bajo grado, papilar".

**Endpoint B (linealización MMS)**: `GET https://id.who.int/icd/release/11/2026-01/mms/autocode?searchText=<texto>`
Resultado: `matchingText: "carcinoma urotelial vesical[Bajo grado]"`, `theCode: "2C94.2&XS56"`, `foundationURI: .../entity/1237451411 & .../entity/2023608436`, `matchScore: 0.681` -- **sí encuentra la postcoordinación correcta** (grado bajo, vía extensión `XS56`), con mejor puntaje de coincidencia que el endpoint A.

**Conclusión reproducible**: el endpoint de autocódigo a nivel Foundation (sin resolver contra la linealización MMS) no considera ejes de postcoordinación al hacer el match, mientras que el endpoint de autocódigo de linealización sí lo hace y da la respuesta clínicamente correcta. Cualquier integración que use el autocódigo de Foundation solo debería tratarlo como una aproximación gruesa, nunca como resultado final, y preferir siempre el autocódigo de linealización cuando esté disponible.

## Nota sobre el host usado en `poc-coding-tool`

Estos dos hallazgos se probaron contra `id.who.int` (producción). El host público de pruebas (`icd11restapi-developer-test.azurewebsites.net`, el que usa `poc-coding-tool`) expone los mismos endpoints y devuelve los mismos resultados para esta consulta (confirmado con `curl` el 2026-09-22) -- el problema es de la calidad del buscador/autocódigo de la OMS, no del host específico.
