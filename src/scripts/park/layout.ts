/**
 * Plan of the park as plain data, so the page and the offline light bake read the same
 * bricks. World units: 1 = one stud pitch; a figure stands about 6 tall.
 */
export const BRICK = 1.2;

export const COLOR = {
  blue: 0x0548d8,
  blueBright: 0x0a5cf0,
  navy: 0x0a2a8a,
  yellow: 0xffc400,
  red: 0xd9141c,
  green: 0x1fa32e,
  greenBright: 0x2fbf3f,
  orange: 0xf58a1f,
  orangeDeep: 0xee7412,
  wood: 0xb9783f,
  skin: 0xffd11c,
  white: 0xf4f4f0,
  black: 0x17171c,
  brown: 0x5a3417,
  hair: 0x6a3d1c,
  water: 0x25b8dc,
} as const;

const normalize = ([x, y, z]: [number, number, number]): [number, number, number] => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};

/** Direction towards the key light, shared by the bake and the shaders. */
export const SUN = normalize([0.1, 0.8, 0.59]);

/** Box covered by the baked light volume. */
export const LIGHT_VOLUME = { min: [-3, -2, -3], max: [30, 19.6, 30], voxel: 0.6 } as const;

const ROWS = 12;
export const WALL_TOP = ROWS * BRICK;
export const RIM_HEIGHT = 1.7;

/** X runs along the back wall, Z along the left wall. */
export const OUTLINE: [number, number][] = [[-1.5, -1.5], [28.5, -1.5], [28.5, 21], [20.5, 28], [-1.5, 28]];
export const POOL = { x0: 0.5, z0: 0.5, x1: 14.5, z1: 26 };
export const FIELD = { x0: 20.5, z0: 0.5, x1: 27.5, z1: 19, top: 0.16 };
export const DECK = { x1: 14.5, z1: 19, bottom: 3.9, top: 5, lip: 1.3 };
export const TOWER = { x0: 14.5, x1: 20.5, z0: 12.2, z1: 14.8, rows: 9 };
export const BRIDGE_Y = 8;
export const WATER_Y = -0.16;
export const DECK_WATER_Y = DECK.top - 0.2;
export const BIG_ZORB = { x: 6.8, z: 14.4, r: 4.3 };
export const SMALL_ZORB = { x: 12.4, z: 10.6, r: 2.4 };

export const LAMPS: [number, number, number][] = [
  ...[5, 10, 15, 20].map((z): [number, number, number] => [0.1, WALL_TOP - 0.62, z]),
  ...[4.5, 9, 14].map((x): [number, number, number] => [x, WALL_TOP - 0.62, 0.1]),
];

export interface Brick {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: number;
  /** Radians around Y. */
  turn: number;
  /** Lightness jitter, so big walls do not read as one flat surface. */
  shade: number;
  /** Studs on the top face, as offsets from the brick centre. */
  studs: [number, number][];
  /** One stud on the +Z face instead, for climbing-wall tiles. */
  frontStud: boolean;
}

interface BrickOptions {
  height?: number;
  studs?: boolean | [number, number][];
  turn?: number;
  shade?: number;
  frontStud?: boolean;
}

export interface Plank {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  shade: number;
  /** Top of the rope that holds this plank. */
  anchor: [number, number, number];
  /** Where that rope meets the plank. */
  foot: [number, number, number];
}

export function seededRandom(seed = 7) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export const insideRect = (x: number, z: number, r: { x0: number; z0: number; x1: number; z1: number }, margin = 0) =>
  x > r.x0 - margin && x < r.x1 + margin && z > r.z0 - margin && z < r.z1 + margin;

/** True inside the plate outline, whose only slanted side is the front right corner. */
export function insidePlate(x: number, z: number, margin = 0) {
  const [ax, az] = OUTLINE[2];
  const [bx, bz] = OUTLINE[3];
  const side = ((x - ax) * (bz - az) + (z - az) * (ax - bx)) / Math.hypot(bx - ax, bz - az);
  return x > OUTLINE[0][0] && x < ax && z > OUTLINE[0][1] && z < bz && side < -margin;
}

class BrickList {
  readonly bricks: Brick[] = [];

  /** (x, y, z) is the brick's lowest corner. */
  add(x: number, y: number, z: number, width: number, depth: number, color: number, options: BrickOptions = {}) {
    const { height = BRICK, studs = false, turn = 0, shade = 0, frontStud = false } = options;
    let offsets: [number, number][] = [];
    if (studs === true) {
      const columns = Math.floor(width);
      const rows = Math.floor(depth);
      for (let i = 0; i < columns; i++) {
        for (let j = 0; j < rows; j++) offsets.push([i + 0.5 - columns / 2, j + 0.5 - rows / 2]);
      }
    } else if (studs) {
      offsets = studs;
    }
    this.bricks.push({ x, y, z, width, depth, height, color, turn, shade, studs: offsets, frontStud });
  }

  /** A stud on an existing surface, with no brick of its own. */
  stud(x: number, y: number, z: number, color: number) {
    this.bricks.push({ x, y, z, width: 0, depth: 0, height: 0, color, turn: 0, shade: 0, studs: [[0, 0]], frontStud: false });
  }

  column(x: number, z: number, width: number, depth: number, firstRow: number, lastRow: number, color: number) {
    for (let row = firstRow; row <= lastRow; row++) this.add(x, row * BRICK, z, width, depth, color);
  }

  /** Running bond: every other course starts with a half brick. */
  wall(axis: 'x' | 'z', start: number, end: number, fixed: number, thickness: number, random: () => number) {
    for (let row = 0; row < ROWS; row++) {
      let position = start;
      let length = row % 2 ? 1 : 2;
      while (position < end) {
        const size = Math.min(length, end - position);
        const shade = (random() - 0.5) * 0.05;
        if (axis === 'x') this.add(position, row * BRICK, fixed, size, thickness, COLOR.navy, { shade });
        else this.add(fixed, row * BRICK, position, thickness, size, COLOR.navy, { shade });
        position += size;
        length = 2;
      }
    }
  }
}

/** Skirt of real bricks around the plate, so its edge shows seams and not a flat band. */
function plateEdge(list: BrickList) {
  for (let i = 0; i < OUTLINE.length; i++) {
    const [ax, az] = OUTLINE[i];
    const [bx, bz] = OUTLINE[(i + 1) % OUTLINE.length];
    const length = Math.hypot(bx - ax, bz - az);
    const count = Math.round(length / 2);
    const size = length / count;
    const turn = -Math.atan2(bz - az, bx - ax);
    for (let n = 0; n < count; n++) {
      const t = (n + 0.5) / count;
      const cx = ax + (bx - ax) * t + Math.sin(turn) * 0.5;
      const cz = az + (bz - az) * t + Math.cos(turn) * 0.5;
      list.add(cx - size / 2, -BRICK, cz - 0.5, size, 1, COLOR.blueBright, { turn });
    }
  }
}

function plateStuds(list: BrickList) {
  for (let x = -1; x < 28; x++) {
    for (let z = -1; z < 28; z++) {
      const cx = x + 0.5;
      const cz = z + 0.5;
      const covered =
        insideRect(cx, cz, POOL, 0.1) ||
        insideRect(cx, cz, FIELD, 0.1) ||
        (cx < 0 && cz < 24.5) ||
        cz < 0 ||
        insideRect(cx, cz, { x0: TOWER.x0, x1: TOWER.x1, z0: 0, z1: TOWER.z1 });
      if (!covered && insidePlate(cx, cz, 0.84)) list.stud(cx, 0, cz, COLOR.blueBright);
    }
  }
}

function rim(list: BrickList) {
  const pair = (axis: 'x' | 'z') => [-0.5, 0.5].map((offset): [number, number] => (axis === 'x' ? [offset, 0] : [0, offset]));
  const height = RIM_HEIGHT;
  for (let x = 1; x < 28; x += 2) list.add(x, WALL_TOP, -1.5, 2, 2.6, COLOR.blueBright, { height, studs: pair('x') });
  for (let z = -1.5; z < 24.5; z += 2) list.add(-1.5, WALL_TOP, z, 2.6, 2, COLOR.blueBright, { height, studs: pair('z') });
  const top = WALL_TOP + RIM_HEIGHT;
  list.add(-1.75, top, 11.5, 2, 4, COLOR.red, { studs: true });
  list.add(-1.75, top, 1, 2, 4, COLOR.yellow, { studs: true });
  list.add(6, top, -1.5, 4, 2, COLOR.blueBright, { studs: true });
  list.add(19, top - 0.4, -1.75, 5, 2.4, COLOR.yellow, { studs: true, height: 1.6 });
  list.add(25.5, WALL_TOP - 0.3, -1.75, 3.25, 3.5, COLOR.blueBright, { studs: true, height: RIM_HEIGHT + 1 });
  list.add(-2, WALL_TOP - 0.3, 23.8, 3.5, 3, COLOR.blueBright, { studs: true, height: RIM_HEIGHT + 1 });
}

function pillars(list: BrickList) {
  const capStuds: [number, number][] = [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]];
  // Front left: the stacked red, yellow and blue column.
  list.column(-1, 24.5, 2, 2, 0, 2, COLOR.red);
  list.add(-1.75, 3 * BRICK, 23.75, 3.5, 3.5, COLOR.yellow, { height: BRICK * 2, studs: capStuds });
  list.column(-1, 24.5, 2, 2, 5, 6, COLOR.blue);
  list.add(-1.75, 7 * BRICK, 23.75, 3.5, 3.5, COLOR.yellow, { height: BRICK * 2, studs: capStuds });
  list.column(-1, 24.5, 2, 2, 9, ROWS - 1, COLOR.blue);

  // Back corner and the post that closes the bridge.
  list.column(-1, -1, 2.5, 2.5, 0, ROWS - 1, COLOR.blue);
  list.column(18, 0, 2.5, 2, 0, ROWS - 1, COLOR.blue);

  // Right end.
  list.column(26.5, 0, 2, 2.5, 0, 2, COLOR.yellow);
  list.column(26.5, 0, 2, 2.5, 3, ROWS - 1, COLOR.blue);
  list.add(25.5, 6 * BRICK, -0.5, 3.5, 4, COLOR.yellow, { height: BRICK * 2, studs: true });

  // Landings of the rope circuit.
  list.add(0, 6 * BRICK, 0, 3.2, 3.2, COLOR.yellow, { height: 1.3 });
  list.add(17.6, 6 * BRICK, 0, 3.4, 3.4, COLOR.yellow, { height: BRICK * 1.2, studs: true });
  list.add(10, 5.1, 0.2, 5, 2, COLOR.red, { studs: true });
}

function deck(list: BrickList) {
  list.add(0, DECK.bottom, 0, DECK.x1, DECK.z1, COLOR.blue, { height: 0.5 });
  const lip = DECK.top - DECK.bottom - 0.5;
  for (let x = 0; x < DECK.x1; x += 2.5) {
    list.add(x, DECK.bottom + 0.5, DECK.z1 - DECK.lip, 2.5, DECK.lip, COLOR.blueBright, { height: lip, studs: [[-0.625, 0], [0.625, 0]] });
  }
  for (let z = 0; z < DECK.z1 - 1.4; z += 2.4) {
    list.add(DECK.x1 - DECK.lip, DECK.bottom + 0.5, z, DECK.lip, 2.4, COLOR.blueBright, { height: lip });
  }
  list.column(5.5, 17, 2, 2, 0, 2, COLOR.blue);
  list.column(12.2, 17, 1.6, 2, 0, 2, COLOR.yellow);
  list.column(13.8, 15.8, 1.6, 2.6, 0, 3, COLOR.blue);
}

function tower(list: BrickList) {
  const { x0, x1, z0, z1, rows } = TOWER;
  for (let row = 0; row < rows; row++) {
    for (let x = x0; x < x1; x += 2) list.add(x, row * BRICK, z0, 2, z1 - z0, COLOR.blue);
    for (let col = 0; col < 5; col++) {
      list.add(x0 + col * 1.2, row * BRICK, z1, 1.2, 0.3, (row + col) % 3 ? COLOR.orange : COLOR.orangeDeep, { frontStud: true });
    }
  }
  const top = rows * BRICK;
  list.add(x0 - 0.4, top, z0 - 0.5, 4.4, 3.4, COLOR.blueBright, { height: BRICK * 1.4, studs: true });
  list.add(x0 + 4, top, z0 - 0.2, 4, 3.1, COLOR.red, { height: BRICK * 1.2, studs: true });
}

function mezzanine(list: BrickList) {
  for (let x = 20.5; x < 26.4; x += 2) list.add(x, 5 * BRICK, 3.4, 2, 1.2, COLOR.blueBright);
  for (let x = 20.5; x < 26.4; x += 1) {
    for (let z = 0.5; z < 4.5; z += 1) list.add(x, 6 * BRICK, z, 1, 1, COLOR.greenBright, { height: 0.4, studs: true });
  }
}

function pitchTiles(list: BrickList) {
  for (let x = FIELD.x0; x < FIELD.x1; x += 1) {
    for (let z = FIELD.z0; z < FIELD.z1 - 0.1; z += 1) {
      const dark = (Math.floor(x) + Math.floor(z)) % 2 === 0;
      list.add(x, 0, z, 1, Math.min(1, FIELD.z1 - z), dark ? 0x12952a : 0x19a933, { height: FIELD.top });
    }
  }
}

function bridge(from: [number, number, number], to: [number, number, number], count: number, width: number, wall: [number, number]) {
  const random = seededRandom(23 + count);
  const alongX = Math.abs(to[0] - from[0]) > Math.abs(to[2] - from[2]);
  return Array.from({ length: count }, (_, i): Plank => {
    const t = (i + 0.5) / count;
    const x = from[0] + (to[0] - from[0]) * t;
    const z = from[2] + (to[2] - from[2]) * t;
    const y = from[1] - Math.sin(t * Math.PI) * 0.38;
    return {
      x,
      y,
      z,
      width: alongX ? 1.5 : width,
      depth: alongX ? width : 1.5,
      shade: (random() - 0.5) * 0.06,
      anchor: [x + wall[0] * (width / 2), from[1] + 3.3 - Math.sin(t * Math.PI) * 0.28, z + wall[1] * (width / 2)],
      foot: [x + wall[0] * (width / 2 - 0.2), y, z + wall[1] * (width / 2 - 0.2)],
    };
  });
}

export function createLayout() {
  const list = new BrickList();
  const random = seededRandom(3);

  plateEdge(list);
  plateStuds(list);
  list.wall('x', 1, 28.5, -1.5, 1.5, random);
  list.wall('z', 0, 24.5, -1.5, 1.5, random);
  rim(list);
  pillars(list);
  deck(list);
  tower(list);
  mezzanine(list);
  pitchTiles(list);

  // Loose bricks on the floor, as in the drawing.
  list.add(14.7, 0, 19.2, 1.2, 6.4, COLOR.yellow, { studs: [0, 1, 2, 3, 4, 5].map((i) => [0, i - 2.5]) });
  list.add(16, 0, TOWER.z1 + 0.3, 3.4, 1.2, COLOR.greenBright, { studs: [[-1, 0], [0, 0], [1, 0]] });

  const backBridge = bridge([3.2, BRIDGE_Y, 2.2], [18.6, BRIDGE_Y, 2.2], 7, 2.6, [0, -1]);
  const leftBridge = bridge([1.4, BRIDGE_Y, 3.2], [1.4, BRIDGE_Y, 22.4], 8, 2.2, [-1, 0]);

  return { bricks: list.bricks, planks: [...backBridge, ...leftBridge], backBridge, leftBridge };
}
