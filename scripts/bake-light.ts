/**
 * Offline light bake: ray-marches the park once and stores, per voxel, what the page would
 * otherwise have to compute every frame. RGB is ambient light (sky, lamps and two bounces
 * of colour between bricks), A is how much of the sun reaches that spot.
 *
 *   node scripts/bake-light.ts     # after changing src/scripts/park/layout.ts
 */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import {
  COLOR, DECK, DECK_WATER_Y, LAMPS, LIGHT_VOLUME, POOL, SUN, WATER_Y, createLayout, insidePlate, insideRect, seededRandom,
} from '../src/scripts/park/layout.ts';

const { min, max, voxel } = LIGHT_VOLUME;
const FINE = 0.2;
const SKY_RAYS = 112;
const SUN_RAYS = 28;
const LAMP_RAYS = 6;
const REACH = 26;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const albedoOf = (hex: number): [number, number, number] => [toLinear((hex >> 16 & 255) / 255), toLinear((hex >> 8 & 255) / 255), toLinear((hex & 255) / 255)];

// Solid cells at fine resolution, each one pointing at an entry of the palette.
const fx = Math.round((max[0] - min[0]) / FINE);
const fy = Math.round((max[1] - min[1]) / FINE);
const fz = Math.round((max[2] - min[2]) / FINE);
const solid = new Uint8Array(fx * fy * fz);
const palette: [number, number, number][] = [[0, 0, 0]];
const paletteIndex = new Map<number, number>();
const paint = (hex: number) => {
  if (!paletteIndex.has(hex)) {
    paletteIndex.set(hex, palette.length);
    palette.push(albedoOf(hex));
  }
  return paletteIndex.get(hex)!;
};
const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number) => {
  const index = paint(hex);
  const cell = (v: number, axis: number) => Math.floor((v - min[axis]) / FINE);
  for (let x = Math.max(0, cell(x0, 0)); x <= Math.min(fx - 1, cell(x1 - 1e-4, 0)); x++) {
    for (let y = Math.max(0, cell(y0, 1)); y <= Math.min(fy - 1, cell(y1 - 1e-4, 1)); y++) {
      for (let z = Math.max(0, cell(z0, 2)); z <= Math.min(fz - 1, cell(z1 - 1e-4, 2)); z++) {
        solid[(x * fy + y) * fz + z] = index;
      }
    }
  }
};

const { bricks, planks } = createLayout();

// Plate, with the pool sunk into it.
for (let x = min[0]; x < max[0]; x += FINE) {
  for (let z = min[2]; z < max[2]; z += FINE) {
    if (!insidePlate(x + FINE / 2, z + FINE / 2)) continue;
    const pool = insideRect(x, z, POOL);
    fill(x, -1.2, z, x + FINE, pool ? WATER_Y : 0, z + FINE, pool ? COLOR.water : COLOR.blue);
  }
}
fill(0, DECK.bottom, 0, DECK.x1 - DECK.lip, DECK_WATER_Y, DECK.z1 - DECK.lip, COLOR.water);
for (const b of bricks) {
  if (b.width) fill(b.x, b.y, b.z, b.x + b.width, b.y + b.height, b.z + b.depth, b.color);
}
for (const p of planks) fill(p.x - p.width / 2, p.y - 0.17, p.z - p.depth / 2, p.x + p.width / 2, p.y + 0.17, p.z + p.depth / 2, COLOR.wood);

// March a ray through the fine grid. Returns the palette entry hit, 0 if it got out.
let lastX = 0;
let lastY = 0;
let lastZ = 0;
function march(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, reach: number) {
  lastX = ox;
  lastY = oy;
  lastZ = oz;
  for (let t = 0.3; t < reach; t += FINE) {
    const x = ox + dx * t;
    const y = oy + dy * t;
    const z = oz + dz * t;
    const cx = Math.floor((x - min[0]) / FINE);
    const cy = Math.floor((y - min[1]) / FINE);
    const cz = Math.floor((z - min[2]) / FINE);
    if (cx < 0 || cy < 0 || cz < 0 || cx >= fx || cy >= fy || cz >= fz) return 0;
    const hit = solid[(cx * fy + cy) * fz + cz];
    if (hit) return hit;
    lastX = x;
    lastY = y;
    lastZ = z;
  }
  return 0;
}

const nx = Math.round((max[0] - min[0]) / voxel);
const ny = Math.round((max[1] - min[1]) / voxel);
const nz = Math.round((max[2] - min[2]) / voxel);
const count = nx * ny * nz;
const at = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
const voxelAt = (x: number, y: number, z: number) => {
  const i = Math.min(nx - 1, Math.max(0, Math.floor((x - min[0]) / voxel)));
  const j = Math.min(ny - 1, Math.max(0, Math.floor((y - min[1]) / voxel)));
  const k = Math.min(nz - 1, Math.max(0, Math.floor((z - min[2]) / voxel)));
  return at(i, j, k);
};

// Directions spread evenly over the sphere.
const sphere: [number, number, number][] = Array.from({ length: SKY_RAYS }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / SKY_RAYS;
  const r = Math.sqrt(1 - y * y);
  const a = i * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(a) * r, y, Math.sin(a) * r];
});

const skyColor = (y: number): [number, number, number] => {
  if (y < 0) {
    // Below the model: the pale blue of the page, bounced back up.
    return [0.42, 0.56, 0.68];
  }
  const t = Math.min(1, y * 1.6);
  return [0.86 + 0.1 * t, 0.92 + 0.1 * t, 1 + 0.12 * t];
};

// One fixed set of jittered directions for every voxel: neighbours agree, so there is no
// noise to filter and the file compresses far better.
const random = seededRandom(91);
const sunRays = Array.from({ length: SUN_RAYS }, () => {
  const x = SUN[0] + (random() - 0.5) * 0.17;
  const y = SUN[1] + (random() - 0.5) * 0.17;
  const z = SUN[2] + (random() - 0.5) * 0.17;
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
});
const lampJitter = Array.from({ length: LAMP_RAYS }, () => [(random() - 0.5) * 0.8, (random() - 0.5) * 0.3, (random() - 0.5) * 0.8]);
const sunVis = new Float32Array(count);
const lamp = new Float32Array(count * 3);
const ambient = new Float32Array(count * 3);
const air = new Uint8Array(count);

const LAMP_RGB: [number, number, number] = [1, 0.74, 0.42];
const SUN_RGB: [number, number, number] = [1.08, 0.98, 0.84];

const each = (visit: (index: number, x: number, y: number, z: number) => void) => {
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const index = at(i, j, k);
        if (air[index]) visit(index, min[0] + (i + 0.5) * voxel, min[1] + (j + 0.5) * voxel, min[2] + (k + 0.5) * voxel);
      }
    }
  }
};

for (let k = 0; k < nz; k++) {
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = Math.floor((i + 0.5) * voxel / FINE);
      const cy = Math.floor((j + 0.5) * voxel / FINE);
      const cz = Math.floor((k + 0.5) * voxel / FINE);
      air[at(i, j, k)] = solid[(cx * fy + cy) * fz + cz] ? 0 : 1;
    }
  }
}

console.time('direct');
each((index, x, y, z) => {
  let visible = 0;
  // A wide sun: this is what gives the soft penumbra of a studio light.
  for (const [dx, dy, dz] of sunRays) {
    if (!march(x, y, z, dx, dy, dz, 60)) visible++;
  }
  sunVis[index] = visible / SUN_RAYS;

  for (const [lx, ly, lz] of LAMPS) {
    const distance = Math.hypot(lx - x, ly - y, lz - z);
    if (distance > 15) continue;
    let seen = 0;
    for (const [jx, jy, jz] of lampJitter) {
      const tx = lx + jx - x;
      const ty = ly + jy - y;
      const tz = lz + jz - z;
      const length = Math.hypot(tx, ty, tz);
      if (!march(x, y, z, tx / length, ty / length, tz / length, length - 0.3)) seen++;
    }
    const power = (seen / LAMP_RAYS) * (3.2 / (distance * distance + 5));
    for (let c = 0; c < 3; c++) lamp[index * 3 + c] += LAMP_RGB[c] * power;
  }
});
console.timeEnd('direct');

// Light gathered from the sphere around each voxel; later passes see the previous one on the bricks.
function gather(previous: Float32Array | null) {
  const next = new Float32Array(count * 3);
  each((index, x, y, z) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const [dx, sy, dz] of sphere) {
      const hit = march(x, y, z, dx, sy, dz, REACH);
      if (!hit) {
        const sky = skyColor(sy);
        r += sky[0];
        g += sky[1];
        b += sky[2];
      } else if (previous) {
        const near = voxelAt(lastX, lastY, lastZ);
        const albedo = palette[hit];
        // What a brick sends back: its colour times the light falling on it.
        const sun = sunVis[near] * 0.55;
        r += albedo[0] * (previous[near * 3] + lamp[near * 3] + SUN_RGB[0] * sun);
        g += albedo[1] * (previous[near * 3 + 1] + lamp[near * 3 + 1] + SUN_RGB[1] * sun);
        b += albedo[2] * (previous[near * 3 + 2] + lamp[near * 3 + 2] + SUN_RGB[2] * sun);
      }
    }
    next[index * 3] = r / SKY_RAYS;
    next[index * 3 + 1] = g / SKY_RAYS;
    next[index * 3 + 2] = b / SKY_RAYS;
  });
  return next;
}

console.time('sky');
let light = gather(null);
console.timeEnd('sky');
for (let bounce = 1; bounce <= 2; bounce++) {
  console.time(`bounce ${bounce}`);
  light = gather(light);
  console.timeEnd(`bounce ${bounce}`);
}
for (let i = 0; i < count * 3; i++) ambient[i] = light[i] + lamp[i];

/** Solid voxels copy their open neighbours, so filtering next to a wall reads real light. */
function bleed() {
  for (let pass = 0; pass < 4; pass++) {
    const filled = air.slice();
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const index = at(i, j, k);
          if (air[index]) continue;
          let total = 0;
          let sun = 0;
          let r = 0;
          let g = 0;
          let b = 0;
          for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
            const a = i + di;
            const c = j + dj;
            const e = k + dk;
            if (a < 0 || c < 0 || e < 0 || a >= nx || c >= ny || e >= nz) continue;
            const other = at(a, c, e);
            if (!air[other]) continue;
            total++;
            sun += sunVis[other];
            r += ambient[other * 3];
            g += ambient[other * 3 + 1];
            b += ambient[other * 3 + 2];
          }
          if (total) {
            sunVis[index] = sun / total;
            ambient[index * 3] = r / total;
            ambient[index * 3 + 1] = g / total;
            ambient[index * 3 + 2] = b / total;
            filled[index] = 1;
          }
        }
      }
    }
    air.set(filled);
  }
}
bleed();

/** Light has no business changing voxel to voxel: a small blur removes the stair-steps. */
function smooth(values: Float32Array, stride: number) {
  const scratch = new Float32Array(values.length);
  for (const [di, dj, dk] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const here = at(i, j, k);
          const before = at(Math.max(0, i - di), Math.max(0, j - dj), Math.max(0, k - dk));
          const after = at(Math.min(nx - 1, i + di), Math.min(ny - 1, j + dj), Math.min(nz - 1, k + dk));
          for (let c = 0; c < stride; c++) {
            scratch[here * stride + c] = values[before * stride + c] * 0.25 + values[here * stride + c] * 0.5 + values[after * stride + c] * 0.25;
          }
        }
      }
    }
    values.set(scratch);
  }
}
smooth(ambient, 3);

// sqrt keeps precision in the dark corners, where the eye needs it. 7 bits survive the
// filtering unnoticed and gzip far better than 8.
const SCALE = 1.6;
const quantize = (v: number) => Math.round(Math.min(1, v) * 127) * 2;
const texels = new Uint8Array(count * 4);
for (let i = 0; i < count; i++) {
  for (let c = 0; c < 3; c++) texels[i * 4 + c] = quantize(Math.sqrt(ambient[i * 3 + c] / SCALE));
  texels[i * 4 + 3] = quantize(sunVis[i]);
}

const packed = gzipSync(texels, { level: 9 });
writeFileSync(new URL('../public/park-light.dat', import.meta.url), packed);
console.log(`${nx}x${ny}x${nz} voxels, ${(texels.length / 1024).toFixed(0)} KB raw, ${(packed.length / 1024).toFixed(0)} KB gzipped`);
