import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Figure } from './figure.ts';
import { Batch, ballField, barBetween, breathe, brickField, clamp01, studField } from './kit.ts';
import {
  BIG_ZORB, BRICK, BRIDGE_Y, COLOR, DECK, DECK_WATER_Y, FIELD, GROUND_Y, HALL, LAMPS, POOL, SMALL_ZORB, TOWER, WALL_TOP, WATER_Y, createLayout, seededRandom,
} from './layout.ts';
import { addBridge, addClimbingHolds, addGoal, addLogs, addMezzanineRail, addPitchFence, addPitchLines, addPlate, addPoolRail, boat } from './props.ts';
import { createMaterials, shared, type Materials } from './toy.ts';
import { buildVenue } from './venue.ts';

const pingPong = (time: number, period: number) => {
  const t = (time / period) % 2;
  return t < 1 ? t : 2 - t;
};

function waterMesh(materials: Materials) {
  const pool = new THREE.PlaneGeometry(POOL.x1 - POOL.x0, POOL.z1 - POOL.z0)
    .rotateX(-Math.PI / 2)
    .translate((POOL.x0 + POOL.x1) / 2, WATER_Y, (POOL.z0 + POOL.z1) / 2);
  const width = DECK.x1 - DECK.lip;
  const depth = DECK.z1 - DECK.lip;
  const deck = new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2).translate(width / 2, DECK_WATER_Y, depth / 2);
  const mesh = new THREE.Mesh(mergeGeometries([pool, deck]), materials.water);
  mesh.frustumCulled = false;
  return mesh;
}

function lampGlows(materials: Materials) {
  const quads = LAMPS.map(([x, y, z]) => {
    const quad = new THREE.PlaneGeometry(5.4, 3.4);
    if (x < 1) return quad.rotateY(Math.PI / 2).translate(x + 0.03, y, z);
    return quad.translate(x, y, z + 0.03);
  });
  const mesh = new THREE.Mesh(mergeGeometries(quads), materials.glow);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

function ballSpots() {
  const random = seededRandom(5);
  const palette = [COLOR.red, COLOR.yellow, COLOR.orange, COLOR.blueBright, COLOR.greenBright, COLOR.yellow, COLOR.red];
  const spots: [number, number, number, number][] = [];
  const clear = (x: number, z: number, { x: cx, z: cz, r }: typeof BIG_ZORB) => Math.hypot(x - cx, z - cz) > r * 0.8;
  // Random spots that never touch; the attempt cap stops the loop once the deck is full.
  for (let attempt = 0; attempt < 5000 && spots.length < 96; attempt++) {
    const x = 0.8 + random() * 12;
    const z = 4 + random() ** 0.6 * 13.4;
    const apart = spots.every((spot) => Math.hypot(x - spot[0], z - spot[2]) > 1.16);
    if (apart && clear(x, z, BIG_ZORB) && clear(x, z, SMALL_ZORB)) {
      spots.push([x, DECK_WATER_Y + 0.3, z, palette[Math.floor(random() * palette.length)]]);
    }
  }
  return spots;
}

/** Soft dark patches under what moves: the baked light knows nothing about moving things. */
function contactShadows(count: number, materials: Materials) {
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  plane.setAttribute('iOpacity', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(0.62), 1));
  const mesh = new THREE.InstancedMesh(plane, materials.blob, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

/** The hall's floor, wall to wall. */
function floor(materials: Materials) {
  const { x0, x1, z0, front } = HALL;
  const plane = new THREE.PlaneGeometry(x1 - x0, front - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, GROUND_Y, (z0 + front) / 2);
  const mesh = new THREE.Mesh(plane, materials.floor);
  mesh.frustumCulled = false;
  return mesh;
}

export async function buildPark(studSegments: number) {
  const materials = createMaterials();
  const layout = createLayout();
  const root = new THREE.Group();

  const statics = new Batch();
  addPlate(statics);
  addBridge(statics, layout.backBridge);
  addBridge(statics, layout.leftBridge);
  addLogs(statics, layout.planks);
  await breathe();
  addClimbingHolds(statics);
  addPitchLines(statics);
  addPitchFence(statics);
  addPoolRail(statics);
  addGoal(statics, 24, FIELD.top, 4.6, 6.2, 5, 1.8);
  addMezzanineRail(statics, 6 * BRICK + 0.4);
  statics.add(barBetween(new THREE.Vector3(14.4, WALL_TOP, 1.5), new THREE.Vector3(14.1, BRIDGE_Y, 1.5), 0.09, 8), COLOR.yellow);

  // Zip line.
  const cableStart = new THREE.Vector3(20.6, WALL_TOP - 0.4, 5.2);
  const cableEnd = new THREE.Vector3(26.4, WALL_TOP - 1, 5.2);
  statics.add(barBetween(cableStart, cableEnd, 0.055, 8), 0xdfe6ee);
  for (const end of [cableStart, cableEnd]) {
    statics.add(barBetween(end, new THREE.Vector3(end.x, WALL_TOP + 0.1, 0.8), 0.07, 8), COLOR.yellow);
  }

  const venue = await buildVenue(materials);
  await breathe();
  root.add(
    venue.root,
    floor(materials),
    // The planks are drawn as logs (addLogs); the bake still counts them as boards.
    brickField(layout.bricks, [], materials),
    studField(layout.bricks, studSegments, materials),
    ballField(ballSpots(), materials),
    statics.mesh(materials.mesh),
    waterMesh(materials),
    lampGlows(materials),
  );

  await breathe();
  const trolley = new THREE.Group();
  const swing = new THREE.Group();
  const hanger = new Batch();
  hanger.add(new THREE.BoxGeometry(0.7, 0.3, 0.3), COLOR.black, { gloss: 0.5, delay: 0.86 });
  for (const side of [-1, 1]) {
    hanger.add(barBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1.1, side), 0.07, 8), COLOR.yellow, { delay: 0.86 });
  }
  trolley.add(swing);
  swing.add(hanger.mesh(materials.mesh));
  const rider = new Figure({ shirt: COLOR.white, pants: 0x1a2a55, helmet: COLOR.red, harness: true }, materials);
  rider.root.position.y = -5.9;
  rider.root.rotation.y = -Math.PI / 2;
  rider.body.rotation.x = -0.55;
  rider.legLeft.rotation.x = -1.15;
  rider.legRight.rotation.x = -0.8;
  rider.armLeft.rotation.x = rider.armRight.rotation.x = -1.95;
  rider.armLeft.rotation.z = -0.1;
  rider.armRight.rotation.z = 0.1;
  rider.head.rotation.set(0.28, 0.95, 0);
  swing.add(rider.root);
  root.add(trolley);

  const walker = new Figure({ shirt: COLOR.white, pants: COLOR.blue, hair: 'short', harness: true }, materials);
  root.add(walker.root);
  await breathe();

  // Boats.
  const yellowBoat = boat(COLOR.yellow, COLOR.orange, materials);
  const tealBoat = boat(0x18a7c4, 0x0d6f94, materials);
  const girl = new Figure({ shirt: 0xf6a6bd, pants: 0xf6a6bd, hair: 'ponytail', print: { kind: 'logo', color: COLOR.yellow } }, materials);
  const boy = new Figure({ shirt: COLOR.blueBright, pants: COLOR.navy, hair: 'swept', print: { kind: 'logo', color: COLOR.yellow } }, materials);
  for (const [figure, vessel] of [[girl, yellowBoat], [boy, tealBoat]] as const) {
    figure.sit();
    figure.root.position.set(-0.75, 0.2, 0);
    figure.root.rotation.y = Math.PI / 2;
    figure.armLeft.rotation.x = figure.armRight.rotation.x = -1.14;
    figure.armLeft.rotation.z = -0.2;
    figure.armRight.rotation.z = 0.2;
    vessel.group.add(figure.root);
    root.add(vessel.group);
  }
  // Both drive sideways to the visitor, so they look over a shoulder at the camera.
  girl.head.rotation.y = -0.85;
  boy.head.rotation.y = 0.85;

  await breathe();

  // Water balls.
  const zorbMesh = (r: number, zipped: boolean) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 72, 48), materials.zorb(zipped));
    mesh.renderOrder = 2;
    return mesh;
  };
  const bigZorb = zorbMesh(BIG_ZORB.r, true);
  const smallZorb = zorbMesh(SMALL_ZORB.r, false);
  bigZorb.position.set(BIG_ZORB.x, DECK.top + BIG_ZORB.r * 0.8, BIG_ZORB.z);
  smallZorb.position.set(SMALL_ZORB.x, DECK.top + SMALL_ZORB.r * 0.8, SMALL_ZORB.z);
  root.add(bigZorb, smallZorb);

  // Somebody is always inside the big one, walking on the water like in the photos.
  const zorbKid = new Figure({ shirt: COLOR.red, pants: COLOR.red, hair: 'short', delay: 0.9 }, materials);
  zorbKid.body.rotation.x = 0.12;
  root.add(zorbKid.root);

  await breathe();

  // Football.
  const y = FIELD.top;
  const keeper = new Figure({ shirt: COLOR.yellow, pants: COLOR.black, hair: 'short', print: { kind: 'logo', color: COLOR.red } }, materials);
  const white = new Figure({ shirt: COLOR.white, pants: COLOR.blue, hair: 'short', print: { kind: 'stripe', color: COLOR.blueBright } }, materials);
  const red = new Figure({ shirt: COLOR.red, pants: COLOR.black, hair: 'swept', print: { kind: 'stripe', color: COLOR.white } }, materials);
  keeper.root.position.set(24, y, 5.6);
  keeper.armLeft.rotation.z = 0.9;
  keeper.armRight.rotation.z = -0.9;
  white.root.position.set(22.2, y, 16.4);
  white.root.rotation.y = 0.95;
  red.root.position.set(26.8, y, 15.8);
  red.root.rotation.y = -0.9;
  const ballParts = new Batch().add(new THREE.SphereGeometry(0.62, 32, 22), COLOR.white, { delay: 0.86 });
  const football = ballParts.mesh(materials.mesh);
  root.add(keeper.root, white.root, red.root, football);

  await breathe();

  // Not in the drawing: this climber only exists during the wall stop of the tour.
  const climber = new Figure({ shirt: COLOR.white, pants: COLOR.blue, helmet: COLOR.yellow, harness: true, delay: 0 }, materials);
  climber.root.rotation.y = Math.PI;
  climber.root.position.set(TOWER.x0 + 3.1, 0, TOWER.z1 + 1.1);
  climber.head.rotation.y = -1.1;
  root.add(climber.root);

  const shadowed: { object: THREE.Object3D; size: number; ground?: number }[] = [
    { object: keeper.root, size: 3.6 },
    { object: white.root, size: 3.8 },
    { object: red.root, size: 3.8 },
    { object: football, size: 1.8 },
    { object: yellowBoat.group, size: 8, ground: WATER_Y + 0.02 },
    { object: tealBoat.group, size: 8, ground: WATER_Y + 0.02 },
    { object: bigZorb, size: 9, ground: DECK_WATER_Y + 0.02 },
    { object: smallZorb, size: 5.4, ground: DECK_WATER_Y + 0.02 },
    ...venue.shadowed,
  ];
  const shadows = contactShadows(shadowed.length, materials);
  root.add(shadows);
  const shadowMatrix = new THREE.Matrix4();
  const shadowAt = new THREE.Vector3();
  const shadowSize = new THREE.Vector3();
  const flat = new THREE.Quaternion();

  const passFrom = new THREE.Vector3(23.4, FIELD.top + 0.62, 16.7);
  const passTo = new THREE.Vector3(25.7, FIELD.top + 0.62, 16.1);

  function update(time: number, tour: number) {
    shared.uTime.value = time;
    venue.update(time);

    bigZorb.position.y = DECK.top + BIG_ZORB.r * 0.8 + Math.sin(time * 0.8) * 0.1;
    bigZorb.rotation.set(Math.sin(time * 0.21) * 0.26, Math.sin(time * 0.13) * 0.4, Math.cos(time * 0.17) * 0.2);
    const stride = Math.sin(time * 4.2);
    zorbKid.root.position.set(BIG_ZORB.x, DECK_WATER_Y + 0.08 + Math.sin(time * 0.8) * 0.1 + Math.abs(stride) * 0.08, BIG_ZORB.z);
    zorbKid.root.rotation.y = 0.6 + Math.sin(time * 0.3) * 0.7;
    zorbKid.legLeft.rotation.x = stride * 0.55;
    zorbKid.legRight.rotation.x = -stride * 0.55;
    zorbKid.armLeft.rotation.z = -1.1 + stride * 0.15;
    zorbKid.armRight.rotation.z = 1.1 + stride * 0.15;
    zorbKid.head.rotation.y = -0.4;
    smallZorb.position.y = DECK.top + SMALL_ZORB.r * 0.8 + Math.sin(time * 0.9 + 1.4) * 0.08;
    smallZorb.rotation.set(Math.cos(time * 0.24) * 0.3, Math.sin(time * 0.16) * 0.5, 0);

    // Walker: paces the back bridge, turning at each end.
    const pace = pingPong(time + 7, 8);
    const along = 0.34 + pace * 0.42;
    walker.root.position.set(3.2 + along * 15.4, BRIDGE_Y + 0.34 + Math.abs(Math.sin(time * 3.4)) * 0.05 - Math.sin(along * Math.PI) * 0.38, 2.4);
    const goingRight = Math.floor((time + 7) / 8) % 2 === 0;
    walker.root.rotation.y = goingRight ? Math.PI / 2 : -Math.PI / 2;
    const step = Math.sin(time * 3.4) * 0.6;
    walker.legLeft.rotation.x = step;
    walker.legRight.rotation.x = -step;
    walker.armLeft.rotation.x = -step * 0.5;
    walker.armRight.rotation.x = -2.1 - step * 0.2;
    walker.head.rotation.y = goingRight ? -0.7 : 0.7;

    // Zip line: glide over, glide back.
    const glide = (1 - Math.cos(pingPong(time + 4, 6) * Math.PI)) / 2;
    trolley.position.lerpVectors(cableStart, cableEnd, 0.08 + glide * 0.84);
    swing.rotation.z = Math.sin(time * 1.7) * 0.11;
    swing.rotation.x = Math.cos(time * 1.1) * 0.05;

    // Boats: the pool is narrow, so each one paddles around its own spot.
    [yellowBoat, tealBoat].forEach((vessel, i) => {
      const facing = i === 0 ? 1 : -1;
      const phase = time * 0.42 + i * 2;
      vessel.group.position.set(
        (i === 0 ? 3.7 : 11.3) + Math.sin(phase) * 0.5,
        WATER_Y + 0.26 + Math.sin(time * 1.2 + i) * 0.05,
        22.5 + Math.sin(phase * 2) * 0.4,
      );
      vessel.group.rotation.y = (i === 0 ? 0 : Math.PI) + facing * Math.sin(phase + 1) * 0.36;
      vessel.group.rotation.z = Math.sin(time * 0.9 + i) * 0.025;
      vessel.group.rotation.x = Math.cos(time * 1.1 + i) * 0.02;
      for (const wheel of vessel.wheels) wheel.rotation.z = -time * 2.2;
    });

    // Pass and return: the ball rolls between the two players.
    const pass = pingPong(time, 2.6);
    const eased = pass * pass * (3 - 2 * pass);
    football.position.lerpVectors(passFrom, passTo, eased);
    football.rotation.z = -eased * 7;
    const kick = (phase: number) => clamp01(1 - Math.abs(phase) * 6);
    white.legRight.rotation.x = -kick(pass) * 1 + 0.15;
    white.legLeft.rotation.x = -0.15;
    red.legLeft.rotation.x = -kick(pass - 1) * 1 + 0.15;
    red.legRight.rotation.x = -0.15;
    white.armLeft.rotation.x = -0.5;
    white.armRight.rotation.x = 0.4;
    red.armLeft.rotation.x = 0.4;
    red.armRight.rotation.x = -0.5;
    white.head.rotation.y = -0.25;
    red.head.rotation.y = 0.25;
    keeper.root.position.x = 24 + Math.sin(time * 0.9) * 1.2;
    keeper.root.position.y = FIELD.top + Math.abs(Math.sin(time * 1.8)) * 0.1;

    // Climbs with the scroll: the wall is stop 5 of the 7 legs of the tour.
    const climb = clamp01((tour - 5 / 7) / 0.16 + 0.5);
    const onWall = climb > 0 && climb < 1;
    climber.root.visible = onWall;
    if (onWall) {
      climber.root.position.y = 0.4 + climb * 6.4;
      const reach = Math.sin(climb * 22);
      climber.armLeft.rotation.x = -2.5 - reach * 0.45;
      climber.armRight.rotation.x = -2.5 + reach * 0.45;
      climber.legLeft.rotation.x = -0.5 + reach * 0.4;
      climber.legRight.rotation.x = -0.5 - reach * 0.4;
    }

    shadowed.forEach(({ object, size, ground = FIELD.top + 0.02 }, i) => {
      shadowAt.set(object.position.x, ground, object.position.z);
      shadowMatrix.compose(shadowAt, flat, shadowSize.set(size, 1, size));
      shadows.setMatrixAt(i, shadowMatrix);
    });
    shadows.instanceMatrix.needsUpdate = true;
  }

  function setBuilt(progress: number) {
    shared.uBuilt.value = progress;
    const pop = clamp01((progress - 0.84) / 0.1);
    const scale = pop === 1 ? 1 : Math.max(0.0001, 1 + 2.4 * (pop - 1) ** 3 + 1.4 * (pop - 1) ** 2);
    bigZorb.scale.setScalar(scale);
    smallZorb.scale.setScalar(scale);
  }

  return { root, update, setBuilt };
}
