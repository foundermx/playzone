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
| Escala y colores globales | `src/styles/global.css` (1rem = 10 px del mockup de 724 px) |
| Trazado del parque (ladrillos, zonas) | `src/scripts/park/layout.ts` |
| Personajes, props y animación | `src/scripts/park/figure.ts`, `props.ts`, `park.ts` |
| Materiales y luz | `src/scripts/park/toy.ts` |
| Encuadre de cada parada | `src/scripts/park/tour.ts` (mismo orden que `STOPS`) |

## Luz horneada

Toda la iluminación pesada vive en `public/park-light.dat`, un volumen 3D calculado una sola vez,
así cada píxel cuesta una lectura de textura. Si cambias `layout.ts` vuelve a generarlo (1 min):

```sh
node scripts/bake-light.ts
```

`park-poster.webp` y `brick-*.webp` son renders del propio modelo: el póster se ve mientras carga
Three.js y es lo que reciben quienes no tienen WebGL o piden menos movimiento.
