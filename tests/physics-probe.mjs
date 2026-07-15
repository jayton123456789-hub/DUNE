import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PhysicsWorld, SplineTerrain } = require('../src/physics-core.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function simulate(world, seconds, input) {
  const dt = 1 / 120;
  const events = [];
  let maxAltitude = 0;
  for (let step = 0; step < seconds / dt; step++) {
    const held = input(world, step * dt);
    const batch = world.step(dt, held);
    events.push(...batch);
    const altitude = world.terrain.frame(world.ball.x, world.ball.radius).centerY - world.ball.y;
    maxAltitude = Math.max(maxAltitude, altitude);
    if (batch.some(event => event.type === 'crash' || event.type === 'stall')) break;
  }
  return { events, maxAltitude, state: { ...world.ball } };
}

const opening = new PhysicsWorld({ seed: 12345 });
const openingResult = simulate(opening, 5, world => {
  if (world.ball.grounded) return world.ball.x < 760;
  const altitude = world.terrain.frame(world.ball.x, world.ball.radius).centerY - world.ball.y;
  return world.ball.vy > 0 && altitude < 270;
});
const openingLaunch = openingResult.events.find(event => event.type === 'launch');
const openingLanding = openingResult.events.find(event => event.type === 'landing');
assert(openingLaunch, 'opening route never launched');
assert(openingLaunch.x > 860 && openingLaunch.x < 1120, `opening launch at wrong position: ${openingLaunch.x}`);
assert(openingResult.maxAltitude > 80, `opening jump too low: ${openingResult.maxAltitude}`);
assert(openingResult.maxAltitude < 700, `opening jump reaches high-altitude tiers too easily: ${openingResult.maxAltitude}`);
assert(openingLanding, 'opening route never returned to the ground');

function forceLanding({ tangentSpeed, normalSpeed }) {
  const world = new PhysicsWorld({ seed: 44 });
  const x = 3100;
  const frame = world.terrain.frame(x, world.ball.radius);
  world.ball.grounded = false;
  world.ball.x = x;
  world.ball.y = frame.centerY + 1;
  world.ball.vx = frame.tx * tangentSpeed - frame.nx * normalSpeed;
  world.ball.vy = frame.ty * tangentSpeed - frame.ny * normalSpeed;
  world.flight = { airtime: 1.1, launchX: x - 500, launchY: frame.centerY - 100, launchSpeed: 650, maxAltitude: 220, maxSpeed: 760, distance: 500 };
  world.resolveSweptCollision(x - 2, frame.centerY - 2, x + 2, frame.centerY + 2);
  return { world, events: world.consumeEvents() };
}

const perfect = forceLanding({ tangentSpeed: 620, normalSpeed: 70 });
const perfectEvent = perfect.events.find(event => event.type === 'landing');
assert(perfectEvent?.grade === 'perfect', 'aligned landing was not graded perfect');
assert(perfectEvent.bonus === 0, 'perfect landing still manufactures a speed bonus');
assert(perfectEvent.speed <= perfectEvent.tangentSpeed, 'perfect landing creates momentum');

const rough = forceLanding({ tangentSpeed: 540, normalSpeed: 720 });
const roughEvent = rough.events.find(event => event.type === 'landing');
assert(roughEvent && ['rough', 'hard'].includes(roughEvent.grade), 'survivable hard landing incorrectly ended the run');
assert(rough.world.ball.grounded, 'survivable hard landing did not continue rolling');
assert(roughEvent.speed < roughEvent.tangentSpeed, 'rough landing did not lose speed');

const backward = forceLanding({ tangentSpeed: -60, normalSpeed: 120 });
assert(backward.events.some(event => event.type === 'crash' && event.reason === 'backward'), 'backward landing did not end the run');

const normalMass = new PhysicsWorld({ seed: 222, config: { massKg: 136.0777 } });
const hugeMass = new PhysicsWorld({ seed: 222, config: { massKg: 453592.37 } });
for (let index = 0; index < 360; index++) {
  const held = index < 210;
  normalMass.step(1 / 120, held);
  hugeMass.step(1 / 120, held);
}
assert(Math.abs(normalMass.ball.x - hugeMass.ball.x) < 1e-9, 'mass incorrectly changes gravitational motion');
assert(Math.abs(normalMass.ball.vx - hugeMass.ball.vx) < 1e-9, 'mass incorrectly changes velocity');

let measuredMaxSlope = 0;
let measuredMaxCurvature = 0;
let shortestSegment = Infinity;
let longestSegment = 0;
let smallSegments = 0;
let mediumSegments = 0;
let largeSegments = 0;
const featureCounts = new Map();
for (let seed = 1; seed <= 28; seed++) {
  const terrain = new SplineTerrain({ seed });
  terrain.ensure(45000);
  for (const feature of terrain.featureLog) featureCounts.set(feature, (featureCounts.get(feature) || 0) + 1);
  for (let index = 1; index < terrain.points.length; index++) {
    const width = terrain.points[index].x - terrain.points[index - 1].x;
    shortestSegment = Math.min(shortestSegment, width);
    longestSegment = Math.max(longestSegment, width);
    if (width < 300) smallSegments++;
    else if (width < 500) mediumSegments++;
    else largeSegments++;
  }
  for (let x = 0; x < 45000; x += 7) {
    const sample = terrain.sample(x);
    measuredMaxSlope = Math.max(measuredMaxSlope, Math.abs(sample.slope));
    measuredMaxCurvature = Math.max(measuredMaxCurvature, Math.abs(sample.curvature));
  }
}
assert(measuredMaxSlope <= 1.22, `terrain slope exceeds limit: ${measuredMaxSlope}`);
assert(measuredMaxCurvature <= 0.014, `terrain curvature exceeds limit: ${measuredMaxCurvature}`);
assert(shortestSegment >= 190, `terrain feature is too dense: ${shortestSegment}`);
assert(longestSegment <= 780, `terrain channel is too long: ${longestSegment}`);
assert(smallSegments > 40 && mediumSegments > 40 && largeSegments > 40, 'terrain lacks small/medium/large scale variety');
for (const feature of ['rollers', 'bowl', 'channel', 'double', 'mega']) {
  assert((featureCounts.get(feature) || 0) > 5, `terrain generator rarely produced ${feature} features`);
}

const crest = new PhysicsWorld({ seed: 9 });
crest.ball.x = 970;
const crestFrame = crest.terrain.frame(crest.ball.x, crest.ball.radius);
crest.ball.y = crestFrame.centerY;
crest.ball.grounded = true;
crest.ball.groundTime = 1;
crest.ball.groundSpeed = 760;
crest.ball.vx = crestFrame.tx * 760;
crest.ball.vy = crestFrame.ty * 760;
let crestLaunch = false;
for (let index = 0; index < 180; index++) {
  const events = crest.step(1 / 120, false);
  if (events.some(event => event.type === 'launch')) { crestLaunch = true; break; }
}
assert(crestLaunch, 'high-speed crest remained glued to terrain');

console.log(JSON.stringify({
  status: 'pass',
  openingLaunchX: Number(openingLaunch.x.toFixed(1)),
  openingMaxAltitude: Number(openingResult.maxAltitude.toFixed(1)),
  openingLanding: openingLanding.grade,
  perfectCreatesSpeed: false,
  roughLandingSurvives: true,
  backwardLandingFails: true,
  massIndependent: true,
  highSpeedSeparation: true,
  maxSlope: Number(measuredMaxSlope.toFixed(4)),
  maxCurvature: Number(measuredMaxCurvature.toFixed(6)),
  segmentRange: [Number(shortestSegment.toFixed(1)), Number(longestSegment.toFixed(1))],
  segmentVariety: { small: smallSegments, medium: mediumSegments, large: largeSegments },
  featureCounts: Object.fromEntries(featureCounts)
}, null, 2));
