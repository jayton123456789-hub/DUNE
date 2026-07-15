import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { CurvePilot } = require('../src/autopilot.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const terrain = {
  frame(x) {
    const slope = x < 500 ? 0.45 : x < 900 ? -0.42 : 0.02;
    const length = Math.hypot(1, slope);
    return {
      slope,
      curvature: x > 780 && x < 920 ? 0.004 : 0,
      centerY: 500 + slope * 20,
      tx: 1 / length,
      ty: slope / length,
      nx: slope / length,
      ny: -1 / length
    };
  }
};

const world = {
  config: { gravity: 455, airDiveExtraGravity: 1350, airDrag: 0.000012 },
  flight: { airtime: 0.2 },
  ball: { x: 220, y: 500, vx: 420, vy: 190, radius: 24, grounded: true, groundSpeed: 460 }
};

const pilot = new CurvePilot({ world, terrain });
pilot.reset();
assert(pilot.groundDecision() === true, 'pilot should hold on a downhill');
world.ball.x = 650;
world.ball.vx = 520;
world.ball.vy = -210;
assert(pilot.groundDecision() === false, 'pilot should release on an uphill');
world.ball.grounded = false;
world.ball.x = 750;
world.ball.y = 250;
world.ball.vx = 620;
world.ball.vy = -180;
const decision = pilot.airDecision();
assert(typeof decision === 'boolean', 'air decision must be boolean');

console.log(JSON.stringify({
  status: 'pass',
  downhillHold: true,
  uphillRelease: true,
  airDecision: decision
}, null, 2));
