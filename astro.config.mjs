// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

export default defineConfig({
  // The stylesheet is small: inlined, the first paint needs no extra round trip.
  build: { inlineStylesheets: 'always' },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Figtree',
      cssVariable: '--font-display',
      fallbacks: ['system-ui', 'sans-serif'],
      options: { variants: [{ src: ['./src/assets/fonts/figtree.woff2'], weight: '300 900', style: 'normal' }] },
    },
    {
      provider: fontProviders.local(),
      name: 'Nunito',
      cssVariable: '--font-ui',
      fallbacks: ['system-ui', 'sans-serif'],
      options: { variants: [{ src: ['./src/assets/fonts/nunito.woff2'], weight: '200 1000', style: 'normal' }] },
    },
  ],
});
