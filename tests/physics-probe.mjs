import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PhysicsWorld, SplineTerrain } = require('../src/physics-core.js');

const assert = (condition, message) => { if (!condition) throw new Error(message); };

function flowRun(seed, seconds = 35) {
  const world = new PhysicsWorld({ seed });
  let launches = 0;
  let landings = 0;
  let maxAltitude = 0;
  let end = null;
  for (let step = 0; step < seconds * 120; step++) {
    const frame = world.terrain.frame(world.ball.x, world.ball.radius);
    const altitude = frame.centerY - world.ball.y;
    const held = world.ball.grounded
      ? frame.slope > 0.015
      : world.ball.vy > -80 && altitude < 900;
    const events = world.step(1 / 120, held);
    maxAltitude = Math.max(maxAltitude, altitude);
    for (const event of events) {
      if (event.type === 'launch') launches++;
      if (event.type === 'landing') landings++;
      if (event.type === 'crash' || event.type === 'stall') end = event.type;
    }
    if (end) break;
  }
  return { distance: world.ball.x, launches, landings, maxAltitude, end };
}

const flowResults = [];
for (let seed = 1; seed <= 24; seed++) flowResults.push(flowRun(seed));
assert(Math.min(...flowResults.map(result => result.distance)) > 5000, 'a seeded route becomes impossible before five kilometres of world distance');
assert(Math.min(...flowResults.map(result => result.launches)) >= 4, 'a seeded route cannot chain at least four natural launches');
assert(flowResults.reduce((sum, result) => sum + result.distance, 0) / flowResults.length > 7500, 'average multi-hill flow is too short');

const released = new PhysicsWorld({ seed: 3 });
const diving = new PhysicsWorld({ seed: 3 });
for (const world of [released, diving]) {
  world.ball.grounded = false;
  world.ball.x = 1500;
  world.ball.y = -900;
  world.ball.vx = 650;
  world.ball.vy = -420;
}
for (let step = 0; step < 120; step++) {
  released.step(1 / 120, false);
  diving.step(1 / 120, true);
}
assert(released.ball.y < diving.ball.y - 350, 'release state is not meaningfully floatier than dive state');

let maxSlope = 0;
let maxCurvature = 0;
let minWidth = Infinity;
let maxWidth = 0;
let longDownhills = [];
let divotCount = 0;
const featureCounts = new Map();
for (let seed = 1; seed <= 30; seed++) {
  const terrain = new SplineTerrain({ seed });
  terrain.ensure(50000);
  for (const feature of terrain.featureLog) featureCounts.set(feature, (featureCounts.get(feature) || 0) + 1);
  for (let index = 1; index < terrain.points.length; index++) {
    const width = terrain.points[index].x - terrain.points[index - 1].x;
    minWidth = Math.min(minWidth, width);
    maxWidth = Math.max(maxWidth, width);
    const kind = terrain.points[index].kind;
    if (kind.includes('divot') || kind.includes('pocket') || kind.includes('dip')) divotCount++;
    if (kind === 'long-deep-valley' && index >= 2) longDownhills.push(terrain.points[index].x - terrain.points[index - 2].x);
  }
  for (let x = 0; x < 50000; x += 7) {
    const sample = terrain.sample(x);
    maxSlope = Math.max(maxSlope, Math.abs(sample.slope));
    maxCurvature = Math.max(maxCurvature, Math.abs(sample.curvature));
  }
}
assert(maxSlope > 1.25, 'terrain never generates sharper slopes');
assert(maxSlope <= 1.42, `terrain slope exceeds safe limit: ${maxSlope}`);
assert(maxCurvature <= 0.016, `terrain curvature exceeds safe limit: ${maxCurvature}`);
assert(minWidth >= 170 && maxWidth <= 700, `terrain spacing outside safe range: ${minWidth}-${maxWidth}`);
assert(Math.min(...longDownhills) > 680, 'long downhill section is too short');
assert(longDownhills.reduce((sum, width) => sum + width, 0) / longDownhills.length > 850, 'average downhill does not last long enough');
assert(divotCount > 1200, 'terrain does not contain enough divots');
for (const feature of ['long-dive', 'divots', 'basin', 'channel', 'sharp-sequence', 'mega']) {
  assert((featureCounts.get(feature) || 0) >= 8, `${feature} terrain is underrepresented`);
}

const roughWorld = new PhysicsWorld({ seed: 77 });
const impactX = 3500;
const impactFrame = roughWorld.terrain.frame(impactX, roughWorld.ball.radius);
roughWorld.ball.grounded = false;
roughWorld.ball.x = impactX;
roughWorld.ball.y = impactFrame.centerY + 1;
roughWorld.ball.vx = impactFrame.tx * 560 - impactFrame.nx * 760;
roughWorld.ball.vy = impactFrame.ty * 560 - impactFrame.ny * 760;
roughWorld.flight = { airtime: 1.5, launchX: 2800, launchY: impactFrame.centerY - 180, launchSpeed: 720, maxAltitude: 300, maxSpeed: 900, distance: 700 };
roughWorld.resolveSweptCollision(impactX - 2, impactFrame.centerY - 2, impactX + 2, impactFrame.centerY + 2);
const roughEvent = roughWorld.consumeEvents().find(event => event.type === 'landing');
assert(roughEvent && roughWorld.ball.grounded, 'survivable rough landing incorrectly ends the run');
assert(roughEvent.speed > 300, 'rough landing removes too much usable momentum');

console.log(JSON.stringify({
  status: 'pass',
  flow: {
    minimumDistance: Number(Math.min(...flowResults.map(result => result.distance)).toFixed(1)),
    averageDistance: Number((flowResults.reduce((sum, result) => sum + result.distance, 0) / flowResults.length).toFixed(1)),
    minimumLaunches: Math.min(...flowResults.map(result => result.launches))
  },
  floatDifference: Number((diving.ball.y - released.ball.y).toFixed(1)),
  terrain: {
    maxSlope: Number(maxSlope.toFixed(4)),
    maxCurvature: Number(maxCurvature.toFixed(6)),
    widthRange: [Number(minWidth.toFixed(1)), Number(maxWidth.toFixed(1))],
    minimumLongDownhill: Number(Math.min(...longDownhills).toFixed(1)),
    averageLongDownhill: Number((longDownhills.reduce((sum, width) => sum + width, 0) / longDownhills.length).toFixed(1)),
    divotCount,
    featureCounts: Object.fromEntries(featureCounts)
  },
  roughLandingSpeed: Number(roughEvent.speed.toFixed(1))
}, null, 2));
