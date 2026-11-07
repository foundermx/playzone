import * as THREE from 'three';
import { clamp01, smootherstep } from './kit.ts';

interface Pose {
  position: [number, number, number];
  target: [number, number, number];
  /** Sideways shift on wide screens, to clear the card beside the subject. */
  aside?: number;
}

const OVERVIEW: Pose = { position: [41, 31.5, 78], target: [12.6, 6.4, 12.6] };

/** Same order as STOPS in data/site.ts. */
const STOP_POSES: Pose[] = [
  { position: [33.4, 13.6, 27], target: [23.4, 10.2, 5], aside: -3.8 },
  { position: [13, 18, 25], target: [11.2, 10.8, 2.5] },
  { position: [18, 15, 33], target: [8.8, 7.2, 12.5] },
  { position: [11, 11, 44], target: [7.6, 1.5, 21.5] },
  { position: [22.5, 8, 35], target: [17.5, 5.8, 14.8], aside: 1.5 },
  { position: [27.2, 10.5, 37], target: [24.2, 2.6, 11], aside: 2.3 },
];

const PATH = [OVERVIEW, ...STOP_POSES, OVERVIEW];
export const LEGS = PATH.length - 1;

/** Share of each leg the camera spends parked at either end, so stops can be read. */
const DWELL = 0.2;
/** Aspect ratio the poses were framed for. */
const FRAMED_ASPECT = 1.6;

const fromPosition = new THREE.Vector3();
const toPosition = new THREE.Vector3();
const fromTarget = new THREE.Vector3();
const toTarget = new THREE.Vector3();

export function poseAt(progress: number, aspect: number, position: THREE.Vector3, target: THREE.Vector3) {
  const exact = clamp01(progress) * LEGS;
  const leg = Math.min(Math.floor(exact), LEGS - 1);
  const t = smootherstep(clamp01((exact - leg - DWELL) / (1 - DWELL * 2)));
  const from = PATH[leg];
  const to = PATH[leg + 1];

  position.lerpVectors(fromPosition.set(...from.position), toPosition.set(...to.position), t);
  target.lerpVectors(fromTarget.set(...from.target), toTarget.set(...to.target), t);
  if (aspect > 1.2) {
    const aside = (from.aside ?? 0) * (1 - t) + (to.aside ?? 0) * t;
    position.x += aside;
    target.x += aside;
  }
  // Rise a little between stops, so the camera flies instead of sliding.
  position.y += Math.sin(t * Math.PI) * 3;

  // Narrow screens need distance, or the sides of the frame are lost.
  const pullBack = Math.max(1, FRAMED_ASPECT / aspect) ** 0.85;
  position.sub(target).multiplyScalar(pullBack).add(target);
}

/** Index of the stop on screen, or -1 between stops and over the overview. */
export function stopAt(progress: number) {
  const exact = clamp01(progress) * LEGS;
  const nearest = Math.round(exact);
  const parked = Math.abs(exact - nearest) < DWELL + 0.1;
  return parked && nearest >= 1 && nearest <= LEGS - 1 ? nearest - 1 : -1;
}
