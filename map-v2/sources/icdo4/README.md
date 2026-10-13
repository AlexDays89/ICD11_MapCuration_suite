# `sources/icdo4` — procedencia

Ambos archivos se extrajeron mecánicamente (parseo directo del XML de la hoja, sin transcripción manual) de `C:\ICDmaps\Datasets\ICD_O_4_Tabular.xlsx`, hoja **"a) Morphology"**. Solo se usan para etiquetar; nunca cambian qué código se resuelve.

- `icdo4_morphology_labels.csv` (`code;label`): el término `Level="Preferred"` de cada código completo `NNNNN/B` (2308 códigos).
- `icdo4_morphology_terms.csv` (`code;level;term`, 2026-10-14): **todos** los términos de cada código con su nivel (2308 Preferred, 2072 Synonym, 220 Related). `resolve.js` lo usa para mostrar el término que nombra la histología CIE-11 seleccionada cuando ese término no es el preferido del código (curación SNC: `95060/1` es "Sellar neurocytoma" como Preferred y "Central neurocytoma" como Related; la entidad CIE-11 `XH0C11` es la segunda). El resultado expone `label`, `labelLevel` y `preferredLabel`.
