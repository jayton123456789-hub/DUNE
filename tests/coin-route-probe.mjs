import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { predictReleaseRoute, buildCoinLine } = require('../src/coin-route.js');

const config = {
  gravity: 455,
  groundGravity: 690,
  rollingInertiaFactor: 1.34,
  rollingResistance: 1.6,
  rollingSpeedDrag: 0.0009,
  airDrag: 0.000012,
  detachForceMargin: 42,
  minGroundContact: 0.075,
  maxSpeedSafety: 2350
};

class TestTerrain {
  height(x) {
    return 420 + 170 * Math.cos((x - 540) * Math.PI / 600);
  }
  derivatives(x) {
    const phase = (x - 540) * Math.PI / 600;
    const slope = -170 * Math.PI / 600 * Math.sin(phase);
    const second = -170 * Math.PI * Math.PI / (600 * 600) * Math.cos(phase);
    return { slope, second };
  }
  frame(x, radius = 0) {
    const { slope, second } = this.derivatives(x);
    const length = Math.hypot(1, slope);
    const tx = 1 / length;
    const ty = slope / length;
    const nx = slope / length;
    const ny = -1 / length;
    const curvature = second / Math.pow(1 + slope * slope, 1.5);
    return { y: this.height(x), centerY: this.height(x) - radius * length, slope, curvature, tx, ty, nx, ny };
  }
}

const terrain = new TestTerrain();
const radius = 24;
const startX = 120;
const frame = terrain.frame(startX, radius);
const ball = {
  x: startX,
  y: frame.centerY,
  vx: frame.tx * 610,
  vy: frame.ty * 610,
  radius,
  grounded: true,
  groundSpeed: 610,
  groundTime: 1
};

const route = predictReleaseRoute(terrain, config, ball, { maxGroundSeconds: 6 });
if (!route) throw new Error('predictor failed to find a release route');
if (route.airtime < 0.3) throw new Error(`predicted route too short: ${route.airtime}`);
if (route.distance < 120) throw new Error(`predicted route too narrow: ${route.distance}`);

const coins = buildCoinLine(route, terrain, radius, { minCount: 8, maxCount: 14 });
if (coins.length < 8) throw new Error(`too few route coins: ${coins.length}`);
for (const coin of coins) {
  const ground = terrain.frame(coin.x, radius).centerY;
  if (coin.y >= ground) throw new Error('coin generated inside terrain');
}

let maxDistanceFromRoute = 0;
for (const coin of coins) {
  const nearest = Math.min(...route.points.map(point => Math.hypot(point.x - coin.x, point.y - coin.y)));
  maxDistanceFromRoute = Math.max(maxDistanceFromRoute, nearest);
}
if (maxDistanceFromRoute > 20) throw new Error(`coin line drifted too far from predicted ball path: ${maxDistanceFromRoute}`);

console.log(JSON.stringify({
  status: 'pass',
  launchX: Number(route.launch.x.toFixed(1)),
  landingX: Number(route.landing.x.toFixed(1)),
  airtime: Number(route.airtime.toFixed(2)),
  distance: Number(route.distance.toFixed(1)),
  maxAltitude: Number(route.maxAltitude.toFixed(1)),
  coins: coins.length,
  maxDistanceFromRoute: Number(maxDistanceFromRoute.toFixed(2))
}, null, 2));
