import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PhysicsWorld, SplineTerrain } = require('../src/physics-core.js');
const { CurvePilot } = require('../src/autopilot.js');

const TEST_SEEDS = 64;
const TERRAIN_DISTANCE = 50_000;
const RADIUS = 24;

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function inspectTerrain() {
  const metrics = {
    minWidth: Infinity,
    maxWidth: 0,
    maxWidthRatio: 0,
    maxSlope: 0,
    maxCurvature: 0,
    maxFrameCurvature: 0,
    maxGroundHeightJoinGap: 0,
    maxGroundSlopeJoinGap: 0,
    maxGroundSecondJoinGap: 0,
    maxCenterHeightJoinGap: 0,
    maxCenterAngleJoinGap: 0,
    maxCenterCurvatureJoinGap: 0
  };
  const joinEpsilon = 0.05;

  for (let seed = 1; seed <= TEST_SEEDS; seed += 1) {
    const terrain = new SplineTerrain({ seed });
    // Leave a guard after the measured area because frame() samples around x.
    terrain.ensure(TERRAIN_DISTANCE + 3_000);
    const measuredPoints = terrain.points.filter(point => point.x <= TERRAIN_DISTANCE);
    const joinXs = measuredPoints.slice(1).map(point => point.x);

    // Index 0-7 is the deliberately authored opening. Index 8 onward must
    // obey the procedural spacing contract enforced by safeWidth().
    for (let index = 8; index < measuredPoints.length; index += 1) {
      const width = measuredPoints[index].x - measuredPoints[index - 1].x;
      metrics.minWidth = Math.min(metrics.minWidth, width);
      metrics.maxWidth = Math.max(metrics.maxWidth, width);
      if (index > 8) {
        const previousWidth = measuredPoints[index - 1].x - measuredPoints[index - 2].x;
        metrics.maxWidthRatio = Math.max(
          metrics.maxWidthRatio,
          width / previousWidth,
          previousWidth / width
        );
      }
    }

    for (let x = 4_300; x <= TERRAIN_DISTANCE; x += 12) {
      const sample = terrain.sample(x);
      const frame = terrain.frame(x, RADIUS);
      metrics.maxSlope = Math.max(metrics.maxSlope, Math.abs(sample.slope));
      metrics.maxCurvature = Math.max(metrics.maxCurvature, Math.abs(sample.curvature));
      metrics.maxFrameCurvature = Math.max(metrics.maxFrameCurvature, Math.abs(frame.curvature));
    }

    for (const x of joinXs) {
      const left = terrain.sample(x - joinEpsilon);
      const right = terrain.sample(x + joinEpsilon);
      const leftFrame = terrain.frame(x - joinEpsilon, RADIUS);
      const rightFrame = terrain.frame(x + joinEpsilon, RADIUS);

      metrics.maxGroundHeightJoinGap = Math.max(
        metrics.maxGroundHeightJoinGap,
        Math.abs(left.y - right.y)
      );
      metrics.maxGroundSlopeJoinGap = Math.max(
        metrics.maxGroundSlopeJoinGap,
        Math.abs(left.slope - right.slope)
      );
      metrics.maxGroundSecondJoinGap = Math.max(
        metrics.maxGroundSecondJoinGap,
        Math.abs(left.second - right.second)
      );
      metrics.maxCenterHeightJoinGap = Math.max(
        metrics.maxCenterHeightJoinGap,
        Math.abs(leftFrame.centerY - rightFrame.centerY)
      );
      metrics.maxCenterAngleJoinGap = Math.max(
        metrics.maxCenterAngleJoinGap,
        Math.abs(Math.atan(leftFrame.slope) - Math.atan(rightFrame.slope))
      );
      metrics.maxCenterCurvatureJoinGap = Math.max(
        metrics.maxCenterCurvatureJoinGap,
        Math.abs(leftFrame.curvature - rightFrame.curvature)
      );
    }
  }

  assert.ok(metrics.minWidth >= 300, `procedural span is too narrow: ${metrics.minWidth}`);
  assert.ok(metrics.maxWidth <= 880.001, `procedural span is too wide: ${metrics.maxWidth}`);
  assert.ok(metrics.maxWidthRatio <= 2.6, `adjacent span ratio is abrupt: ${metrics.maxWidthRatio}`);
  assert.ok(metrics.maxSlope <= 1.281, `terrain exceeds its slope budget: ${metrics.maxSlope}`);
  assert.ok(metrics.maxCurvature <= 0.0125, `ground exceeds its curvature budget: ${metrics.maxCurvature}`);
  assert.ok(metrics.maxFrameCurvature <= 0.013, `ball path exceeds its curvature budget: ${metrics.maxFrameCurvature}`);

  // These compare the two limiting sides of every knot. A visible C0/C1 seam
  // misses these limits by orders of magnitude; the quintic C2 joins remain
  // effectively identical for both the ground and radius-offset ball path.
  assert.ok(metrics.maxGroundHeightJoinGap < 1e-5, `ground position seam: ${metrics.maxGroundHeightJoinGap}`);
  assert.ok(metrics.maxGroundSlopeJoinGap < 2e-6, `ground tangent seam: ${metrics.maxGroundSlopeJoinGap}`);
  assert.ok(metrics.maxGroundSecondJoinGap < 3e-5, `ground curvature seam: ${metrics.maxGroundSecondJoinGap}`);
  assert.ok(metrics.maxCenterHeightJoinGap < 1e-5, `ball-center position seam: ${metrics.maxCenterHeightJoinGap}`);
  assert.ok(metrics.maxCenterAngleJoinGap < 4e-5, `ball-center tangent seam: ${metrics.maxCenterAngleJoinGap}`);
  assert.ok(metrics.maxCenterCurvatureJoinGap < 3e-5, `ball-center curvature seam: ${metrics.maxCenterCurvatureJoinGap}`);

  return metrics;
}

function verifyOpeningRunway() {
  const world = new PhysicsWorld({ seed: 1 });
  const startFrame = world.terrain.frame(world.ball.x, world.ball.radius);
  assert.ok(startFrame.slope > 0.1, `opening should begin on a smooth descent, got ${startFrame.slope}`);

  let terminalEvent = null;
  for (let step = 0; step < 12 * 120; step += 1) {
    const events = world.step(1 / 120, false);
    terminalEvent ||= events.find(event => event.type === 'crash' || event.type === 'stall') || null;
    if (terminalEvent) break;
  }

  assert.equal(terminalEvent, null, `no-input opening ended with ${terminalEvent?.type}`);
  assert.ok(world.ball.x > 3_500, `no-input opening did not carry the ball far enough: ${world.ball.x}`);
  return world.ball.x;
}

function simulatePilot(seed, seconds = 35) {
  const world = new PhysicsWorld({ seed });
  const pilot = new CurvePilot({ world, terrain: world.terrain });
  pilot.reset('test');
  let launches = 0;
  let landings = 0;
  let terminal = 'timeout';
  let terminalTime = seconds;

  for (let step = 0; step < seconds * 120; step += 1) {
    const held = pilot.update(1 / 120);
    const events = world.step(1 / 120, held);
    for (const event of events) {
      if (event.type === 'launch') launches += 1;
      if (event.type === 'landing') landings += 1;
      if (event.type === 'crash' || event.type === 'stall') {
        terminal = event.type;
        terminalTime = step / 120;
      }
    }
    if (terminal !== 'timeout') break;
  }

  return { seed, x: world.ball.x, launches, landings, terminal, terminalTime };
}

function verifySeededSurvival() {
  const results = Array.from({ length: TEST_SEEDS }, (_, index) => simulatePilot(index + 1));
  const sorted = [...results].sort((a, b) => a.x - b.x);
  const minimum = sorted[0];
  const p10 = percentile(sorted, 0.1);
  const median = percentile(sorted, 0.5);
  const average = results.reduce((total, result) => total + result.x, 0) / results.length;

  assert.ok(minimum.x > 6_000, `seed ${minimum.seed} ends too early at ${minimum.x}`);
  assert.ok(p10.x > 7_000, `10th-percentile route is too short: ${p10.x}`);
  assert.ok(median.x > 9_500, `median route is too short: ${median.x}`);
  assert.ok(average > 11_000, `average route is too short: ${average}`);
  assert.equal(results.filter(result => result.x < 4_300).length, 0, 'a seed failed inside the authored opening');
  assert.ok(minimum.terminalTime > 12, `seed ${minimum.seed} fails before a player can learn the loop`);

  return { minimum, p10, median, average };
}

function verifyDiveControl() {
  const released = new PhysicsWorld({ seed: 3 });
  const diving = new PhysicsWorld({ seed: 3 });
  for (const world of [released, diving]) {
    world.ball.grounded = false;
    world.ball.x = 1_500;
    world.ball.y = -900;
    world.ball.vx = 650;
    world.ball.vy = -420;
  }
  for (let step = 0; step < 120; step += 1) {
    released.step(1 / 120, false);
    diving.step(1 / 120, true);
  }
  const difference = diving.ball.y - released.ball.y;
  assert.ok(difference > 350, `hold input does not create a meaningful dive: ${difference}`);
  return difference;
}

function verifyOpeningRecovery() {
  const world = new PhysicsWorld({ seed: 9 });
  const x = 1_500;
  const frame = world.terrain.frame(x, world.ball.radius);

  function forceHardImpact() {
    world.ball.grounded = false;
    world.ball.x = x;
    world.ball.y = frame.centerY - 1;
    world.ball.vx = frame.tx * 600 - frame.nx * 2_200;
    world.ball.vy = frame.ty * 600 - frame.ny * 2_200;
    world.flight = world.freshFlight(x - 500, frame.centerY - 300, 800);
    world.flight.airtime = 1;
    world.resolveSweptCollision(x - 2, frame.centerY - 2, x + 2, frame.centerY + 2);
    return world.consumeEvents()[0];
  }

  const recovery = forceHardImpact();
  assert.equal(recovery?.type, 'landing', 'first opening impact should be rescued');
  assert.equal(recovery?.grade, 'recovery', 'opening safety net should report a recovery landing');
  assert.equal(recovery?.assisted, true, 'recovery landing should be marked assisted');
  assert.equal(world.ball.grounded, true, 'recovery should settle the ball on the terrain');
  assert.ok(world.ball.groundSpeed >= 205, 'recovery should retain enough speed to continue');

  const secondImpact = forceHardImpact();
  assert.equal(secondImpact?.type, 'crash', 'opening safety net must only rescue one impact');
  return recovery.speed;
}

const startedAt = Date.now();
const terrain = inspectTerrain();
const openingDistance = verifyOpeningRunway();
const survival = verifySeededSurvival();
const diveDifference = verifyDiveControl();
const recoverySpeed = verifyOpeningRecovery();

console.log(JSON.stringify({
  status: 'pass',
  elapsedMs: Date.now() - startedAt,
  terrain: {
    widthRange: [Number(terrain.minWidth.toFixed(1)), Number(terrain.maxWidth.toFixed(1))],
    maxAdjacentWidthRatio: Number(terrain.maxWidthRatio.toFixed(3)),
    maxSlope: Number(terrain.maxSlope.toFixed(4)),
    maxGroundCurvature: Number(terrain.maxCurvature.toFixed(6)),
    maxBallPathCurvature: Number(terrain.maxFrameCurvature.toFixed(6)),
    maxJoinAngleDegrees: Number((terrain.maxCenterAngleJoinGap * 180 / Math.PI).toFixed(5))
  },
  opening: {
    noInputDistance: Number(openingDistance.toFixed(1)),
    recoverySpeed: Number(recoverySpeed.toFixed(1))
  },
  seededSurvival: {
    seeds: TEST_SEEDS,
    minimumDistance: Number(survival.minimum.x.toFixed(1)),
    p10Distance: Number(survival.p10.x.toFixed(1)),
    medianDistance: Number(survival.median.x.toFixed(1)),
    averageDistance: Number(survival.average.toFixed(1))
  },
  diveDifference: Number(diveDifference.toFixed(1))
}, null, 2));
