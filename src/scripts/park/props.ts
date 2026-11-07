import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, barBetween, loft, roundedBox, type Ring } from './kit.ts';
import { COLOR, FIELD, POOL, TOWER, seededRandom, type Plank } from './layout.ts';
import type { Materials } from './toy.ts';

const vector = ([x, y, z]: [number, number, number]) => new THREE.Vector3(x, y, z);

export function addPlate(batch: Batch) {
  // Stops short of the outline: the skirt of bricks around it is what you see from outside.
  const inset = [[-1, -1], [28, -1], [28, 20.8], [20.3, 27.5], [-1, 27.5]];
  const shape = new THREE.Shape(inset.map(([x, z]) => new THREE.Vector2(x, z)));
  shape.holes.push(
    new THREE.Path(
      [[POOL.x0, POOL.z0], [POOL.x0, POOL.z1], [POOL.x1, POOL.z1], [POOL.x1, POOL.z0]].map(([x, z]) => new THREE.Vector2(x, z)),
    ),
  );
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1.18, bevelEnabled: false });
  geometry.rotateX(Math.PI / 2);
  batch.add(geometry.translate(0, -0.02, 0), COLOR.blue, { delay: 0 });
}

/** Yellow rail along a span of planks, with a rope and clamp at each plank. */
export function addBridge(batch: Batch, planks: Plank[]) {
  const points = planks.map((plank) => vector(plank.anchor));
  const first = points[0].clone().multiplyScalar(1.5).addScaledVector(points[1], -0.5);
  const last = points.at(-1)!.clone().multiplyScalar(1.5).addScaledVector(points.at(-2)!, -0.5);
  const curve = new THREE.CatmullRomCurve3([first, ...points, last]);
  batch.add(new THREE.TubeGeometry(curve, 72, 0.2, 14), COLOR.yellow);
  const along = last.clone().sub(first).normalize();
  const clampTurn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), along);
  for (const plank of planks) {
    const anchor = vector(plank.anchor);
    batch.add(barBetween(anchor, vector(plank.foot), 0.09, 8), COLOR.yellow);
    const clamp = new THREE.TorusGeometry(0.23, 0.07, 8, 20);
    batch.add(clamp, COLOR.yellow, { matrix: new THREE.Matrix4().compose(anchor, clampTurn, new THREE.Vector3(1, 1, 1)) });
    // The knot where the rope meets the wood.
    const foot = vector(plank.foot);
    batch.add(new THREE.SphereGeometry(0.15, 10, 8).translate(foot.x, foot.y + 0.2, foot.z), COLOR.yellow);
  }
}

/** Rounded climbing hold, modelled facing +Z with its base at z = 0. */
function hold(seed: number) {
  const random = seededRandom(seed);
  const a = 1.5 + random() * 2;
  const b = random() * 6;
  let geometry: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 7);
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry);
  const position = geometry.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const lobes = 1 + 0.2 * Math.sin(v.x * a + b) * Math.cos(v.y * (a + 0.7) - b) + 0.14 * Math.sin(Math.atan2(v.y, v.x) * 3 + b);
    v.multiplyScalar(lobes);
    position.setXYZ(i, v.x * 0.62, v.y * 0.62, Math.max(v.z, -0.1) * 0.36);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function addClimbingHolds(batch: Batch) {
  const { red, blueBright: blue, yellow, greenBright: green } = COLOR;
  const holds: [number, number, number][] = [
    [3.75, 9.4, red], [2.2, 7.7, blue], [4.5, 7.5, yellow], [2.1, 5.4, green], [4.3, 5.4, green],
    [3.2, 3.9, red], [1.8, 2.6, blue], [4.2, 2.7, yellow], [3, 1.4, yellow], [4.4, 1.4, red],
    [1, 6.5, red], [1.2, 9.2, yellow],
  ];
  holds.forEach(([x, y, color], i) => {
    const place = new THREE.Vector3(TOWER.x0 + x, y, TOWER.z1 + 0.5);
    const matrix = new THREE.Matrix4().compose(place, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, i * 1.3)), new THREE.Vector3(0.95, 0.95, 0.95));
    batch.add(hold(i + 3), color, { matrix, gloss: 0.7 });
    batch.add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 14).rotateX(Math.PI / 2).translate(place.x, place.y, place.z + 0.39), 0x3a3a42, { gloss: 0.5 });
  });
}

/** Goal opening towards +Z, width on X, origin at the centre of the goal line. */
export function addGoal(batch: Batch, x: number, y: number, z: number, width: number, height: number, depth: number) {
  const half = width / 2;
  const back = height * 0.72;
  const post = (a: [number, number, number], b: [number, number, number], radius = 0.17) =>
    batch.add(barBetween(vector([a[0] + x, a[1] + y, a[2] + z]), vector([b[0] + x, b[1] + y, b[2] + z]), radius, 12), COLOR.yellow);
  post([-half, 0, 0], [-half, height, 0]);
  post([half, 0, 0], [half, height, 0]);
  post([-half, height, 0], [half, height, 0]);
  for (const side of [-half, half]) {
    post([side, height, 0], [side, back, -depth], 0.1);
    post([side, 0, 0], [side, 0, -depth], 0.1);
    post([side, back, -depth], [side, 0, -depth], 0.1);
    batch.add(new THREE.SphereGeometry(0.17, 12, 8).translate(side + x, height + y, z), COLOR.yellow);
  }
  post([-half, back, -depth], [half, back, -depth], 0.1);
  post([-half, 0, -depth], [half, 0, -depth], 0.1);

  // Net: real thin cords, crisp from any distance.
  const cord = (a: [number, number, number], b: [number, number, number]) =>
    batch.add(barBetween(vector([a[0] + x, a[1] + y, a[2] + z]), vector([b[0] + x, b[1] + y, b[2] + z]), 0.022, 4), COLOR.white, { gloss: 0 });
  const step = 0.46;
  for (let u = -half + step; u < half; u += step) {
    cord([u, 0, -depth], [u, back, -depth]);
    cord([u, back, -depth], [u, height, 0]);
  }
  for (let v = step; v < back; v += step) cord([-half, v, -depth], [half, v, -depth]);
  for (let t = 0.25; t < 1; t += 0.25) cord([-half, back + (height - back) * t, -depth * (1 - t)], [half, back + (height - back) * t, -depth * (1 - t)]);
  for (const side of [-half, half]) {
    for (let v = step; v < height; v += step) {
      const reach = v < back ? depth : depth * (height - v) / (height - back);
      cord([side, v, 0], [side, v, -reach]);
    }
  }
}

/** Lines painted on the pitch, as thin geometry so they stay sharp in close-ups. */
export function addPitchLines(batch: Batch) {
  const { x0, x1, z0, z1, top } = FIELD;
  const y = top + 0.012;
  const inset = 0.3;
  const line = 0.13;
  const paint = (cx: number, cz: number, w: number, d: number) =>
    batch.add(new THREE.BoxGeometry(w, 0.012, d).translate(cx, y, cz), COLOR.white, { gloss: 0.2, delay: 0.3 });
  const left = x0 + inset;
  const right = x1 - inset;
  const near = z1 - inset;
  const far = z0 + inset;
  const cx = (x0 + x1) / 2;
  paint(cx, near, right - left, line);
  paint(cx, far, right - left, line);
  paint(left, (near + far) / 2, line, near - far);
  paint(right, (near + far) / 2, line, near - far);
  const middle = 11.4;
  paint(cx, middle, right - left, line);
  batch.add(new THREE.RingGeometry(1.6, 1.6 + line, 56).rotateX(-Math.PI / 2).translate(cx, y + 0.006, middle), COLOR.white, { gloss: 0.2, delay: 0.3 });
  const boxDepth = 3.2;
  paint(cx, 4.6 + boxDepth, 5, line);
  paint(cx - 2.5, 4.6 + boxDepth / 2, line, boxDepth);
  paint(cx + 2.5, 4.6 + boxDepth / 2, line, boxDepth);
}

export function addMezzanineRail(batch: Batch, y: number) {
  const top = y + 1.8;
  batch.add(barBetween(new THREE.Vector3(20.7, top, 4.1), new THREE.Vector3(26.2, top, 4.1), 0.13), COLOR.yellow);
  for (let x = 21; x <= 26.1; x += 1.7) {
    batch.add(barBetween(new THREE.Vector3(x, y, 4.1), new THREE.Vector3(x, top, 4.1), 0.085, 8), COLOR.yellow);
  }
}

/** Pointed at +X, wide at the stern. */
function hullPlan(angle: number, ring: Ring): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const beam = 1 - 0.3 * Math.max(0, c) ** 2 + 0.06 * Math.max(0, -c);
  return [ring.rx * Math.sign(c) * Math.abs(c) ** 0.85, ring.rz * s * beam];
}

function paddleWheel(materials: Materials, delay: number) {
  const parts = new Batch();
  const green = COLOR.greenBright;
  parts.add(new THREE.CylinderGeometry(0.34, 0.34, 0.82, 22).rotateX(Math.PI / 2), green, { delay });
  parts.add(new THREE.CylinderGeometry(0.17, 0.17, 0.92, 16).rotateX(Math.PI / 2), COLOR.green, { delay });
  parts.add(new THREE.TorusGeometry(0.98, 0.09, 10, 44), green, { delay, matrix: new THREE.Matrix4().makeTranslation(0, 0, 0.22) });
  parts.add(new THREE.TorusGeometry(0.98, 0.09, 10, 44), green, { delay, matrix: new THREE.Matrix4().makeTranslation(0, 0, -0.22) });
  const paddle = roundedBox(0.13, 0.82, 0.58, 0.04);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(angle) * 0.62, Math.sin(angle) * 0.62, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, angle - Math.PI / 2)),
      new THREE.Vector3(1, 1, 1),
    );
    parts.add(paddle, green, { matrix, delay });
  }
  return parts.mesh(materials.mesh);
}

/** Paddle boat with its nose on +X. Spin `wheels` around their local Z axis. */
export function boat(hullColor: number, seatColor: number, materials: Materials, delay = 0.84) {
  const group = new THREE.Group();
  const L = 3;
  const B = 1.85;
  const rings: Ring[] = [
    { y: -0.55, rx: 0.001, rz: 0.001 },
    { y: -0.55, rx: L * 0.62, rz: B * 0.62 },
    { y: -0.3, rx: L * 0.86, rz: B * 0.86 },
    { y: 0.2, rx: L * 0.98, rz: B * 0.98 },
    { y: 0.62, rx: L, rz: B },
    { y: 0.74, rx: L * 0.985, rz: B * 0.985 },
    { y: 0.76, rx: L * 0.93, rz: B * 0.91 },
    { y: 0.68, rx: L * 0.88, rz: B * 0.84 },
    { y: 0.14, rx: L * 0.8, rz: B * 0.76 },
    { y: 0.12, rx: 0.001, rz: 0.001 },
  ];
  const parts = new Batch();
  parts.add(loft(rings, 64, hullPlan), hullColor, { delay });

  const at = (x: number, y: number, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z);
  parts.add(roundedBox(1, 0.4, 2.2, 0.14), seatColor, { matrix: at(-0.8, 0.3), delay });
  const lean = new THREE.Matrix4().compose(new THREE.Vector3(-1.42, 0.84, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.14)), new THREE.Vector3(1, 1, 1));
  parts.add(roundedBox(0.34, 1.3, 2.2, 0.14), seatColor, { matrix: lean, delay });
  // Front deck, where the steering column stands.
  parts.add(roundedBox(1.5, 0.3, 1.8, 0.14), seatColor, { matrix: at(1.5, 0.36), delay });

  const column = barBetween(new THREE.Vector3(1.2, 0.4, 0), new THREE.Vector3(0.7, 1.36, 0), 0.08, 10);
  parts.add(column, COLOR.black, { gloss: 0.6, delay });
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.5));
  const wheelAt = new THREE.Vector3(0.66, 1.42, 0);
  parts.add(new THREE.TorusGeometry(0.5, 0.075, 10, 36).rotateY(Math.PI / 2), COLOR.black, {
    gloss: 0.6,
    delay,
    matrix: new THREE.Matrix4().compose(wheelAt, tilt, new THREE.Vector3(1, 1, 1)),
  });
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8).translate(0, 0.25, 0).rotateX((i / 3) * Math.PI * 2);
    parts.add(spoke, COLOR.black, { gloss: 0.6, delay, matrix: new THREE.Matrix4().compose(wheelAt, tilt, new THREE.Vector3(1, 1, 1)) });
  }
  for (const side of [1, -1]) {
    parts.add(barBetween(new THREE.Vector3(-1.3, 0.3, side * 1.6), new THREE.Vector3(-1.3, 0.3, side * 2.3), 0.12, 10), COLOR.greenBright, { delay });
  }
  group.add(parts.mesh(materials.mesh));

  const wheels = [1, -1].map((side) => {
    const wheel = paddleWheel(materials, delay);
    wheel.position.set(-1.3, 0.3, side * 2.3);
    group.add(wheel);
    return wheel;
  });

  return { group, wheels };
}

/** The rope circuit's steps are hanging logs, as in the real hall: pale end grain, a shade apiece. */
export function addLogs(batch: Batch, planks: Plank[]) {
  for (const plank of planks) {
    const acrossX = plank.width > plank.depth;
    const length = Math.max(plank.width, plank.depth);
    const turn = (geometry: THREE.BufferGeometry) => (acrossX ? geometry.rotateZ(Math.PI / 2) : geometry.rotateX(Math.PI / 2));
    const wood = new THREE.Color(COLOR.wood).offsetHSL(0, 0, plank.shade).getHex();
    const delay = 0.7;
    batch.add(turn(new THREE.CylinderGeometry(0.34, 0.34, length, 14)).translate(plank.x, plank.y, plank.z), wood, { gloss: 0.25, delay });
    for (const end of [-1, 1]) {
      const cap = turn(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 14)).translate(
        plank.x + (acrossX ? end * (length / 2 + 0.02) : 0),
        plank.y,
        plank.z + (acrossX ? 0 : end * (length / 2 + 0.02)),
      );
      batch.add(cap, 0xdcae74, { gloss: 0.1, delay });
    }
  }
}

/** Padded tube railing in the venue's colours along the open side of the pool. */
export function addPoolRail(batch: Batch) {
  const z = POOL.z1 + 0.9;
  const colours = [0xff3d9a, 0x39d353, 0x2f7be3, COLOR.red];
  const posts = [1.6, 5.8, 10, 14.2];
  const delay = 0.8;
  // Low enough that the boat stop still sees the boats over it.
  const top = 1.9;
  for (const x of posts) batch.add(barBetween(vector([x, 0, z]), vector([x, top, z]), 0.18, 10), COLOR.red, { delay });
  for (let i = 0; i < posts.length - 1; i++) {
    for (const [h, shift] of [[top, 0], [0.95, 2]] as const) {
      batch.add(barBetween(vector([posts[i], h, z]), vector([posts[i + 1], h, z]), 0.23, 12), colours[(i + shift) % colours.length], { delay });
    }
  }
  for (const x of posts) batch.add(new THREE.SphereGeometry(0.25, 12, 8).translate(x, top, z), COLOR.red, { delay });
}

/** The bright green railing of the real pitch, along its two open sides. */
export function addPitchFence(batch: Batch) {
  const green = 0x39d353;
  const { x0, x1, z1, top } = FIELD;
  const delay = 0.8;
  const front = z1 + 0.5;
  const side = x1 + 0.5;
  const rail = (a: [number, number], b: [number, number]) => {
    for (const h of [1.3, 2.6]) batch.add(barBetween(vector([a[0], top + h, a[1]]), vector([b[0], top + h, b[1]]), 0.1, 8), green, { delay, gloss: 0.8 });
  };
  const post = (x: number, z: number) => batch.add(barBetween(vector([x, top, z]), vector([x, top + 2.7, z]), 0.13, 8), green, { delay, gloss: 0.8 });
  for (let x = x0 + 0.3; x <= side + 0.01; x += (side - x0 - 0.3) / 3) post(x, front);
  for (let z = 2.8; z < front; z += (front - 2.8) / 5) post(side, z);
  rail([x0 + 0.3, front], [side, front]);
  rail([side, 2.8], [side, front]);
}
