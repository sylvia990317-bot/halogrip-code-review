const test = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');
const { fitToFrame } = loadTypeScript('app/work/halogrip/intro-projection.ts', { modules: { three: THREE } });

function fixture() {
  const place = new THREE.Group();
  const rotate = new THREE.Group();
  place.add(rotate);
  // Deliberately off-centre: a tilt must preserve the screen centre, not orbit the origin.
  const points = new Float32Array([1, 1, 0, 3, 1, 0, 1, 5, 0, 3, 5, 0]);
  const pose = { pitch: 0, yaw: 0, roll: 0, fx: .2, fy: .1, fw: .4, fh: .6 };
  const lens = new THREE.OrthographicCamera(-10, 10, 5, -5);
  const scratch = { euler: new THREE.Euler(), matrix: new THREE.Matrix4() };
  return { place, rotate, points, pose, lens, scratch,
    fit(tilt = 0, depth = 0) { fitToFrame(place, rotate, pose, points, lens, scratch, depth, tilt); place.updateMatrixWorld(true); },
    centre() { return rotate.localToWorld(new THREE.Vector3(2, 3, 0)); },
  };
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`); }

test('the silhouette fits its frame without stretching, including after a resize', () => {
  const h = fixture();
  h.fit();
  near(h.place.scale.x, 1.5); // 6-unit frame height fits a 4-unit silhouette.
  near(h.place.scale.y, h.place.scale.x);
  near(h.centre().x, -2);
  near(h.centre().y, 1);
  h.lens.left = -5; h.lens.right = 5; h.lens.top = 10; h.lens.bottom = -10;
  h.fit();
  near(h.place.scale.x, 2); // The narrower frame now limits the fit by width.
  near(h.centre().x, -1);
  near(h.centre().y, 2);
});

test('forward/reverse screen tilt preserves scale and the off-centre model anchor', () => {
  const h = fixture();
  for (const tilt of [0, 15.12, 0, -22.79, 15.12]) {
    h.fit(tilt, -12);
    near(h.place.scale.x, 1.5);
    near(h.centre().x, -2);
    near(h.centre().y, 1);
    near(h.centre().z, -12);
    near(h.place.rotation.z, -THREE.MathUtils.degToRad(tilt));
  }
});

test('pose changes recompute the fit and reversing returns to the original size', () => {
  const h = fixture();
  h.fit();
  h.pose.roll = 90;
  h.fit();
  near(h.place.scale.x, 2); // Rotated bounds are 4 by 2, limited by the 8-unit frame width.
  near(h.centre().x, -2);
  near(h.centre().y, 1);
  h.pose.roll = 0;
  h.fit();
  near(h.place.scale.x, 1.5);
});
