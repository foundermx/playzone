# Playzone Córdoba

Landing en Astro con el parque en Three.js. Requiere Node 26 (`nvm install` lee `.nvmrc`).

```sh
pnpm install
pnpm dev       # http://localhost:4321
pnpm build     # sitio estático en dist/
pnpm check     # tipos
pnpm test      # recorrido de cámara y formas
```

Para juzgar velocidad usa `pnpm build && pnpm preview`: en `pnpm dev` Astro comprime las imágenes
al vuelo y la primera carga tarda varios segundos.

## Dónde tocar qué

| Qué | Dónde |
| --- | --- |
| Textos, teléfono, dirección, ligas, paradas del recorrido | `src/data/site.ts` |
| Secciones de la página | `src/components/` |
| Zoom del hero hacia la puerta | `src/scripts/intro.ts`; la puerta es `DOOR` en `Hero.astro` y la duración `--intro-travel` en `ParkTour.astro` |
| Fotos de la galería | lista `photos` en `src/components/Gallery.astro` (fotos reales en `src/assets/img/`) |
| Pie de página (la plancha, los ladrillos-botón y las fichas que se construyen al tocarla) | `src/components/Footer.astro` |
| Ladrillos que vuelan junto a las secciones | `src/components/FlyingBricks.astro`; dónde va cada uno, lista `pieces` en `Gallery.astro` y `Locations.astro` |
| Animaciones con el scroll | `--p` de `src/scripts/scroll-progress.ts`; el "clic" de encaje (`.snap`) y los títulos (`.reveal`) en `global.css` |
| Escala y colores globales | `src/styles/global.css` (1rem = 10 px del mockup de 724 px) |
| Trazado del parque (ladrillos, zonas) | `src/scripts/park/layout.ts` |
| Personajes (minifiguras), props y animación | `src/scripts/park/figure.ts`, `props.ts`, `park.ts` |
| La nave: piso, tapetes, reflejos, paredes, techo | `HALL`, `MATS` y `PADDING` en `layout.ts`; el piso es `FLOOR_FRAGMENT` en `toy.ts` |
| Estructura de juegos con resbaladilla, columnas rayadas, techo, mesas de la cafetería, alberca de pelotas, recepción, letrero | `src/scripts/park/venue.ts` (fuera de lo que ven las paradas del recorrido) |
| Materiales y luz | `src/scripts/park/toy.ts` |
| Encuadre de cada parada | `src/scripts/park/tour.ts` (mismo orden que `STOPS`) |

## Luz horneada

Toda la iluminación pesada vive en `public/park-light.dat`, un volumen 3D calculado una sola vez,
así cada píxel cuesta una lectura de textura. Si cambias `layout.ts` vuelve a generarlo (1 min):

```sh
node scripts/bake-light.ts
```

Fuera de ese volumen (el resto de la nave) la luz pasa sola a luz abierta, así que el piso, las
paredes y las demás atracciones no necesitan hornearse.

`park-poster.webp` y `brick-*.webp` son renders del propio modelo: el póster se ve mientras carga
Three.js y es lo que reciben quienes no tienen WebGL o piden menos movimiento.
