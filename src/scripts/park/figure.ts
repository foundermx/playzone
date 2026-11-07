import * as THREE from 'three';
import { Batch, barBetween, loft, roundedBox, turned, type Ring } from './kit.ts';
import { COLOR } from './layout.ts';
import type { Materials } from './toy.ts';

export type Hair = 'short' | 'swept' | 'ponytail';

/** Printed on the front of the torso: the park's brick logo, or a band all the way round. */
export type Print = { kind: 'logo' | 'stripe'; color: number };

export interface FigureStyle {
  shirt: number;
  pants: number;
  hair?: Hair;
  helmet?: number;
  harness?: boolean;
  print?: Print;
  /** When this figure lands on the scale of the build animation. */
  delay?: number;
}

/*
 * Proportions of the real toy, in units of its torso: legs and hips about as tall as the torso,
 * hips and legs exactly as wide as its base, a straight-sided head about two thirds that wide.
 * Body origin is the leg pivot; the torso stands on the hip piece, the head on a short neck.
 */
const HIP_HEIGHT = 1.62;
const HIP_TOP = 0.32;
const TORSO_HEIGHT = 1.52;
const HEAD_BASE = HIP_TOP + TORSO_HEIGHT + 0.1;
const HEAD_RADIUS = 0.6;
const HEAD_HEIGHT = 1.04;
const SHOULDER: [number, number] = [0.95, 1.56];
/** Figures read larger than brick scale in the park's drawing. */
const SCALE = 1.1;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const darker = (color: number, amount = 0.72) => new THREE.Color(color).multiplyScalar(amount).getHex();

/** A point on the front of the head, so printed lines follow its curve. */
const onHead = (x: number, y: number, lift = 0.008) => new THREE.Vector3(x, y, Math.sqrt(HEAD_RADIUS ** 2 - x * x) + lift);

const printedLine = (points: [number, number][], radius: number) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y]) => onHead(x, y))), 14, radius, 6);

function addFace(batch: Batch, delay: number) {
  const ink = { gloss: 0.5, delay };
  for (const side of [-1, 1]) {
    const x = side * 0.2;
    const eye = onHead(x, 0.6, 0);
    const matrix = new THREE.Matrix4().compose(
      eye,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(x, eye.z), 0)),
      new THREE.Vector3(0.068, 0.104, 0.03),
    );
    batch.add(new THREE.SphereGeometry(1, 14, 10), COLOR.black, { ...ink, matrix });
    const spark = onHead(x + 0.022, 0.64, 0.026);
    batch.add(new THREE.SphereGeometry(0.022, 8, 6).translate(spark.x, spark.y, spark.z), COLOR.white, { gloss: 0, delay });
    batch.add(printedLine([[side * 0.31, 0.765], [side * 0.21, 0.815], [side * 0.11, 0.78]], 0.02), COLOR.black, ink);
  }
  batch.add(printedLine([[-0.28, 0.38], [-0.2, 0.28], [0, 0.225], [0.2, 0.28], [0.28, 0.38]], 0.026), COLOR.black, ink);
  batch.add(printedLine([[-0.31, 0.42], [-0.28, 0.38], [-0.26, 0.35]], 0.018), COLOR.black, ink);
  batch.add(printedLine([[0.31, 0.42], [0.28, 0.38], [0.26, 0.35]], 0.018), COLOR.black, ink);
}

/** Where the hair stops, by direction: low at the nape, over the ears at the sides, a fringe in front. */
function hairline(kind: Hair, azimuth: number) {
  const front = Math.cos(azimuth) * 0.5 + 0.5;
  const forehead = kind === 'ponytail' ? 0.96 : 0.92;
  let y = front < 0.5
    ? 0.1 + 0.36 * smooth(0, 0.5, front)
    : 0.46 + (forehead - 0.46) * smooth(0.5, 0.92, front);
  if (kind === 'swept') y -= 0.13 * smooth(-0.3, 0.8, Math.sin(azimuth)) * smooth(0.6, 1, front);
  if (kind === 'short') y += 0.025 * Math.sin(azimuth * 11) * smooth(0.7, 1, front);
  return y;
}

/**
 * Moulded hair: a cap that follows the straight-sided head with a rounded crown, a few broad
 * sculpted locks, and a lip rolled under at the hairline.
 */
function hairShell(kind: Hair) {
  const columns = 72;
  const rows = 30;
  const side = HEAD_RADIUS + (kind === 'ponytail' ? 0.055 : 0.08);
  const top = HEAD_HEIGHT + (kind === 'swept' ? 0.2 : 0.13);
  const corner = 0.36;
  const positions: number[] = [];
  for (let v = 0; v <= rows; v++) {
    for (let u = 0; u < columns; u++) {
      const azimuth = (u / columns) * Math.PI * 2;
      const front = Math.cos(azimuth) * 0.5 + 0.5;
      const edge = hairline(kind, azimuth);
      const flat = side - corner;
      // Over the forehead the hairline can sit higher than the crown's rounding: stop short.
      const knee = top - corner;
      const arc = corner * (edge > knee ? Math.acos(Math.min(1, (edge - knee) / corner)) : Math.PI / 2);
      const drop = Math.max(knee - edge, 0);
      // The last row tucks under, back onto the head.
      const t = Math.min(v, rows - 1) / (rows - 1);
      const s = t * (flat + arc + drop);
      let r: number;
      let y: number;
      if (s < flat) {
        r = s;
        y = top;
      } else if (s < flat + arc) {
        const a = (s - flat) / corner;
        r = flat + corner * Math.sin(a);
        y = top - corner + corner * Math.cos(a);
      } else {
        r = side;
        y = top - corner - (s - flat - arc);
      }

      let locks = 0.022 * Math.sin(azimuth * 6 + t * 2.4) + 0.012 * Math.sin(azimuth * 13 - t * 3);
      if (kind === 'swept') {
        locks = 0.03 * Math.sin(azimuth * 5 - t * 5) + 0.012 * Math.sin(azimuth * 11 + t * 2);
        // A big lock swept over from one side of the parting.
        locks += 0.1 * Math.exp(-((azimuth - 0.9) ** 2) / 0.5) * Math.sin(t * Math.PI) * smooth(0.4, 1, front);
      }
      if (kind === 'ponytail') locks = 0.01 * Math.sin(azimuth * 16 + t * 2);
      const sculpt = locks * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - t * t * 0.6);
      if (v === rows) {
        r = HEAD_RADIUS + 0.003;
        y = edge + 0.035;
      } else {
        r += sculpt * Math.min(1, s / 0.3);
        y += sculpt * 0.4 * (1 - Math.min(1, s / flat));
      }
      positions.push(r * Math.sin(azimuth), y, r * Math.cos(azimuth));
    }
  }
  const shell: number[] = [];
  const lip: number[] = [];
  for (let v = 0; v < rows; v++) {
    for (let u = 0; u < columns; u++) {
      const next = (u + 1) % columns;
      const a = v * columns + u;
      const b = v * columns + next;
      const c = (v + 1) * columns + u;
      const d = (v + 1) * columns + next;
      (v === rows - 1 ? lip : shell).push(a, c, b, b, c, d);
    }
  }
  // The rolled-under lip is its own part: a sharp crease, and dark where it tucks into shadow.
  return [shell, lip].map((indices) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  });
}

/** Tube along a curve with a radius that changes along it; `squash` flattens it side to side. */
function sweep(curve: THREE.Curve<THREE.Vector3>, radius: (s: number, length: number) => number, segments: number, sides: number, squash = 1) {
  const length = curve.getLength();
  const positions: number[] = [];
  const indices: number[] = [];
  const across = new THREE.Vector3();
  const sideways = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const centre = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    across.crossVectors(tangent, sideways).normalize();
    const r = radius(t * length, length);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const point = centre.clone().addScaledVector(sideways, Math.cos(a) * r * squash).addScaledVector(across, Math.sin(a) * r);
      positions.push(point.x, point.y, point.z);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const next = (j + 1) % sides;
      indices.push(i * sides + j, i * sides + next, (i + 1) * sides + j, i * sides + next, (i + 1) * sides + next, (i + 1) * sides + j);
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
    [[0, 0.9, -0.6], [0.08, 0.98, -0.9], [0.14, 0.64, -1.04], [0.14, 0.16, -1], [0.1, -0.24, -0.86]].map(
      ([x, y, z]) => new THREE.Vector3(x, y, z),
    ),
  );
  return sweep(curve, (s, length) => {
    const t = s / length;
    return Math.max(0.001, 0.15 + 0.13 * Math.sin(Math.min(1, t * 1.25) * Math.PI) - 0.15 * t ** 3);
  }, 26, 14);
}

function helmetShape() {
  return turned([[0.77, 0.46], [0.76, 0.6], [0.73, 0.86], [0.63, 1.1], [0.4, 1.28], [0.001, 1.33]], 0.06, 40);
}

const TORSO: Ring[] = [
  { y: 0, rx: 0.001, rz: 0.001, power: 10 },
  { y: 0, rx: 0.95, rz: 0.42, power: 10 },
  { y: 0.03, rx: 0.97, rz: 0.43, power: 10 },
  { y: 1.42, rx: 0.73, rz: 0.41, power: 10 },
  { y: 1.49, rx: 0.68, rz: 0.39, power: 8 },
  { y: TORSO_HEIGHT, rx: 0.56, rz: 0.32, power: 6 },
  { y: TORSO_HEIGHT, rx: 0.001, rz: 0.001 },
];

/** Torso ring at height y, lerped between the rings around it. */
function torsoAt(y: number, grow = 0): Ring {
  const above = TORSO.findIndex((ring, i) => i > 1 && ring.y >= y);
  const a = TORSO[above - 1];
  const b = TORSO[above];
  const t = (y - a.y) / (b.y - a.y || 1);
  return { y, rx: a.rx + (b.rx - a.rx) * t + grow, rz: a.rz + (b.rz - a.rz) * t + grow, power: 10 };
}

/** Trapezoid with flat faces and crisp edges, like the moulded part. */
const torsoShape = () => loft(TORSO, 44);

function addPrint(batch: Batch, { kind, color }: Print, delay: number) {
  const at = (y: number) => new THREE.Matrix4().makeTranslation(0, HIP_TOP + y, 0);
  if (kind === 'stripe') {
    // A band printed all the way round, as on a football shirt.
    batch.add(loft([torsoAt(0.7, 0.006), torsoAt(0.96, 0.006)], 44), color, { matrix: at(0), delay, gloss: 0.9 });
    batch.add(loft([torsoAt(1.04, 0.006), torsoAt(1.1, 0.006)], 44), color, { matrix: at(0), delay, gloss: 0.9 });
    return;
  }
  // The park's own brick: a rounded block with two studs, on the left of the chest.
  const front = torsoAt(1.02).rz + 0.006;
  const brick = new THREE.Shape();
  const [w, h, r] = [0.4, 0.24, 0.05];
  brick.moveTo(-w / 2 + r, -h / 2);
  brick.lineTo(w / 2 - r, -h / 2);
  brick.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  brick.lineTo(w / 2, h / 2);
  for (const x of [w / 2 - 0.06, -w / 2 + 0.18]) {
    brick.lineTo(x, h / 2);
    brick.lineTo(x, h / 2 + 0.07);
    brick.lineTo(x - 0.12, h / 2 + 0.07);
    brick.lineTo(x - 0.12, h / 2);
  }
  brick.lineTo(-w / 2, h / 2);
  brick.lineTo(-w / 2, -h / 2 + r);
  brick.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const logo = new THREE.ShapeGeometry(brick, 4).translate(0.36, 0.98, front);
  batch.add(logo, color, { matrix: at(0), delay, gloss: 0.9 });
}

/** Shoulder to wrist: a round shoulder against the torso, then bent forward at the elbow. */
function armCurve() {
  return new THREE.CatmullRomCurve3(
    [[0, 0.27, 0], [0, -0.1, 0], [0, -0.5, 0.03], [0, -0.8, 0.17], [0, -0.98, 0.36]].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  );
}

function armShape(curve: THREE.CatmullRomCurve3) {
  const cap = 0.26;
  return sweep(curve, (s, length) => {
    if (s < cap) return 0.27 * Math.sqrt(Math.max(0, 1 - ((cap - s) / cap) ** 2));
    if (s > length - 0.035) return 0.2 * Math.sqrt(Math.max(0, 1 - ((s - length + 0.035) / 0.035) ** 2)) + 0.001;
    return 0.27 - 0.065 * smooth(cap, length, s);
  }, 30, 20, 0.9);
}

/** The C-shaped hand: its hole faces forward and a little inward, the gap away from the wrist. */
function addHand(batch: Batch, curve: THREE.CatmullRomCurve3, side: number, delay: number) {
  const wrist = curve.getPointAt(1);
  const along = curve.getTangentAt(1);
  const tip = wrist.clone().addScaledVector(along, 0.13);
  batch.add(barBetween(wrist.clone().addScaledVector(along, -0.04), tip, 0.105, 14), COLOR.skin, { delay });
  const radius = 0.18;
  const centre = tip.clone().addScaledVector(along, radius);
  const axis = new THREE.Vector3().crossVectors(along, new THREE.Vector3(1, 0, 0)).normalize();
  axis.applyAxisAngle(along, side * 0.5);
  const up = new THREE.Vector3().crossVectors(axis, along);
  const matrix = new THREE.Matrix4().makeBasis(along, up, axis).setPosition(centre);
  const clip = new THREE.TorusGeometry(radius, 0.085, 12, 28, Math.PI * 1.5).rotateZ(-Math.PI * 1.75);
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

  constructor({ shirt, pants, hair = 'short', helmet, harness = false, print, delay = 0.86 }: FigureStyle, materials: Materials) {
    this.body.position.y = HIP_HEIGHT;
    this.root.scale.setScalar(SCALE);
    this.root.add(this.body);

    const trunk = new Batch();
    // Hip piece, with the groove where the legs part.
    trunk.add(roundedBox(1.92, 0.36, 0.86, 0.06), pants, { matrix: new THREE.Matrix4().makeTranslation(0, 0.14, 0), delay });
    trunk.add(roundedBox(0.05, 0.24, 0.04, 0.015), darker(pants), { matrix: new THREE.Matrix4().makeTranslation(0, 0.05, 0.42), delay });
    trunk.add(torsoShape(), shirt, { matrix: new THREE.Matrix4().makeTranslation(0, HIP_TOP, 0), delay });
    // Neckline.
    const collar = new THREE.TorusGeometry(0.25, 0.022, 6, 24, Math.PI).rotateZ(Math.PI);
    trunk.add(collar, darker(shirt, 0.8), { matrix: new THREE.Matrix4().makeTranslation(0, HIP_TOP + 1.42, torsoAt(1.3).rz + 0.004), delay, gloss: 0.8 });
    if (print) addPrint(trunk, print, delay);
    if (harness) {
      for (const side of [-1, 1]) {
        const strap = new THREE.Matrix4().compose(
          new THREE.Vector3(side * 0.37, HIP_TOP + 0.74, 0.45),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.015, 0, -side * 0.13)),
          new THREE.Vector3(1, 1, 1),
        );
        trunk.add(roundedBox(0.17, 1.42, 0.05, 0.02), COLOR.brown, { gloss: 0.4, matrix: strap, delay });
      }
      trunk.add(roundedBox(1.98, 0.18, 0.96, 0.05), COLOR.brown, { gloss: 0.4, matrix: new THREE.Matrix4().makeTranslation(0, HIP_TOP + 0.1, 0), delay });
      trunk.add(roundedBox(0.3, 0.26, 1.02, 0.05), 0xc9ced6, { matrix: new THREE.Matrix4().makeTranslation(0, HIP_TOP + 0.1, 0), delay });
    }
    this.body.add(trunk.mesh(materials.mesh));

    // As wide together as the hips; each a straight block with the foot stepping forward.
    for (const [leg, x] of [[this.legLeft, 0.475], [this.legRight, -0.475]] as const) {
      leg.position.set(x, 0, 0);
      const parts = new Batch();
      parts.add(roundedBox(0.92, 1.32, 0.8, 0.1), pants, { matrix: new THREE.Matrix4().makeTranslation(0, -0.56, -0.02), delay });
      parts.add(roundedBox(0.92, 0.38, 1.06, 0.1), pants, { matrix: new THREE.Matrix4().makeTranslation(0, -1.41, 0.11), delay });
      leg.add(parts.mesh(materials.mesh));
      this.body.add(leg);
    }

    const curve = armCurve();
    const arm = armShape(curve);
    for (const [limb, side] of [[this.armLeft, 1], [this.armRight, -1]] as const) {
      limb.position.set(side * SHOULDER[0], SHOULDER[1], 0);
      limb.rotation.z = side * 0.16;
      const parts = new Batch();
      parts.add(arm, shirt, { delay });
      addHand(parts, curve, side, delay);
      limb.add(parts.mesh(materials.mesh));
      this.body.add(limb);
    }

    this.head.position.y = HEAD_BASE;
    const skull = new Batch();
    skull.add(turned([[HEAD_RADIUS, 0], [HEAD_RADIUS, HEAD_HEIGHT]], 0.13, 40), COLOR.skin, { delay });
    skull.add(turned([[0.36, -0.14], [0.36, 0.02]], 0.02, 24), COLOR.skin, { delay });
    addFace(skull, delay);
    if (helmet !== undefined) {
      skull.add(helmetShape(), helmet, { delay });
      const brim = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.54, 0.58), new THREE.Quaternion(), new THREE.Vector3(1.1, 0.12, 0.84));
      skull.add(new THREE.SphereGeometry(0.42, 24, 12), helmet, { matrix: brim, delay });
      skull.add(new THREE.TorusGeometry(0.77, 0.03, 8, 40).rotateX(Math.PI / 2).translate(0, 0.48, 0), 0x1b1b22, { delay, gloss: 0.4 });
    } else {
      const [shell, lip] = hairShell(hair);
      skull.add(shell, COLOR.hair, { gloss: 0.75, delay });
      skull.add(lip, darker(COLOR.hair, 0.45), { gloss: 0.1, delay });
      if (hair === 'ponytail') {
        skull.add(ponytail(), COLOR.hair, { gloss: 0.75, delay });
        skull.add(new THREE.TorusGeometry(0.15, 0.05, 8, 20).rotateX(1.1).translate(0.03, 0.92, -0.7), COLOR.red, { delay });
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
