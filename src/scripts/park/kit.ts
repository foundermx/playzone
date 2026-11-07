import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Brick, Plank } from './layout.ts';
import { COLOR, seededRandom } from './layout.ts';
import type { Materials } from './toy.ts';

/** Hands the main thread back between chunks of work, so input and animation never wait. */
export const breathe = () => new Promise<void>((resolve) => setTimeout(resolve));

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

const STUD_RADIUS = 0.38;
const STUD_HEIGHT = 0.24;
/** When props land, on the scale of the build animation. */
const PROP_DELAY = 0.78;

export interface Ring {
  y: number;
  rx: number;
  rz: number;
  /** Superellipse power: 2 is an ellipse, higher gets boxier. */
  power?: number;
  x?: number;
  z?: number;
}

type Plan = (angle: number, ring: Ring) => [number, number];

const superellipse: Plan = (angle, { rx, rz, power = 2 }) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const e = 2 / power;
  return [rx * Math.sign(c) * Math.abs(c) ** e, rz * Math.sign(s) * Math.abs(s) ** e];
};

/** Smooth skin through stacked rings. Close an end with a ring of near-zero radius. */
export function loft(rings: Ring[], segments = 40, plan: Plan = superellipse) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of rings) {
    for (let j = 0; j < segments; j++) {
      const [x, z] = plan((j / segments) * Math.PI * 2, ring);
      positions.push(x + (ring.x ?? 0), ring.y, z + (ring.z ?? 0));
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const next = (j + 1) % segments;
      const a = i * segments + j;
      const b = i * segments + next;
      const c = (i + 1) * segments + j;
      const d = (i + 1) * segments + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const boxes = new Map<string, RoundedBoxGeometry>();

export function roundedBox(width: number, height: number, depth: number, radius = 0.07, segments = 2) {
  const key = `${width}|${height}|${depth}|${radius}|${segments}`;
  let box = boxes.get(key);
  if (!box) {
    box = new RoundedBoxGeometry(width, height, depth, segments, radius);
    boxes.set(key, box);
  }
  return box;
}

/**
 * Turned part from a profile of [radius, height] corners, each corner rounded by `bevel`:
 * round bricks, cones, domes. Closed at both ends.
 */
export function turned(profile: [number, number][], bevel = 0.08, segments = 32) {
  const full: [number, number][] = [[0, profile[0][1]], ...profile, [0, profile.at(-1)![1]]];
  const points: THREE.Vector2[] = [];
  full.forEach(([r, y], i) => {
    const before = full[i - 1];
    const after = full[i + 1];
    if (!before || !after) {
      points.push(new THREE.Vector2(r, y));
      return;
    }
    // Ease into and out of the corner over `bevel` along each side.
    const into = new THREE.Vector2(before[0] - r, before[1] - y);
    const out = new THREE.Vector2(after[0] - r, after[1] - y);
    const a = into.clone().setLength(Math.min(bevel, into.length() / 2)).add(new THREE.Vector2(r, y));
    const b = out.clone().setLength(Math.min(bevel, out.length() / 2)).add(new THREE.Vector2(r, y));
    for (let s = 0; s <= 4; s++) {
      const t = s / 4;
      // Quadratic Bézier through the sharp corner.
      points.push(new THREE.Vector2(
        (1 - t) ** 2 * a.x + 2 * (1 - t) * t * r + t * t * b.x,
        (1 - t) ** 2 * a.y + 2 * (1 - t) * t * y + t * t * b.y,
      ));
    }
  });
  const geometry = new THREE.LatheGeometry(points, segments);
  geometry.deleteAttribute('uv');
  return mergeVertices(geometry);
}

/** Cylinder between two points, for rails, ropes and posts. */
export function barBetween(from: THREE.Vector3, to: THREE.Vector3, radius: number, segments = 12) {
  const direction = to.clone().sub(from);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), segments, 1, true);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  geometry.applyQuaternion(turn);
  const middle = from.clone().addScaledVector(direction, 0.5);
  return geometry.translate(middle.x, middle.y, middle.z);
}

export interface PartOptions {
  /** Share of glossy reflection: 1 for polished plastic, 0 for matte. */
  gloss?: number;
  matrix?: THREE.Matrix4;
  delay?: number;
}

/**
 * Many coloured pieces merged into one geometry, drawn in a single call. Draw calls are
 * what a browser pays for most, so nearly everything that does not move goes through here.
 */
export class Batch {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private delays: number[] = [];
  private indices: number[] = [];

  add(geometry: THREE.BufferGeometry, color: number, { gloss = 1, matrix, delay = PROP_DELAY }: PartOptions = {}) {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = geometry.getIndex();
    const first = this.positions.length / 3;
    const tint = new THREE.Color(color);
    const normalMatrix = matrix && new THREE.Matrix3().getNormalMatrix(matrix);
    const point = new THREE.Vector3();
    const facing = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      facing.fromBufferAttribute(normal, i);
      if (matrix) {
        point.applyMatrix4(matrix);
        facing.applyMatrix3(normalMatrix!).normalize();
      }
      this.positions.push(point.x, point.y, point.z);
      this.normals.push(facing.x, facing.y, facing.z);
      this.colors.push(tint.r, tint.g, tint.b, gloss);
      this.delays.push(delay);
    }
    if (index) for (let i = 0; i < index.count; i++) this.indices.push(first + index.getX(i));
    else for (let i = 0; i < position.count; i++) this.indices.push(first + i);
    return this;
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(this.colors, 4));
    geometry.setAttribute('aDelay', new THREE.Float32BufferAttribute(this.delays, 1));
    geometry.setIndex(this.indices);
    return geometry;
  }

  mesh(material: THREE.Material) {
    const mesh = new THREE.Mesh(this.build(), material);
    mesh.frustumCulled = false;
    return mesh;
  }
}

const instanced = (geometry: THREE.BufferGeometry, count: number, attributes: Record<string, [Float32Array, number]>) => {
  const result = new THREE.InstancedBufferGeometry();
  result.index = geometry.index;
  result.setAttribute('position', geometry.getAttribute('position'));
  result.setAttribute('normal', geometry.getAttribute('normal'));
  if (geometry.getAttribute('aShade')) result.setAttribute('aShade', geometry.getAttribute('aShade'));
  for (const [name, [data, size]] of Object.entries(attributes)) {
    result.setAttribute(name, new THREE.InstancedBufferAttribute(data, size));
  }
  result.instanceCount = count;
  return result;
};

function unitBox() {
  const box = new RoundedBoxGeometry(1, 1, 1, 1, 0.1);
  box.deleteAttribute('uv');
  return mergeVertices(box);
}

/** Every brick and plank of the park in one draw call; the shader sizes each instance. */
export function brickField(bricks: Brick[], planks: Plank[], materials: Materials) {
  const solid = bricks.filter((brick) => brick.width > 0);
  const count = solid.length + planks.length;
  const centres = new Float32Array(count * 3);
  const sizes = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const metas = new Float32Array(count * 2);
  const random = seededRandom(11);
  const top = Math.max(...solid.map((brick) => brick.y));
  const tint = new THREE.Color();

  solid.forEach((brick, i) => {
    centres.set([brick.x + brick.width / 2, brick.y + brick.height / 2, brick.z + brick.depth / 2], i * 3);
    sizes.set([brick.width, brick.height, brick.depth], i * 3);
    tint.set(brick.color).offsetHSL(0, 0, brick.shade);
    colors.set([tint.r, tint.g, tint.b, 1], i * 4);
    metas.set([brick.turn, delayOf(brick.y, top, random)], i * 2);
  });
  planks.forEach((plank, i) => {
    const n = solid.length + i;
    centres.set([plank.x, plank.y, plank.z], n * 3);
    sizes.set([plank.width, 0.34, plank.depth], n * 3);
    tint.set(COLOR.wood).offsetHSL(0, 0, plank.shade);
    colors.set([tint.r, tint.g, tint.b, 0.3], n * 4);
    metas.set([0, PROP_DELAY - 0.08], n * 2);
  });

  const mesh = new THREE.Mesh(
    instanced(unitBox(), count, { iCentre: [centres, 3], iSize: [sizes, 3], iColor: [colors, 4], iMeta: [metas, 2] }),
    materials.brick,
  );
  mesh.frustumCulled = false;
  return mesh;
}

const delayOf = (y: number, top: number, random: () => number) => 0.72 * (Math.max(y, 0) / top) ** 0.8 + 0.14 * random();

function studGeometry(segments: number) {
  const r = STUD_RADIUS;
  const h = STUD_HEIGHT;
  const bevel = 0.05;
  const profile = [
    [r, -0.02],
    [r, h - bevel],
    [r - bevel * 0.3, h - bevel * 0.3],
    [r - bevel, h],
    [0, h],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(profile, segments);
  // Darker at the root: contact shadow without a shadow pass.
  const position = geometry.getAttribute('position');
  const shade = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) shade[i] = position.getY(i) < 0 ? 0.62 : 1;
  geometry.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
  return geometry;
}

/** All studs in one draw call. */
export function studField(bricks: Brick[], segments: number, materials: Materials) {
  const count = bricks.reduce((total, brick) => total + brick.studs.length + Number(brick.frontStud), 0);
  const centres = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const metas = new Float32Array(count * 4);
  const random = seededRandom(11);
  const top = Math.max(...bricks.map((brick) => brick.y));
  const tint = new THREE.Color();
  let n = 0;
  for (const brick of bricks) {
    const delay = delayOf(brick.y, top, random);
    tint.set(brick.color).offsetHSL(0, 0, brick.shade);
    for (const [dx, dz] of brick.studs) {
      centres.set([brick.x + brick.width / 2 + dx, brick.y + brick.height, brick.z + brick.depth / 2 + dz], n * 3);
      colors.set([tint.r, tint.g, tint.b, 1], n * 4);
      metas.set([delay, 0, 0, 1], n * 4);
      n++;
    }
    if (brick.frontStud) {
      centres.set([brick.x + brick.width / 2, brick.y + brick.height / 2, brick.z + brick.depth], n * 3);
      colors.set([tint.r, tint.g, tint.b, 1], n * 4);
      metas.set([delay, 1, 0, 1.15], n * 4);
      n++;
    }
  }
  const mesh = new THREE.Mesh(
    instanced(studGeometry(segments), count, { iCentre: [centres, 3], iColor: [colors, 4], iMeta: [metas, 4] }),
    materials.stud,
  );
  mesh.frustumCulled = false;
  return mesh;
}

/** Balls, bobbing in the vertex shader by `bob` (nothing to update per frame). */
export function ballField(spots: [number, number, number, number][], materials: Materials, bob = 0.05, delay = PROP_DELAY) {
  const sphere = new THREE.SphereGeometry(0.5, 24, 16);
  sphere.setAttribute('aShade', new THREE.BufferAttribute(new Float32Array(sphere.getAttribute('position').count).fill(1), 1));
  const count = spots.length;
  const centres = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const metas = new Float32Array(count * 4);
  const tint = new THREE.Color();
  spots.forEach(([x, y, z, color], i) => {
    centres.set([x, y, z], i * 3);
    tint.set(color);
    colors.set([tint.r, tint.g, tint.b, 1], i * 4);
    metas.set([delay + (i % 9) * 0.012, 0, bob, 1], i * 4);
  });
  const mesh = new THREE.Mesh(instanced(sphere, count, { iCentre: [centres, 3], iColor: [colors, 4], iMeta: [metas, 4] }), materials.stud);
  mesh.frustumCulled = false;
  return mesh;
}
