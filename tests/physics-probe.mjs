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
    maxAltitude = Math.max(maxAltitude, world.flight.maxAltitude || 0);
    if (batch.some(event => event.type === 'crash' || event.type === 'stall')) break;
  }
  return { events, maxAltitude, state: world.ball };
}

const opening = new PhysicsWorld({ seed: 12345 });
const openingResult = simulate(opening, 8, world => {
  if (!world.ball.grounded) return false;
  return world.ball.x < 835;
});
const launches = openingResult.events.filter(event => event.type === 'launch');
assert(launches.length >= 1, 'opening route never launched');
assert(launches[0].x > 800 && launches[0].x < 1190, `opening launch at wrong position: ${launches[0].x}`);
assert(openingResult.maxAltitude > 70, `opening jump too low: ${openingResult.maxAltitude}`);

const controlled = new PhysicsWorld({ seed: 1 });
const controlledResult = simulate(controlled, 14, world => {
  const frame = world.terrain.frame(world.ball.x, world.ball.radius);
  const altitude = frame.centerY - world.ball.y;
  if (world.ball.grounded) return frame.slope > 0.015;
  return world.ball.vy > 0 && altitude < 400;
});
const controlledLaunches = controlledResult.events.filter(event => event.type === 'launch');
const controlledLandings = controlledResult.events.filter(event => event.type === 'landing');
assert(controlledLaunches.length >= 2, `controlled route produced only ${controlledLaunches.length} launch(es)`);
assert(controlledLandings.length >= 1, 'controlled route could not land and continue');

const normalMass = new PhysicsWorld({ seed: 222, config: { massKg: 136.0777 } });
const hugeMass = new PhysicsWorld({ seed: 222, config: { massKg: 453592.37 } });
for (let i = 0; i < 240; i++) {
  const held = i < 150;
  normalMass.step(1 / 120, held);
  hugeMass.step(1 / 120, held);
}
assert(Math.abs(normalMass.ball.x - hugeMass.ball.x) < 1e-9, 'mass incorrectly changes gravitational motion');
assert(Math.abs(normalMass.ball.vx - hugeMass.ball.vx) < 1e-9, 'mass incorrectly changes velocity');

let measuredMaxSlope = 0;
let measuredMaxCurvature = 0;
let longestSegment = 0;
let shortestSegment = Infinity;
for (let seed = 1; seed <= 24; seed++) {
  const terrain = new SplineTerrain({ seed });
  terrain.ensure(40000);
  for (let i = 1; i < terrain.points.length; i++) {
    const width = terrain.points[i].x - terrain.points[i - 1].x;
    longestSegment = Math.max(longestSegment, width);
    shortestSegment = Math.min(shortestSegment, width);
  }
  for (let x = 0; x < 40000; x += 8) {
    const sample = terrain.sample(x);
    measuredMaxSlope = Math.max(measuredMaxSlope, Math.abs(sample.slope));
    measuredMaxCurvature = Math.max(measuredMaxCurvature, Math.abs(sample.curvature));
  }
}
assert(measuredMaxSlope <= 1.3, `terrain slope exceeds limit: ${measuredMaxSlope}`);
assert(measuredMaxCurvature <= 0.0077, `terrain curvature exceeds limit: ${measuredMaxCurvature}`);
assert(shortestSegment >= 240, `terrain too dense: ${shortestSegment}`);
assert(longestSegment <= 680, `terrain channel too long: ${longestSegment}`);

const crest = new PhysicsWorld({ seed: 9 });
crest.ball.x = 1010;
const frame = crest.terrain.frame(crest.ball.x, crest.ball.radius);
crest.ball.y = frame.centerY;
crest.ball.grounded = true;
crest.ball.groundSpeed = 760;
crest.ball.vx = frame.tx * 760;
crest.ball.vy = frame.ty * 760;
let crestLaunch = false;
for (let i = 0; i < 120; i++) {
  const batch = crest.step(1 / 120, false);
  if (batch.some(event => event.type === 'launch')) { crestLaunch = true; break; }
}
assert(crestLaunch, 'high-speed crest remained glued to terrain');

console.log(JSON.stringify({
  status: 'pass',
  openingLaunchX: Number(launches[0].x.toFixed(1)),
  openingMaxAltitude: Number(openingResult.maxAltitude.toFixed(1)),
  maxSlope: Number(measuredMaxSlope.toFixed(4)),
  maxCurvature: Number(measuredMaxCurvature.toFixed(6)),
  shortestSegment: Number(shortestSegment.toFixed(1)),
  longestSegment: Number(longestSegment.toFixed(1)),
  massIndependent: true,
  highSpeedSeparation: true,
  controlledLaunches: controlledLaunches.length,
  controlledLandings: controlledLandings.length
}, null, 2));