import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const routes = require('../src/v14-route.js');
const { SmartCoinField } = require('../src/v14-coins.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class WaveTerrain {
  constructor() { this.period = 1180; }
  ensure() {}
  sample(x) {
    const k = Math.PI * 2 / this.period;
    const y = 410 + 150 * Math.sin(k * x);
    const slope = 150 * k * Math.cos(k * x);
    const second = -150 * k * k * Math.sin(k * x);
    const curvature = second / Math.pow(1 + slope * slope, 1.5);
    return { y, slope, second, curvature };
  }
  height(x) { return this.sample(x).y; }
  frame(x, radius = 0) {
    const s = this.sample(x);
    const length = Math.hypot(1, s.slope);
    const tx = 1 / length;
    const ty = s.slope / length;
    const nx = s.slope / length;
    const ny = -1 / length;
    return { ...s, tx, ty, nx, ny, centerY: s.y - radius * length };
  }
}

const terrain = new WaveTerrain();
const config = {
  gravity: 455,
  groundGravity: 650,
  groundDiveExtraGravity: 520,
  airDiveExtraGravity: 1350,
  rollingResistance: 1.6,
  rollingSpeedDrag: 0.0009,
  rollingInertiaFactor: 1.34,
  detachForceMargin: 42,
  minGroundContact: 0.075,
  maxSpeedSafety: 2350,
  airDrag: 0.000012,
  goodRetention: 0.985
};
const x = 0.25 * terrain.period;
const frame = terrain.frame(x, 24);
const speed = 720;
const ball = {
  x,
  y: frame.centerY,
  vx: frame.tx * speed,
  vy: frame.ty * speed,
  radius: 24,
  grounded: true,
  groundSpeed: speed,
  groundTime: 1
};

const route = routes.predictReleaseRoute(terrain, config, ball);
assert(route, 'predictor did not find a playable route');
assert(route.landing.tangent > 0, 'predicted landing reverses momentum');
assert(route.landing.normalImpact < 1250, `predicted impact too hard: ${route.landing.normalImpact}`);
assert(route.points.length >= 5, 'route has too few samples');

const coins = routes.buildCoinLine(route, terrain, 24);
assert(coins.length >= 4 && coins.length <= 9, `coin count outside v14 limits: ${coins.length}`);
for (let i = 1; i < coins.length; i++) {
  const spacing = Math.hypot(coins[i].x - coins[i - 1].x, coins[i].y - coins[i - 1].y);
  assert(spacing >= 70, `coins overlap at ${spacing}`);
}
for (const coin of coins) {
  const ground = terrain.frame(coin.x, 24).centerY;
  assert(coin.y <= ground, 'coin is inside terrain');
}

const world = { ball: { ...ball }, config };
const field = new SmartCoinField({ world, terrain, routes, onCollect() {} });
field.cancelScheduled();
for (let i = 0; i < 5; i++) field.generateOne(false);
field.cancelScheduled();
const snapshot = field.snapshot();
assert(snapshot.routes <= 3, `too many routes: ${snapshot.routes}`);
assert(snapshot.coins <= 27, `too many coins: ${snapshot.coins}`);
for (let i = 0; i < field.items.length; i++) {
  for (let j = i + 1; j < field.items.length; j++) {
    const a = field.items[i];
    const b = field.items[j];
    if (Math.abs(a.x - b.x) > 82) break;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    assert(distance >= 78, `field contains overlapping coins: ${distance}`);
  }
}

console.log(JSON.stringify({
  status: 'pass',
  routeDistance: Number(route.distance.toFixed(1)),
  routeAirtime: Number(route.airtime.toFixed(2)),
  landingAngle: Number(route.landing.landingAngle.toFixed(3)),
  normalImpact: Number(route.landing.normalImpact.toFixed(1)),
  control: route.control,
  coinsOnRoute: coins.length,
  field: snapshot
}, null, 2));
