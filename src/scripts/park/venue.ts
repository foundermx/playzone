import * as THREE from 'three';
import { Figure } from './figure.ts';
import { Batch, ballField, barBetween, roundedBox, turned } from './kit.ts';
import { COLOR, GROUND_Y, HALL, PADDING, seededRandom } from './layout.ts';
import type { Materials } from './toy.ts';

/*
 * The hall around the park, after the real one: white walls with a red band, a blue ceiling of
 * round lights, red and white striped columns, the soft play frame with its galaxy tube slide,
 * and orange café tables. Everything stays clear of what the tour cameras look at: the play
 * frame and the tables only show in the overview, and the ball pit and reception sit on the
 * stretch of floor that only the far-back overview of tall screens takes in.
 */

const Y = GROUND_Y;
/** The building is there before the park rains in. */
const STANDING = -1;
const BRAND = [COLOR.blueBright, COLOR.yellow, COLOR.red, COLOR.greenBright];
/** The neon-bright pipes of the play frame. */
const PIPES = [0xff3d9a, 0x39d353, 0x2f7be3];

const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const placed = (x: number, y: number, z: number, turn: number) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(1, 1, 1));
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const stud = (radius: number) => turned([[radius, 0], [radius, radius * 0.63]], radius * 0.13, 24);

const FRAME = { x0: -27, x1: -11, z0: 2, z1: 24, levels: [Y + 5.5, Y + 11], top: Y + 16.5 };
const SLIDE = { x: -7, z: 19.5, radius: 2.3 };
const COLUMNS: [number, number][] = [[-12, -13], [34, -13]];
const TABLES: [number, number][] = [[36, 5.5], [44.5, 12], [36, 18.5], [51.5, 2.5]];
const BALL_PIT = { x: 40, z: 58, r: 4.6 };
const DESK = { x: 25, z: 79 };

function walls(batch: Batch) {
  const { x0, x1, z0, front, ceiling } = HALL;
  const height = ceiling - Y;
  const depth = front - z0;
  const paint = { gloss: 0.12, delay: STANDING };
  batch.add(new THREE.BoxGeometry(x1 - x0 + 2, height, 1), COLOR.wall, { ...paint, matrix: at((x0 + x1) / 2, Y + height / 2, z0 - 0.5) });
  for (const x of [x0 - 0.5, x1 + 0.5]) {
    batch.add(new THREE.BoxGeometry(1, height, depth), COLOR.wall, { ...paint, matrix: at(x, Y + height / 2, z0 + depth / 2) });
  }

  // Soft padding round the foot of the walls, under the red band the real hall has.
  const pad = roundedBox(5.8, 6.4, 1.2, 0.45, 3);
  const soft = { gloss: 0.45, delay: STANDING };
  for (let k = 0; x0 + 6 * k < x1; k++) batch.add(pad, PADDING[k % 4], { ...soft, matrix: at(x0 + 3 + 6 * k, Y + 3.2, z0 + 0.6) });
  for (let k = 0; z0 + 6 * k < 150; k++) {
    batch.add(pad, PADDING[(k + 1) % 4], { ...soft, matrix: placed(x0 + 0.6, Y + 3.2, z0 + 3 + 6 * k, Math.PI / 2) });
    batch.add(pad, PADDING[(k + 3) % 4], { ...soft, matrix: placed(x1 - 0.6, Y + 3.2, z0 + 3 + 6 * k, Math.PI / 2) });
  }
  const band = { gloss: 0.5, delay: STANDING };
  batch.add(roundedBox(x1 - x0, 2, 0.6, 0.15), COLOR.red, { ...band, matrix: at((x0 + x1) / 2, Y + 7.4, z0 + 0.3) });
  for (const x of [x0 + 0.3, x1 - 0.3]) batch.add(roundedBox(0.6, 2, 176, 0.15), COLOR.red, { ...band, matrix: at(x, Y + 7.4, z0 + 88) });
}

/** Blue ceiling with deep beams and round lights, as in the photos; it only shows from below. */
function ceiling(batch: Batch, materials: Materials) {
  const { x0, x1, z0, ceiling, lightPitch, lightRadius } = HALL;
  const depth = 260;
  const roof = new THREE.PlaneGeometry(x1 - x0, depth).rotateX(Math.PI / 2);
  batch.add(roof, COLOR.ceiling, { gloss: 0, delay: STANDING, matrix: at((x0 + x1) / 2, ceiling, z0 + depth / 2) });
  // Beams as their undersides only: from above (the far-back phone view) there is nothing to see.
  for (let x = x0 + 20; x < x1; x += 30) {
    const beam = new THREE.PlaneGeometry(2.2, depth).rotateX(Math.PI / 2);
    batch.add(beam, COLOR.beam, { gloss: 0, delay: STANDING, matrix: at(x, ceiling - 0.04, z0 + depth / 2) });
  }

  const discs: number[] = [];
  for (let x = Math.ceil(x0 / lightPitch) * lightPitch; x < x1; x += lightPitch) {
    for (let z = Math.ceil(z0 / lightPitch) * lightPitch; z < 220; z += lightPitch) {
      const disc = new THREE.CircleGeometry(lightRadius, 16).rotateX(Math.PI / 2).translate(x, ceiling - 0.05, z).toNonIndexed();
      discs.push(...disc.getAttribute('position').array);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(discs, 3));
  const lights = new THREE.Mesh(geometry, materials.lamp);
  lights.frustumCulled = false;
  return lights;
}

/** Square columns from floor to ceiling, banded red and white like the real ones. */
function columns(batch: Batch) {
  const band = roundedBox(3.2, 2.4, 3.2, 0.14);
  for (const [x, z] of COLUMNS) {
    for (let i = 0; Y + i * 2.4 < HALL.ceiling; i++) {
      batch.add(band, i % 2 ? COLOR.white : COLOR.red, { matrix: at(x, Y + 1.2 + i * 2.4, z), delay: STANDING, gloss: 0.8 });
    }
  }
}

/** A 2x4 brick blown up to `size`, fixed to a wall with its studs up (or `tilt`ed), as on the shop's front. */
function wallBrick(batch: Batch, x: number, y: number, z: number, turn: number, color: number, size: number, tilt = 0) {
  const base = placed(x, y, z, turn).multiply(new THREE.Matrix4().makeRotationZ(tilt));
  batch.add(roundedBox(4 * size, 1.2 * size, 2 * size, 0.1 * size), color, { matrix: base, delay: STANDING });
  const top = stud(0.38 * size);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      const matrix = base.clone().multiply(at((i - 1.5) * size, 0.6 * size, (j - 0.5) * size));
      batch.add(top, color, { matrix, delay: STANDING });
    }
  }
}

function wallBricks(batch: Batch) {
  const { x0, z0 } = HALL;
  const s = 2.6;
  const back = z0 + s;
  wallBrick(batch, 40, Y + 11, back, 0, COLOR.yellow, s);
  wallBrick(batch, 45, Y + 11 + 1.2 * s, back, 0, COLOR.blueBright, s);
  wallBrick(batch, 54, Y + 12, back, 0, COLOR.greenBright, s);
  // Higher up, scattered as if flying in, for the views that take in the whole wall.
  const flying: [number, number, number, number][] = [
    [-24, 28, COLOR.blueBright, 0.25], [-27, 44, COLOR.greenBright, 0.15], [26, 46, COLOR.blueBright, -0.1],
    [44, 36, COLOR.greenBright, 0.35], [60, 28, COLOR.yellow, 0.2], [74, 40, COLOR.red, -0.25],
  ];
  for (const [x, y, color, tilt] of flying) wallBrick(batch, x, Y + y, back, 0, color, s, tilt);
  const left = x0 + s;
  wallBrick(batch, left, Y + 24, 26, Math.PI / 2, COLOR.red, s, 0.3);
  wallBrick(batch, left, Y + 34, 4, Math.PI / 2, COLOR.blueBright, s, -0.2);
  wallBrick(batch, left, Y + 12, 60, Math.PI / 2, COLOR.yellow, s);
}

/** The park's name painted big on the back wall, a letter per brand colour, as on its walls. */
async function sign() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 320;
  const context = canvas.getContext('2d')!;
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'system-ui, sans-serif';
  const word = `900 196px ${family}`;
  const line = `800 54px ${family}`;
  await Promise.all([document.fonts.load(word, 'playzone'), document.fonts.load(line, 'El parque')]).catch(() => {});
  const letters = [...'playzone'];
  const colours = ['#e8473f', '#f7c52b', '#3cae4c', '#2f7be3'];
  context.font = word;
  context.textBaseline = 'alphabetic';
  context.lineJoin = 'round';
  const widths = letters.map((letter) => context.measureText(letter).width);
  let x = (canvas.width - widths.reduce((a, b) => a + b, 0)) / 2;
  letters.forEach((letter, i) => {
    context.lineWidth = 30;
    context.strokeStyle = '#0c2a6e';
    context.strokeText(letter, x, 200);
    context.fillStyle = colours[i % colours.length];
    context.fillText(letter, x, 200);
    x += widths[i];
  });
  context.font = line;
  context.textAlign = 'center';
  context.fillStyle = '#0c2a6e';
  context.fillText('el parque para todos', canvas.width / 2, 290);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // High on the back wall, over the park: whole from the door and from far back, and above the
  // frame of the wide overview instead of half hidden behind the park's rim.
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(22, 6.9), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  mesh.position.set(9, Y + 30.5, HALL.z0 + 0.06);
  return mesh;
}

/**
 * The soft play frame: neon pipes in three colours, two decks, netting, galaxy panels, the
 * rainbow climbing tube, and the enclosed spiral slide painted like space. Returns the slide's
 * path, for the child who comes shooting out of it.
 */
function playFrame(batch: Batch, delay: number) {
  const { x0, x1, z0, z1, levels, top } = FRAME;
  const xs = [x0, (x0 * 2 + x1) / 3, (x0 + x1 * 2) / 3, x1];
  const zs = [z0, (z0 * 2 + z1) / 3, (z0 + z1 * 2) / 3, z1];
  const pipe = (a: THREE.Vector3, b: THREE.Vector3, color: number, radius = 0.2) => batch.add(barBetween(a, b, radius, 10), color, { delay, gloss: 0.9 });

  xs.forEach((x, i) => zs.forEach((z, j) => pipe(v(x, Y, z), v(x, top, z), PIPES[(i + j) % 3], 0.24)));
  [...levels, top].forEach((y, level) => {
    const color = PIPES[(level + 1) % 3];
    for (const z of zs) pipe(v(x0, y, z), v(x1, y, z), color);
    for (const x of xs) pipe(v(x, y, z0), v(x, y, z1), color);
  });

  // Decks: dark blue below, red above, leaving gaps to climb through.
  const cellX = (x1 - x0) / 3;
  const cellZ = (z1 - z0) / 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const cx = x0 + cellX * (i + 0.5);
      const cz = z0 + cellZ * (j + 0.5);
      if ((i + j) % 3 !== 1) batch.add(roundedBox(cellX - 0.4, 0.4, cellZ - 0.4, 0.12), 0x1b3a8a, { matrix: at(cx, levels[0] - 0.2, cz), delay });
      if ((i + 2 * j) % 4 !== 0) batch.add(roundedBox(cellX - 0.4, 0.4, cellZ - 0.4, 0.12), 0xd12c3a, { matrix: at(cx, levels[1] - 0.2, cz), delay });
    }
  }

  // Black netting on the sides against the walls.
  const cord = (a: THREE.Vector3, b: THREE.Vector3) => batch.add(barBetween(a, b, 0.03, 4), 0x1d2027, { delay, gloss: 0 });
  for (let x = x0 + 0.7; x < x1; x += 0.7) cord(v(x, Y, z0), v(x, top, z0));
  for (let z = z0 + 0.7; z < z1; z += 0.7) cord(v(x0, Y, z), v(x0, top, z));
  for (let y = Y + 0.7; y < top; y += 0.7) {
    cord(v(x0, y, z0), v(x1, y, z0));
    cord(v(x0, y, z0), v(x0, y, z1));
  }

  // Space panels on the front, with a pale moon on each.
  for (const [i, y] of [[1, levels[0]], [0, levels[1]]] as const) {
    const cx = x0 + cellX * (i + 0.5);
    batch.add(roundedBox(cellX - 0.5, 5, 0.3, 0.1), 0x16204d, { matrix: at(cx, y + 2.6, z1 + 0.1), delay, gloss: 0.6 });
    batch.add(new THREE.CylinderGeometry(1.2, 1.2, 0.12, 32).rotateX(Math.PI / 2), 0xdfe6f3, { matrix: at(cx + 0.8, y + 3, z1 + 0.3), delay });
  }

  // The rainbow climbing tube at the front corner.
  const tube = { x: x0 + cellX * 0.5, z: z1 + 1.8 };
  const rainbow = [COLOR.red, COLOR.orange, COLOR.yellow, 0x39d353, COLOR.blueBright, 0x9b5bd6, 0xff3d9a];
  rainbow.forEach((color, i) => {
    batch.add(new THREE.TorusGeometry(1.7, 0.14, 8, 32).rotateX(Math.PI / 2), color, { matrix: at(tube.x, Y + 1 + i * 1.5, tube.z), delay, gloss: 0.9 });
  });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const [dx, dz] = [Math.cos(a) * 1.7, Math.sin(a) * 1.7];
    pipe(v(tube.x + dx, Y, tube.z + dz), v(tube.x + dx, Y + 10.3, tube.z + dz), rainbow[k], 0.1);
  }

  // Enclosed spiral slide from the upper deck down to the floor, out towards the visitor.
  const { x, z, radius } = SLIDE;
  const points: THREE.Vector3[] = [v(x1 - 0.5, levels[1] + 0.9, z)];
  const turns = 1.6;
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const angle = Math.PI + t * turns * Math.PI * 2;
    points.push(v(x + Math.cos(angle) * radius, levels[1] + 0.6 - t * (levels[1] - Y - 1.6), z + Math.sin(angle) * radius));
  }
  const last = points.at(-1)!;
  const out = v(Math.cos(Math.PI + turns * Math.PI * 2 + Math.PI / 2), 0, Math.sin(Math.PI + turns * Math.PI * 2 + Math.PI / 2));
  points.push(last.clone().addScaledVector(out, 2).setY(Y + 1.1), last.clone().addScaledVector(out, 3.6).setY(Y + 0.95));
  const path = new THREE.CatmullRomCurve3(points);
  batch.add(new THREE.TubeGeometry(path, 160, 1.15, 18, false), 0x241b52, { delay, gloss: 1 });
  // Stars and a nebula glow printed on the tube.
  const random = seededRandom(41);
  for (let i = 0; i < 90; i++) {
    const t = 0.04 + random() * 0.88;
    const centre = path.getPointAt(t);
    const tangent = path.getTangentAt(t);
    const side = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).projectOnPlane(tangent).normalize();
    const point = centre.addScaledVector(side, 1.17);
    const big = random() < 0.15;
    batch.add(new THREE.SphereGeometry(big ? 0.11 : 0.06, 6, 4).translate(point.x, point.y, point.z), big ? 0xffd27a : COLOR.white, { delay, gloss: 0 });
  }
  // The landing pad where it ends.
  batch.add(roundedBox(3, 0.5, 3.4, 0.2), 0x39d353, { matrix: placed(last.x + out.x * 3, Y + 0.25, last.z + out.z * 3, Math.atan2(out.x, out.z)), delay });
  return path;
}

/** Orange café table for four, with the black chairs and red seats of the real ones. */
function cafeTable(batch: Batch, x: number, z: number, delay: number) {
  const top = Y + 3.2;
  const metal = { delay, gloss: 0.6 };
  batch.add(roundedBox(1.6, 0.2, 1.6, 0.06), COLOR.black, { ...metal, matrix: at(x, Y + 0.1, z) });
  batch.add(turned([[0.22, 0], [0.22, top - Y - 0.3]], 0.03, 12), COLOR.black, { ...metal, matrix: at(x, Y, z) });
  batch.add(roundedBox(4.2, 0.32, 4.2, 0.1), COLOR.table, { matrix: at(x, top - 0.14, z), delay });

  const seat = roundedBox(1.5, 0.34, 1.5, 0.14);
  const slat = roundedBox(1.5, 0.28, 0.16, 0.06);
  for (let k = 0; k < 4; k++) {
    const angle = (k / 4) * Math.PI * 2;
    const base = placed(x + Math.sin(angle) * 3.2, 0, z + Math.cos(angle) * 3.2, angle);
    batch.add(seat, COLOR.seat, { matrix: base.clone().multiply(at(0, Y + 2.05, 0)), delay });
    for (const [lx, lz] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) {
      batch.add(barBetween(v(lx, Y + 1.9, lz), v(lx, Y, lz), 0.07, 8), COLOR.black, { ...metal, matrix: base });
    }
    // Back: two posts and three slats, all black.
    for (const lx of [-0.62, 0.62]) batch.add(barBetween(v(lx, Y + 1.9, 0.66), v(lx, Y + 4.4, 0.72), 0.07, 8), COLOR.black, { ...metal, matrix: base });
    for (const h of [3, 3.6, 4.2]) batch.add(slat, COLOR.black, { ...metal, matrix: base.clone().multiply(at(0, Y + h, 0.7)) });
  }
}

/** Three balloons tied to the middle of a table; the group sways from the knot. */
function balloons(x: number, z: number, seed: number, materials: Materials) {
  const random = seededRandom(seed);
  const parts = new Batch();
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + random();
    const tip = v(Math.cos(angle) * 0.75, 6 + random() * 1.4, Math.sin(angle) * 0.75);
    const color = BRAND[(i + seed) % 4];
    parts.add(barBetween(v(0, 0, 0), tip, 0.025, 4), COLOR.white, { gloss: 0, delay: 0.9 });
    const shape = new THREE.Matrix4().compose(tip.clone().add(v(0, 0.95, 0)), new THREE.Quaternion(), v(0.82, 1, 0.82));
    parts.add(new THREE.SphereGeometry(1, 24, 16), color, { matrix: shape, delay: 0.9 });
    parts.add(new THREE.ConeGeometry(0.16, 0.24, 10).translate(tip.x, tip.y + 0.04, tip.z), color, { delay: 0.9 });
  }
  const group = new THREE.Group();
  group.position.set(x, Y + 3.25, z);
  group.add(parts.mesh(materials.mesh));
  return group;
}

function ballPit(materials: Materials) {
  const { x, z, r } = BALL_PIT;
  const batch = new Batch();
  batch.add(turned([[r, 0], [r, 0.45]], 0.1, 48), COLOR.blueBright, { matrix: at(x, Y, z), delay: 0.7 });
  batch.add(new THREE.TorusGeometry(r, 0.7, 14, 64).rotateX(Math.PI / 2), COLOR.yellow, { matrix: at(x, Y + 1.05, z), delay: 0.7 });
  const random = seededRandom(31);
  const colours = [COLOR.red, COLOR.yellow, COLOR.blueBright, COLOR.greenBright, COLOR.orange];
  const spots: [number, number, number, number][] = [];
  for (let layer = 0; layer < 2; layer++) {
    for (let attempt = 0; attempt < 400 && spots.length < 34 * (layer + 1); attempt++) {
      const angle = random() * Math.PI * 2;
      const reach = Math.sqrt(random()) * (r - 0.9);
      const bx = x + Math.cos(angle) * reach;
      const bz = z + Math.sin(angle) * reach;
      const y = Y + 0.95 + layer * 0.62 + random() * 0.1;
      if (spots.some(([sx, sy, sz]) => Math.abs(sy - y) < 0.4 && Math.hypot(sx - bx, sz - bz) < 1.02)) continue;
      spots.push([bx, y, bz, colours[Math.floor(random() * colours.length)]]);
    }
  }
  return [batch.mesh(materials.mesh), ballField(spots, materials, 0, 0.72)];
}

function desk(batch: Batch, delay: number) {
  const { x, z } = DESK;
  const body = { delay, gloss: 0.7 };
  batch.add(roundedBox(7, 3.4, 1.6, 0.2), COLOR.blue, { ...body, matrix: at(x, Y + 1.7, z) });
  batch.add(roundedBox(7.6, 0.3, 2.2, 0.1), COLOR.white, { ...body, matrix: at(x, Y + 3.55, z) });
  for (const side of [-1, 1]) {
    const wing = placed(x + side * 4.6, Y + 1.7, z - 1, side * 0.6);
    batch.add(roundedBox(3, 3.4, 1.6, 0.2), COLOR.blue, { ...body, matrix: wing });
    batch.add(roundedBox(3.4, 0.3, 2.2, 0.1), COLOR.white, { ...body, matrix: wing.clone().multiply(at(0, 1.85, 0)) });
  }
  // A row of bricks along the front, like the facade.
  BRAND.forEach((color, i) => batch.add(roundedBox(1.4, 0.9, 0.24, 0.08), color, { ...body, matrix: at(x - 2.4 + i * 1.6, Y + 2, z + 0.85) }));
}

export async function buildVenue(materials: Materials) {
  const fixed = new Batch();
  walls(fixed);
  wallBricks(fixed);
  columns(fixed);
  const lights = ceiling(fixed, materials);
  const props = new Batch();
  const slide = playFrame(props, 0.62);
  TABLES.forEach(([x, z], i) => cafeTable(props, x, z, 0.66 + i * 0.03));
  desk(props, 0.7);

  const root = new THREE.Group();
  root.add(fixed.mesh(materials.mesh), props.mesh(materials.mesh), lights, ...ballPit(materials), await sign());
  const bunches = TABLES.map(([x, z], i) => balloons(x, z, i + 3, materials));
  root.add(...bunches);

  // Comes shooting out of the galaxy slide, again and again.
  const slider = new Figure({ shirt: 0x39d353, pants: 0x6b3fa0, hair: 'short', print: { kind: 'logo', color: COLOR.yellow }, delay: 0.9 }, materials);
  slider.sit();
  slider.armLeft.rotation.x = slider.armRight.rotation.x = -2.4;
  slider.armLeft.rotation.z = -0.4;
  slider.armRight.rotation.z = 0.4;
  const host = new Figure({ shirt: COLOR.navy, pants: COLOR.black, hair: 'swept', print: { kind: 'logo', color: COLOR.yellow }, delay: 0.9 }, materials);
  host.root.position.set(DESK.x, Y, DESK.z - 1.8);
  host.armRight.rotation.x = -0.5;
  root.add(slider.root, host.root);

  const ahead = new THREE.Vector3();
  function update(time: number) {
    // Hidden inside the tube for most of the ride; out the end, a short skid, a pause.
    const ride = (time % 5.5) / 3.2;
    const along = Math.min(ride, 1);
    slider.root.visible = ride > 0.78 && ride < 1.55;
    slider.root.position.copy(slide.getPointAt(along)).y -= 0.95;
    slide.getTangentAt(along, ahead);
    slider.root.rotation.y = Math.atan2(ahead.x, ahead.z);
    slider.root.position.y = Math.max(slider.root.position.y, Y + 0.4);

    host.armLeft.rotation.x = -2.6;
    host.armLeft.rotation.z = -0.35 + Math.sin(time * 5) * 0.3;
    bunches.forEach((bunch, i) => {
      bunch.rotation.x = Math.sin(time * 0.9 + i) * 0.06;
      bunch.rotation.z = Math.cos(time * 0.7 + i * 2) * 0.06;
    });
  }

  return {
    root,
    update,
    shadowed: [{ object: host.root, size: 3.6, ground: Y + 0.02 }],
  };
}
