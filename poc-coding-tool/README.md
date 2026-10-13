# Interfaz de curación

Aplicación estática (React + Vite, sin backend) con dos páginas, Browser y Coding Tool, que usan el widget oficial de la OMS (`@whoicd/icd11ect`) para seleccionar una entidad CIE-11 y muestran cómo la resuelve el mapa.

## Cómo funciona

1. El widget se configura contra la instancia pública de desarrollo y pruebas de la OMS (`src/ectConfig.js`). No requiere registro ni credenciales.
2. Al seleccionar una entidad, `src/maplab/MapPanel.jsx` carga `/map-v2.bundle.json` y llama a `resolveSelection` de `src/maplab/resolve.js`. Ambos archivos se copian desde `../map-v2/dist` con `scripts/copy-map-v2.mjs`, que corre solo antes de `dev` y `build`; no se editan aquí ni se versionan.
3. El panel muestra cuatro ejes: CIE-10, topografía CIE-O-3.2, morfología CIE-O-3.2 y morfología CIE-O-4.
4. Bajo el resultado, el panel de curación (`src/curation/`) registra por eje una decisión (aceptar, corregir, marcar) con su justificación, y la caja de feedback (`src/feedback/`) registra observaciones para la OMS. Todo queda en el `localStorage` del navegador y se exporta a JSON desde la propia interfaz.

## Uso

Desde la raíz del repositorio:

```sh
pnpm run app:install
pnpm run dev
```

Si cambian los datasets, recompilar primero el mapa (`pnpm run map`) y volver a levantar la interfaz.
