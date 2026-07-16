import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PhysicsWorld } = require('../src/physics-core.js');
const routes = require('../src/coin-routes.js');
const { SmartCoinField } = require('../src/coin-field.js');

const world = new PhysicsWorld({ seed: 0xdecafbad });
const { terrain, config } = world;
const radius = world.ball.radius;

// This is deliberately the real authored opening, not the old sine-wave test
// double. It catches route/physics drift that would leave the first screen
// without a readable collectible arc.
const route = routes.predictReleaseRoute(terrain, config, world.ball, {
  dt: 1 / 120,
  maxGroundSeconds: 8,
  maxAirSeconds: 7,
  minAirtime: 0.3,
  minDistance: 150,
  minAltitude: 16
});

assert.ok(route, 'the real opening terrain should produce a playable predicted route');
assert.ok(route.launch.x > 2_000 && route.launch.x < 2_600, `opening launch moved out of its intended window: ${route.launch.x}`);
assert.ok(route.distance > 800, `opening flight is too short for a readable coin line: ${route.distance}`);
assert.ok(route.airtime > 1.2, `opening flight is too brief: ${route.airtime}`);
assert.ok(route.maxAltitude > 180, `opening flight is too flat: ${route.maxAltitude}`);
assert.ok(route.landing.tangent > 0, 'predicted opening landing reverses the ball');
assert.ok(route.landing.normalImpact < config.crashNormalSpeed, `opening route predicts a fatal impact: ${route.landing.normalImpact}`);
assert.ok(route.landing.landingAngle < config.crashAngle, `opening route predicts a fatal angle: ${route.landing.landingAngle}`);

const coins = routes.buildCoinLine(route, terrain, radius);
assert.ok(coins.length >= 5 && coins.length <= 9, `opening route coin count is invalid: ${coins.length}`);
for (let index = 0; index < coins.length; index += 1) {
  const coin = coins[index];
  const ground = terrain.frame(coin.x, radius).centerY;
  assert.ok(coin.y <= ground - 2.5, `coin ${index} intersects the terrain`);
  assert.ok(coin.x > route.launch.x && coin.x < route.landing.x, `coin ${index} falls outside its route`);
  if (index > 0) {
    const previous = coins[index - 1];
    const spacing = Math.hypot(coin.x - previous.x, coin.y - previous.y);
    assert.ok(spacing >= 78, `route coins overlap at ${spacing}`);
    assert.ok(coin.fraction > previous.fraction, 'route coin fractions must be ordered');
  }
}

let collected = 0;
const field = new SmartCoinField({
  world,
  terrain,
  routes,
  onCollect() { collected += 1; }
});
field.cancelScheduled();

const initial = field.snapshot();
assert.equal(initial.routes, 1, 'coin field should synchronously seed the opening route');
assert.ok(initial.coins >= 9, `coin field should include warmup pickups and the opening arc: ${initial.coins} coins`);
assert.ok(initial.coins <= initial.maxItems, 'coin field exceeds its item budget');
const warmup = field.items.filter(coin => coin.warmup);
assert.equal(warmup.length, 5, 'opening should have five grounded warmup pickups');
for (let index = 0; index < warmup.length; index += 1) {
  const coin = warmup[index];
  const sandY = terrain.height(coin.x);
  assert.ok(sandY - coin.y > radius + 7, `warmup coin ${index} is too close to the sand`);
  if (index > 0) assert.ok(coin.x - warmup[index - 1].x >= 350, 'warmup coin rhythm is cramped');
}
assert.ok(field.needsMore(), 'one opening route should leave room for one prefetched route');
assert.equal(field.generateOne(), true, 'coin field should predict a follow-up route from the opening landing');
field.cancelScheduled();
const prefetched = field.snapshot();
assert.equal(prefetched.routes, prefetched.maxRoutes, 'field should stop at its scheduled route budget');
assert.ok(prefetched.coins <= prefetched.maxItems, 'prefetch should respect the total coin budget');
assert.equal(field.needsMore(), false, 'full route budget should not schedule more work');

for (let index = 1; index < field.items.length; index += 1) {
  const previous = field.items[index - 1];
  const coin = field.items[index];
  if (Math.abs(coin.x - previous.x) > field.minimumCoinSpacing) continue;
  const spacing = Math.hypot(coin.x - previous.x, coin.y - previous.y);
  assert.ok(spacing >= field.minimumCoinSpacing, `coin field contains an overlap at ${spacing}`);
}

const firstCoin = field.items.find(coin => !coin.taken);
world.ball.x = firstCoin.x;
world.ball.y = firstCoin.y;
field.collect();
assert.equal(firstCoin.taken, true, 'ball should collect a coin on contact');
assert.equal(collected, 1, 'coin collection callback should fire exactly once');
field.collect();
assert.equal(collected, 1, 'a taken coin must not collect twice');

const assistedCoin = field.items.find(coin => !coin.taken);
world.ball.x = assistedCoin.x;
world.ball.y = assistedCoin.y + world.ball.radius + 24;
field.collect();
assert.equal(assistedCoin.taken, true, 'a near-touch should collect inside the mobile assist envelope');
assert.equal(collected, 2, 'assisted pickup should fire one collection callback');

console.log(JSON.stringify({
  status: 'pass',
  openingRoute: {
    launchX: Number(route.launch.x.toFixed(1)),
    landingX: Number(route.landing.x.toFixed(1)),
    distance: Number(route.distance.toFixed(1)),
    airtime: Number(route.airtime.toFixed(2)),
    altitude: Number(route.maxAltitude.toFixed(1)),
    normalImpact: Number(route.landing.normalImpact.toFixed(1)),
    coins: coins.length
  },
  field: prefetched,
  collectionCallbacks: collected
}, null, 2));
