import * as THREE from 'three';
import { Batch, loft, roundedBox } from './kit.ts';
import { COLOR } from './layout.ts';
import type { Materials } from './toy.ts';

export type Hair = 'short' | 'swept' | 'ponytail';

export interface FigureStyle {
  shirt: number;
  pants: number;
  hair?: Hair;
  helmet?: number;
  harness?: boolean;
  /** When this figure lands on the scale of the build animation. */
  delay?: number;
}

const HIP_HEIGHT = 1.62;
const TORSO_HEIGHT = 1.5;
const HEAD_RADIUS = 0.54;
/** Figures read larger than brick scale in the park's drawing. */
const SCALE = 1.18;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A point on the front of the head, so printed lines follow its curve. */
const onHead = (x: number, y: number, lift = 0.008) => new THREE.Vector3(x, y, Math.sqrt(HEAD_RADIUS ** 2 - x * x) + lift);

const printedLine = (points: [number, number][], radius: number) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y]) => onHead(x, y))), 14, radius, 6);

function headShape() {
  const curve = new THREE.SplineCurve(
    [[0, 0], [0.3, 0], [0.47, 0.06], [0.53, 0.24], [HEAD_RADIUS, 0.52], [0.53, 0.8], [0.47, 0.98], [0.3, 1.05], [0, 1.05]].map(
      ([x, y]) => new THREE.Vector2(x, y),
    ),
  );
  return new THREE.LatheGeometry(curve.getPoints(18), 40);
}

function addFace(batch: Batch, delay: number) {
  const ink = { gloss: 0.5, delay };
  for (const side of [-1, 1]) {
    const x = side * 0.19;
    const eye = onHead(x, 0.62, 0);
    const matrix = new THREE.Matrix4().compose(
      eye,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(x, eye.z), 0)),
      new THREE.Vector3(0.064, 0.098, 0.03),
    );
    batch.add(new THREE.SphereGeometry(1, 14, 10), COLOR.black, { ...ink, matrix });
    const spark = onHead(x + 0.02, 0.66, 0.026);
    batch.add(new THREE.SphereGeometry(0.021, 8, 6).translate(spark.x, spark.y, spark.z), COLOR.white, { gloss: 0, delay });
    batch.add(printedLine([[side * 0.3, 0.82], [side * 0.2, 0.87], [side * 0.1, 0.83]], 0.02), COLOR.black, ink);
  }
  batch.add(printedLine([[-0.27, 0.4], [-0.19, 0.3], [0, 0.245], [0.19, 0.3], [0.27, 0.4]], 0.026), COLOR.black, ink);
  batch.add(printedLine([[-0.3, 0.44], [-0.27, 0.4], [-0.25, 0.37]], 0.018), COLOR.black, ink);
  batch.add(printedLine([[0.3, 0.44], [0.27, 0.4], [0.25, 0.37]], 0.018), COLOR.black, ink);
}

/**
 * Moulded hair: one smooth shell over the skull with soft ridges, tucked under at the
 * hairline. `front` and `back` are the polar angles where the hair ends.
 */
function hairShell(kind: Hair) {
  const columns = 56;
  const rows = 20;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let v = 0; v <= rows; v++) {
    for (let u = 0; u < columns; u++) {
      const azimuth = (u / columns) * Math.PI * 2;
      const frontness = Math.cos(azimuth) * 0.5 + 0.5;
      let edge = 2.3 - 1.42 * smooth(0.2, 1, frontness);
      if (kind === 'swept') edge += 0.2 * Math.sin(azimuth + 0.6) * frontness;
      if (kind === 'ponytail') edge += 0.1 * Math.cos(azimuth * 2) * frontness;
      const polar = (v / rows) * edge;
      const t = v / rows;

      let ridges = 0.03 * Math.sin(azimuth * 5 + polar * 3) + 0.022 * Math.sin(azimuth * 9 - polar * 5);
      if (kind === 'swept') {
        ridges = 0.05 * Math.sin(azimuth * 4 + polar * 5.5) + 0.03 * Math.sin(azimuth * 7 - polar * 3);
        ridges += 0.13 * Math.exp(-((azimuth - 0.7) ** 2) / 0.5) * Math.sin(polar * 1.9);
      }
      if (kind === 'ponytail') ridges = 0.02 * Math.sin(azimuth * 12 + polar * 2);
      const crown = kind === 'swept' ? 0.11 : 0.07;
      const radius = 0.585 + crown * (1 - t) + ridges * (1 - t * t) - 0.1 * smooth(0.86, 1, t);

      const sinPolar = Math.sin(polar);
      positions.push(
        radius * sinPolar * Math.sin(azimuth),
        0.68 + radius * 0.94 * Math.cos(polar),
        radius * sinPolar * Math.cos(azimuth) - 0.03,
      );
    }
  }
  for (let v = 0; v < rows; v++) {
    for (let u = 0; u < columns; u++) {
      const next = (u + 1) % columns;
      const a = v * columns + u;
      const b = v * columns + next;
      const c = (v + 1) * columns + u;
      const d = (v + 1) * columns + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ponytail() {
  const curve = new THREE.CatmullRomCurve3(
    [[0, 0.86, -0.52], [0.08, 0.95, -0.82], [0.14, 0.62, -0.98], [0.14, 0.16, -0.94], [0.1, -0.24, -0.82]].map(
      ([x, y, z]) => new THREE.Vector3(x, y, z),
    ),
  );
  const segments = 26;
  const sides = 14;
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const centre = curve.getPointAt(t);
    const radius = 0.15 + 0.13 * Math.sin(Math.min(1, t * 1.25) * Math.PI) - 0.14 * t ** 3;
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const point = centre
        .clone()
        .addScaledVector(frames.normals[i], Math.cos(a) * radius)
        .addScaledVector(frames.binormals[i], Math.sin(a) * radius);
      positions.push(point.x, point.y, point.z);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const next = (j + 1) % sides;
      indices.push(i * sides + j, (i + 1) * sides + j, i * sides + next, i * sides + next, (i + 1) * sides + j, (i + 1) * sides + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function helmetShape() {
  const curve = new THREE.SplineCurve(
    [[0.72, 0.5], [0.71, 0.56], [0.67, 0.78], [0.54, 1.05], [0.3, 1.24], [0, 1.3]].map(([x, y]) => new THREE.Vector2(x, y)),
  );
  return new THREE.LatheGeometry(curve.getPoints(14), 40);
}

function torsoShape() {
  return loft(
    [
      { y: 0, rx: 0.001, rz: 0.001, power: 6 },
      { y: 0, rx: 0.92, rz: 0.43, power: 6 },
      { y: 0.04, rx: 0.97, rz: 0.47, power: 6 },
      { y: 0.8, rx: 0.87, rz: 0.47, power: 6 },
      { y: 1.36, rx: 0.74, rz: 0.45, power: 6 },
      { y: 1.47, rx: 0.64, rz: 0.4, power: 6 },
      { y: 1.5, rx: 0.34, rz: 0.26 },
      { y: 1.5, rx: 0.001, rz: 0.001 },
    ],
    36,
  );
}

/** Shoulder to wrist with the slight forward bend of the real part. */
function armShape() {
  const ring = (y: number, r: number, z = 0) => ({ y, rx: r, rz: r, z });
  return loft(
    [
      ring(0.2, 0.001),
      ring(0.19, 0.16),
      ring(0.12, 0.25),
      ring(0.02, 0.285),
      ring(-0.3, 0.27, 0.01),
      ring(-0.7, 0.24, 0.07),
      ring(-1.02, 0.215, 0.16),
      ring(-1.1, 0.19, 0.19),
      ring(-1.12, 0.12, 0.2),
      ring(-1.12, 0.001, 0.2),
    ],
    22,
  );
}

function addHand(batch: Batch, delay: number) {
  batch.add(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 14).translate(0, -1.2, 0.22), COLOR.skin, { delay });
  const clip = new THREE.TorusGeometry(0.2, 0.092, 12, 24, Math.PI * 1.5);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(0, -1.46, 0.27),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, Math.PI / 2, 0, 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
  batch.add(clip, COLOR.skin, { matrix, delay });
}

/**
 * Jointed figure with its origin between the feet, facing +Z. Limbs hang from their
 * joints, so a negative rotation.x swings a limb forward.
 */
export class Figure {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armLeft = new THREE.Group();
  readonly armRight = new THREE.Group();
  readonly legLeft = new THREE.Group();
  readonly legRight = new THREE.Group();

  constructor({ shirt, pants, hair = 'short', helmet, harness = false, delay = 0.86 }: FigureStyle, materials: Materials) {
    this.body.position.y = HIP_HEIGHT;
    this.root.scale.setScalar(SCALE);
    this.root.add(this.body);

    const trunk = new Batch();
    trunk.add(roundedBox(1.52, 0.42, 0.88, 0.1), pants, { matrix: new THREE.Matrix4().makeTranslation(0, 0.02, 0), delay });
    trunk.add(torsoShape(), shirt, { matrix: new THREE.Matrix4().makeTranslation(0, 0.2, 0), delay });
    if (harness) {
      for (const side of [-1, 1]) {
        const strap = new THREE.Matrix4().compose(
          new THREE.Vector3(side * 0.37, 0.95, 0.47),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.03, 0, -side * 0.13)),
          new THREE.Vector3(1, 1, 1),
        );
        trunk.add(roundedBox(0.17, 1.42, 0.05, 0.02), COLOR.brown, { gloss: 0.4, matrix: strap, delay });
      }
      trunk.add(roundedBox(1.9, 0.18, 1, 0.05), COLOR.brown, { gloss: 0.4, matrix: new THREE.Matrix4().makeTranslation(0, 0.36, 0), delay });
      trunk.add(roundedBox(0.3, 0.26, 1.05, 0.05), 0xc9ced6, { matrix: new THREE.Matrix4().makeTranslation(0, 0.36, 0), delay });
    }
    this.body.add(trunk.mesh(materials.mesh));

    for (const [leg, x] of [[this.legLeft, 0.385], [this.legRight, -0.385]] as const) {
      leg.position.set(x, -0.08, 0);
      const parts = new Batch();
      parts.add(roundedBox(0.74, 1.26, 0.86, 0.14), pants, { matrix: new THREE.Matrix4().makeTranslation(0, -0.56, 0), delay });
      parts.add(roundedBox(0.74, 0.36, 1.14, 0.13), pants, { matrix: new THREE.Matrix4().makeTranslation(0, -1.27, 0.12), delay });
      leg.add(parts.mesh(materials.mesh));
      this.body.add(leg);
    }

    for (const [arm, side] of [[this.armLeft, 1], [this.armRight, -1]] as const) {
      arm.position.set(side * 0.9, 0.2 + TORSO_HEIGHT - 0.3, 0);
      arm.rotation.z = side * 0.12;
      const parts = new Batch();
      parts.add(armShape(), shirt, { delay });
      addHand(parts, delay);
      arm.add(parts.mesh(materials.mesh));
      this.body.add(arm);
    }

    this.head.position.y = 0.2 + TORSO_HEIGHT + 0.07;
    const skull = new Batch();
    skull.add(headShape(), COLOR.skin, { delay });
    skull.add(new THREE.CylinderGeometry(0.3, 0.36, 0.16, 24).translate(0, -0.03, 0), COLOR.skin, { delay });
    addFace(skull, delay);
    if (helmet !== undefined) {
      skull.add(helmetShape(), helmet, { delay });
      const brim = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.56, 0.52), new THREE.Quaternion(), new THREE.Vector3(1.05, 0.12, 0.8));
      skull.add(new THREE.SphereGeometry(0.42, 24, 12), helmet, { matrix: brim, delay });
      skull.add(new THREE.TorusGeometry(0.72, 0.03, 8, 40).rotateX(Math.PI / 2).translate(0, 0.5, 0), 0x1b1b22, { delay, gloss: 0.4 });
    } else {
      skull.add(hairShell(hair), COLOR.hair, { gloss: 0.7, delay });
      if (hair === 'ponytail') {
        skull.add(ponytail(), COLOR.hair, { gloss: 0.7, delay });
        skull.add(new THREE.TorusGeometry(0.15, 0.05, 8, 20).rotateX(1.1).translate(0.03, 0.9, -0.62), COLOR.red, { delay });
      }
    }
    this.head.add(skull.mesh(materials.mesh));
    this.body.add(this.head);
  }

  /** Sits on a seat at the origin: thighs forward, hips at seat height. */
  sit() {
    this.body.position.y = 0.34;
    this.legLeft.rotation.x = -Math.PI / 2;
    this.legRight.rotation.x = -Math.PI / 2;
  }
}
