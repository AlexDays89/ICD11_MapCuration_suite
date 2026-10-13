# `icdo3_topography_labels.csv` — procedencia

Extraído 2026-09-22 de `C:\ICDmaps\Datasets\ICD_O_4_Tabular.xlsx`, hoja **"b) Topography"** (nomenclatura CIE-O-3.2, la que usan los 8 CSV de `Datasets/final` -- no confundir con la hoja "c) Topography optional", que trae el 5º dígito propio de CIE-O-4 y no se usó aquí). Extracción mecánica (sin transcripción manual): se parseó el XML de la hoja directamente (`sharedStrings.xml` + `sheet2.xml`), tomando el término `Level="Preferred"` por código, o el término de categoría (`Level` 2/3/4) cuando no hay código de subcategoría. Script de extracción en el scratchpad de la sesión, no versionado aquí (es un extractor de un solo uso, no parte del compilador).

Contrastado independientemente contra `C:\ICDmaps\CIEO-3.1._ACCESIBLE.pdf` (páginas ~53-75, sección "Topografía") para una muestra de 20 códigos -- coinciden (en español en el PDF, en inglés en el Excel, mismo significado).

**Cobertura real medida**: de los 281 códigos de topografía CIE-O-3.2 distintos que usan las tablas de `map-v2` hoy, 260 ya tenían etiqueta en `ICD10_domains.csv` (mismo código, ya cargado); este archivo aporta las **18 restantes que son exclusivas de CIE-O** (nunca existieron en CIE-10 -- ver `C42 SISTEMAS HEMATOPOYÉTICO Y RETICULOENDOTELIAL`, con nota explícita en el PDF: *"C42 es una categoría vacante en la CIE-10, aunque se utiliza en la CIE-O"*). Quedan **3 códigos sin etiqueta posible porque no existen en CIE-O-3 en absoluto** -- ver `reports/gap-analysis.md` §1f, hallazgo de calidad de datos, no un problema de esta tabla.

**No usado todavía en el compilador** -- es un archivo fuente nuevo, listo para que `compiler/normalize.js`/`resolve.js` lo consuman cuando se retome la iteración de código (cierra el punto 4.4 pendiente en `reports/future-plan.md`).

## Otras hojas del mismo Excel, no extraídas todavía

- **"a) Morphology"**: nomenclatura CIE-O-4 (códigos de 5 dígitos, ej. `80000/0`), con niveles `Preferred`/`Synonym`. Útil en el futuro para etiquetar morfología cuando la fuente es el default del stem (`ICDO_3_morphology_code`), que hoy no tiene etiqueta (a diferencia de la morfología postcoordinada, que sí la tiene vía `ICD11_histopathology_axis.csv`).
- **"c) Topography optional"**: variante CIE-O-4 con 5º dígito (`C00.00` en vez de `C00.0`). Relevante solo si `map-v2` llega a exponer CIE-O-4 como salida independiente (pendiente, ver `reports/gap-analysis.md` §2).
- **"Comparación Topography"**: no revisada.
