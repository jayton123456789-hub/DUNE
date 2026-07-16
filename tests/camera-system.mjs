import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SplineTerrain } = require('../src/physics-core.js');
const { computeCameraTarget } = require('../src/camera-system.js');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const viewports = [
  { width: 568, height: 320 },
  { width: 667, height: 375 },
  { width: 844, height: 390 }
];
const altitudes = [0, 300, 700, 1350, 1800];
const terrain = new SplineTerrain({ seed: 5 });
const x = 31_045;
const radius = 24;
const ground = terrain.frame(x, radius).centerY;
const results = [];

for (const viewport of viewports) {
  const baseScale = clamp(viewport.height / 620, 0.52, 1.08);
  let previousZoom = Infinity;
  for (const altitude of altitudes) {
    const ball = {
      x,
      y: ground - altitude,
      vx: altitude ? 1420 : 520,
      vy: 0,
      radius,
      grounded: altitude === 0
    };
    const framing = computeCameraTarget({
      ball,
      terrain,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      baseScale,
      mode: 'playing'
    });

    assert.ok(framing.targetZoom <= previousZoom + 1e-9, `zoom should not tighten as altitude rises at ${viewport.width}x${viewport.height}`);
    assert.ok(framing.targetBallScreenY >= framing.topAnchorPixels - 0.01, 'ball escaped above the high-flight safe frame');
    assert.ok(framing.targetFloorScreenY <= framing.floorAnchorPixels + 1.5, `floor escaped at altitude ${altitude} on ${viewport.width}x${viewport.height}`);
    assert.ok(framing.lookahead >= 420 && framing.lookahead <= 2400, 'landing lookahead left its configured bounds');
    previousZoom = framing.targetZoom;
    results.push({ viewport: `${viewport.width}x${viewport.height}`, altitude, zoom: framing.targetZoom, floorY: framing.targetFloorScreenY });
  }
}

// Deterministic extreme launch used by browser verification. This is far above
// ordinary runs and previously projected the floor more than 1,200px down a
// 390px viewport.
const extremeTerrain = new SplineTerrain({ seed: 1 });
const extremeBall = {
  x: 8201.44,
  y: -1759.14,
  vx: 1150,
  vy: 0,
  radius,
  grounded: false
};
for (const viewport of [viewports[0], viewports[2]]) {
  const framing = computeCameraTarget({
    ball: extremeBall,
    terrain: extremeTerrain,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    baseScale: clamp(viewport.height / 620, 0.52, 1.08),
    mode: 'playing'
  });
  assert.ok(framing.targetZoom < 0.19, `extreme flight did not reach emergency wide framing: ${framing.targetZoom}`);
  assert.ok(framing.targetFloorScreenY <= viewport.height - 4, `extreme floor is not visible at ${viewport.width}x${viewport.height}: ${framing.targetFloorScreenY}`);
}

// New/deeper terrain is acquired faster than terrain moving upward, preventing
// sudden floor loss without letting alternating samples pump the camera.
let floor = 500;
const flatTerrain = { height: () => floor };
const smoothingBall = { x: 0, y: 0, vx: 900, vy: 0, radius, grounded: false };
floor = 800;
const deeper = computeCameraTarget({
  ball: smoothingBall,
  terrain: flatTerrain,
  viewportWidth: 568,
  viewportHeight: 320,
  baseScale: 0.52,
  currentGroundReferenceY: 500,
  dt: 1 / 60
});
floor = 200;
const shallower = computeCameraTarget({
  ball: smoothingBall,
  terrain: flatTerrain,
  viewportWidth: 568,
  viewportHeight: 320,
  baseScale: 0.52,
  currentGroundReferenceY: 500,
  dt: 1 / 60
});
assert.ok(deeper.groundReferenceY - 500 > 500 - shallower.groundReferenceY, 'floor smoothing is not asymmetric toward safety');

console.log(JSON.stringify({
  status: 'pass',
  samples: results.length,
  zoomAt1800: results.filter(item => item.altitude === 1800).map(item => Number(item.zoom.toFixed(3))),
  deepestTargetFloor: Number(Math.max(...results.map(item => item.floorY)).toFixed(1))
}, null, 2));
