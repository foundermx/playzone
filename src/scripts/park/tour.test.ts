import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { roundedPath } from '../../lib/rounded-path.ts';
import { LIGHT_VOLUME } from './layout.ts';
import { LEGS, poseAt, stopAt } from './tour.ts';

test('each stop is on screen exactly while the camera is parked on it', () => {
  assert.equal(stopAt(0), -1);
  assert.equal(stopAt(1), -1);
  for (let stop = 1; stop < LEGS; stop++) {
    assert.equal(stopAt(stop / LEGS), stop - 1);
    assert.equal(stopAt((stop + 0.5) / LEGS), -1);
  }
});

test('the camera never jumps between two scroll positions', () => {
  const previous = new THREE.Vector3();
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  poseAt(0, 1.6, previous, target);
  for (let i = 1; i <= 2000; i++) {
    poseAt(i / 2000, 1.6, position, target);
    assert.ok(position.distanceTo(previous) < 1, `jump at progress ${i / 2000}`);
    previous.copy(position);
  }
});

test('narrow screens pull the camera back', () => {
  const wide = new THREE.Vector3();
  const tall = new THREE.Vector3();
  const target = new THREE.Vector3();
  poseAt(0, 1.6, wide, target);
  poseAt(0, 0.5, tall, target);
  assert.ok(tall.distanceTo(target) > wide.distanceTo(target));
});

test('the light volume holds a whole number of voxels, or the bake and the shader disagree', () => {
  const { min, max, voxel } = LIGHT_VOLUME;
  for (const axis of [0, 1, 2]) {
    const voxels = (max[axis] - min[axis]) / voxel;
    assert.ok(Math.abs(voxels - Math.round(voxels)) < 1e-6, `axis ${axis} has ${voxels} voxels`);
  }
});

test('roundedPath closes the outline and rounds every corner', () => {
  const path = roundedPath([[0, 0], [10, 0], [10, 10], [0, 10]], 2);
  assert.match(path, /^M/);
  assert.match(path, /Z$/);
  assert.equal(path.match(/Q/g)?.length, 4);
  assert.doesNotMatch(path, /NaN/);
});
