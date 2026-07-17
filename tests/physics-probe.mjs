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
    maxFlowCurvature: 0,
    maxFlowFrameCurvature: 0,
    maxSharpFrameCurvature: 0,
    maxGroundHeightJoinGap: 0,
    maxGroundSlopeJoinGap: 0,
    maxGroundSecondJoinGap: 0,
    maxCenterHeightJoinGap: 0,
    maxCenterAngleJoinGap: 0,
    maxCenterCurvatureJoinGap: 0,
    sharpCrests: 0,
    earliestSharpCrest: Infinity,
    latestFirstSharpCrest: 0,
    minimumSharpSpacing: Infinity,
    minimumSharpProminence: Infinity,
    minimumSharpInboundWidth: Infinity,
    minimumSharpOutboundWidth: Infinity,
    maximumSharpRadiusRatio: 0,
    minimumSharpTipCurvature: Infinity,
    maximumRenderCollisionGap: 0,
    maximumSharpApproachSlope: -Infinity,
    minimumSharpExitSlope: Infinity
  };
  // Probe the mathematical limits at each knot. A wider epsilon would report
  // the legitimate slope change around a finite-curvature spike as a seam.
  const joinEpsilon = 0.00001;

  for (let seed = 1; seed <= TEST_SEEDS; seed += 1) {
    const terrain = new SplineTerrain({ seed });
    const duplicate = new SplineTerrain({ seed });
    // Leave a guard after the measured area because frame() samples around x.
    terrain.ensure(TERRAIN_DISTANCE + 3_000);
    duplicate.ensure(TERRAIN_DISTANCE + 3_000);
    assert.deepEqual(duplicate.points, terrain.points, `seed ${seed} does not reproduce identical terrain`);
    const measuredPoints = terrain.points.filter(point => point.x <= TERRAIN_DISTANCE);
    const joinPoints = measuredPoints.slice(1);
    const sharpPoints = terrain.points.filter(point => point.tipCurvature && point.x <= TERRAIN_DISTANCE);
    assert.ok(sharpPoints.length >= 1, `seed ${seed} has no sharp crest in the measured route`);
    metrics.earliestSharpCrest = Math.min(metrics.earliestSharpCrest, sharpPoints[0].x);
    metrics.latestFirstSharpCrest = Math.max(metrics.latestFirstSharpCrest, sharpPoints[0].x);

    for (let sharpIndex = 0; sharpIndex < sharpPoints.length; sharpIndex += 1) {
      const point = sharpPoints[sharpIndex];
      const pointIndex = terrain.points.indexOf(point);
      const before = terrain.points[pointIndex - 1];
      const after = terrain.points[pointIndex + 1];
      assert.ok(before && after, `sharp crest at ${point.x} is missing a landable neighbor`);
      metrics.sharpCrests += 1;
      metrics.minimumSharpProminence = Math.min(
        metrics.minimumSharpProminence,
        before.y - point.y,
        after.y - point.y
      );
      metrics.minimumSharpInboundWidth = Math.min(metrics.minimumSharpInboundWidth, point.x - before.x);
      metrics.minimumSharpOutboundWidth = Math.min(metrics.minimumSharpOutboundWidth, after.x - point.x);
      metrics.maximumSharpRadiusRatio = Math.max(
        metrics.maximumSharpRadiusRatio,
        RADIUS * point.tipCurvature
      );
      metrics.minimumSharpTipCurvature = Math.min(metrics.minimumSharpTipCurvature, point.tipCurvature);
      for (let sampleIndex = 0; sampleIndex <= 24; sampleIndex += 1) {
        const beforeX = before.x + (point.x - before.x) * sampleIndex / 24;
        const afterX = point.x + (after.x - point.x) * sampleIndex / 24;
        const beforeSample = terrain.sample(beforeX);
        const afterSample = terrain.sample(afterX);
        metrics.maximumRenderCollisionGap = Math.max(
          metrics.maximumRenderCollisionGap,
          Math.abs(terrain.height(beforeX) - beforeSample.y),
          Math.abs(terrain.height(afterX) - afterSample.y)
        );
        metrics.maximumSharpApproachSlope = Math.max(metrics.maximumSharpApproachSlope, beforeSample.slope);
        metrics.minimumSharpExitSlope = Math.min(metrics.minimumSharpExitSlope, afterSample.slope);
      }
      if (sharpIndex > 0) {
        metrics.minimumSharpSpacing = Math.min(
          metrics.minimumSharpSpacing,
          point.x - sharpPoints[sharpIndex - 1].x
        );
      }
    }

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
      const segmentStart = terrain.points[sample.index];
      const segmentEnd = terrain.points[sample.index + 1];
      const sharpSpan = Boolean(segmentStart?.tipCurvature || segmentEnd?.tipCurvature);
      metrics.maxSlope = Math.max(metrics.maxSlope, Math.abs(sample.slope));
      metrics.maxCurvature = Math.max(metrics.maxCurvature, Math.abs(sample.curvature));
      metrics.maxFrameCurvature = Math.max(metrics.maxFrameCurvature, Math.abs(frame.curvature));
      if (sharpSpan) {
        metrics.maxSharpFrameCurvature = Math.max(metrics.maxSharpFrameCurvature, Math.abs(frame.curvature));
      } else {
        metrics.maxFlowCurvature = Math.max(metrics.maxFlowCurvature, Math.abs(sample.curvature));
        metrics.maxFlowFrameCurvature = Math.max(metrics.maxFlowFrameCurvature, Math.abs(frame.curvature));
      }
    }

    for (const point of joinPoints) {
      const x = point.x;
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
  assert.ok(metrics.maxFlowCurvature <= 0.0125, `flow ground exceeds its curvature budget: ${metrics.maxFlowCurvature}`);
  assert.ok(metrics.maxFlowFrameCurvature <= 0.013, `flow ball path exceeds its curvature budget: ${metrics.maxFlowFrameCurvature}`);
  assert.ok(metrics.maxCurvature <= 0.0401, `sharp ground exceeds its curvature budget: ${metrics.maxCurvature}`);
  assert.ok(metrics.maxSharpFrameCurvature <= 0.0215, `sharp ball path is too abrupt: ${metrics.maxSharpFrameCurvature}`);
  assert.ok(metrics.earliestSharpCrest > 5_200, `showcase spike arrives too early: ${metrics.earliestSharpCrest}`);
  assert.ok(metrics.latestFirstSharpCrest < 5_700, `showcase spike arrives too late: ${metrics.latestFirstSharpCrest}`);
  assert.ok(metrics.minimumSharpSpacing > 3_000, `sharp crests repeat too closely: ${metrics.minimumSharpSpacing}`);
  assert.ok(metrics.minimumSharpProminence > 280, `sharp crest is not prominent: ${metrics.minimumSharpProminence}`);
  assert.ok(metrics.minimumSharpInboundWidth > 500, `sharp approach is cramped: ${metrics.minimumSharpInboundWidth}`);
  assert.ok(metrics.minimumSharpOutboundWidth > 500, `sharp landing side is cramped: ${metrics.minimumSharpOutboundWidth}`);
  // r*k stays below one, so the ball-radius offset cannot fold over itself at
  // the tip even though the rendered sand is intentionally much sharper.
  assert.ok(metrics.maximumSharpRadiusRatio < 0.96, `sharp collision tip is too abrupt: ${metrics.maximumSharpRadiusRatio}`);
  assert.ok(metrics.minimumSharpTipCurvature > 0.032, `sharp tip is too round: ${metrics.minimumSharpTipCurvature}`);
  assert.equal(metrics.maximumRenderCollisionGap, 0, 'rendered sand and collision terrain diverge');
  assert.ok(metrics.maximumSharpApproachSlope <= 1e-8, `sharp approach hooks backward: ${metrics.maximumSharpApproachSlope}`);
  assert.ok(metrics.minimumSharpExitSlope >= -1e-8, `sharp exit hooks backward: ${metrics.minimumSharpExitSlope}`);

  // These compare the two limiting sides of every knot. A visible C0/C1 seam
  // misses these limits by orders of magnitude; the quintic C2 joins remain
  // effectively identical for both the ground and radius-offset ball path.
  assert.ok(metrics.maxGroundHeightJoinGap < 1e-8, `ground position seam: ${metrics.maxGroundHeightJoinGap}`);
  assert.ok(metrics.maxGroundSlopeJoinGap < 9e-7, `ground tangent seam: ${metrics.maxGroundSlopeJoinGap}`);
  assert.ok(metrics.maxGroundSecondJoinGap < 4e-9, `ground curvature seam: ${metrics.maxGroundSecondJoinGap}`);
  assert.ok(metrics.maxCenterHeightJoinGap < 1e-8, `ball-center position seam: ${metrics.maxCenterHeightJoinGap}`);
  assert.ok(metrics.maxCenterAngleJoinGap < 5e-7, `ball-center tangent seam: ${metrics.maxCenterAngleJoinGap}`);
  assert.ok(metrics.maxCenterCurvatureJoinGap < 4e-9, `ball-center curvature seam: ${metrics.maxCenterCurvatureJoinGap}`);

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

function constantSlopeTerrain(slope) {
  const length = Math.hypot(1, slope);
  return {
    seed: 1,
    reset() { return this; },
    sample(x) {
      return { y: 500 + slope * (x - 120), slope, second: 0, third: 0, curvature: 0, index: 0 };
    },
    height(x) { return 500 + slope * (x - 120); },
    frame(x, radius = 0) {
      const y = 500 + slope * (x - 120);
      return {
        y,
        centerY: y - radius * length,
        slope,
        groundSlope: slope,
        second: 0,
        third: 0,
        curvature: 0,
        groundCurvature: 0,
        tx: 1 / length,
        ty: slope / length,
        nx: slope / length,
        ny: -1 / length,
        length,
        index: 0
      };
    }
  };
}

function verifyForwardDrive() {
  const slopes = [-0.3, -0.6, -1, -1.28];
  const results = [];

  for (const slope of slopes) {
    const released = new PhysicsWorld({ terrain: constantSlopeTerrain(slope) });
    const held = new PhysicsWorld({ terrain: constantSlopeTerrain(slope) });
    for (const world of [released, held]) {
      const frame = world.terrain.frame(world.ball.x, world.ball.radius);
      world.ball.vx = frame.tx * 500;
      world.ball.vy = frame.ty * 500;
      world.ball.groundSpeed = 500;
    }

    let releasedX = released.ball.x;
    let heldX = held.ball.x;
    const terminal = [];
    for (let step = 0; step < 120; step += 1) {
      terminal.push(...released.step(1 / 120, false), ...held.step(1 / 120, true));
      assert.ok(released.ball.x > releasedX, `released ball reversed on slope ${slope}`);
      assert.ok(held.ball.x > heldX, `held ball reversed on slope ${slope}`);
      releasedX = released.ball.x;
      heldX = held.ball.x;
    }

    assert.equal(terminal.some(event => event.type === 'stall'), false, `slope ${slope} emitted a stall`);
    assert.ok(held.ball.groundSpeed > released.ball.groundSpeed, `hold does not help on slope ${slope}`);
    assert.ok(released.ball.groundSpeed >= released.config.minimumForwardSpeed, `coast floor failed on ${slope}`);
    if (slope === -1) {
      assert.ok(held.ball.groundSpeed >= 480, `held uphill speed is too weak: ${held.ball.groundSpeed}`);
    }
    results.push({ slope, released: released.ball.groundSpeed, held: held.ball.groundSpeed });
  }

  return results;
}

function verifyOpeningLaunchPace() {
  const world = new PhysicsWorld({ seed: 1 });
  const pilot = new CurvePilot({ world, terrain: world.terrain });
  let launch = null;
  for (let step = 0; step < 3 * 120 && !launch; step += 1) {
    const events = world.step(1 / 120, pilot.update(1 / 120));
    launch = events.find(event => event.type === 'launch') || null;
  }
  assert.ok(launch, 'opening did not produce a launch');
  assert.ok(world.elapsed < 2.2, `opening launch is too slow: ${world.elapsed}`);
  assert.ok(launch.x < 1_400, `opening missed the first crest: ${launch.x}`);
  return { time: world.elapsed, x: launch.x, speed: launch.speed };
}

function verifyBadLandingRecovery() {
  const world = new PhysicsWorld({ terrain: constantSlopeTerrain(-1) });
  const x = 3_000;
  const frame = world.terrain.frame(x, world.ball.radius);
  world.ball.grounded = false;
  world.ball.x = x;
  world.ball.y = frame.centerY - 1;
  world.ball.vx = 300;
  world.ball.vy = 950;
  world.ball.safetyUsed = true;
  world.flight = world.freshFlight(x - 600, frame.centerY - 300, 800);
  world.resolveSweptCollision(x - 2, frame.centerY - 2, x + 2, frame.centerY + 2);
  const landing = world.consumeEvents()[0];
  assert.equal(landing?.type, 'landing', 'recoverable uphill impact should land, not crash');
  assert.equal(landing?.grade, 'hard', 'reverse-facing impact should be graded hard');
  assert.ok(world.ball.groundSpeed >= world.config.hardLandingRecoverySpeed, 'hard landing lost the crawl recovery');

  let previousX = world.ball.x;
  for (let step = 0; step < 2 * 120; step += 1) {
    const events = world.step(1 / 120, true);
    assert.equal(events.some(event => event.type === 'crash' || event.type === 'stall'), false, 'recovered landing terminated');
    assert.ok(world.ball.x > previousX, 'recovered landing moved backward');
    previousX = world.ball.x;
  }
  return { landingSpeed: landing.speed, recoveredSpeed: world.ball.groundSpeed };
}

function simulatePilot(seed, seconds = 35) {
  const world = new PhysicsWorld({ seed });
  const pilot = new CurvePilot({ world, terrain: world.terrain });
  pilot.reset('test');
  let launches = 0;
  let landings = 0;
  let minimumLandingAirtime = Infinity;
  let terminal = 'timeout';
  let terminalTime = seconds;
  let previousX = world.ball.x;

  for (let step = 0; step < seconds * 120; step += 1) {
    const held = pilot.update(1 / 120);
    const events = world.step(1 / 120, held);
    assert.ok(world.ball.x >= previousX, `seed ${seed} moved backward at ${world.ball.x}`);
    previousX = world.ball.x;
    for (const event of events) {
      if (event.type === 'launch') launches += 1;
      if (event.type === 'landing') {
        landings += 1;
        minimumLandingAirtime = Math.min(minimumLandingAirtime, event.flight?.airtime ?? Infinity);
      }
      if (event.type === 'crash' || event.type === 'stall') {
        terminal = event.type;
        terminalTime = step / 120;
      }
    }
    if (terminal !== 'timeout') break;
  }

  return { seed, x: world.ball.x, launches, landings, minimumLandingAirtime, terminal, terminalTime };
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
  const shortestFlight = Math.min(...results.map(result => result.minimumLandingAirtime));
  assert.ok(shortestFlight >= 0.055, `a sub-frame skim leaked into landing events: ${shortestFlight}`);

  return { minimum, p10, median, average, shortestFlight };
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
  assert.ok(world.ball.groundSpeed >= world.config.hardLandingRecoverySpeed, 'recovery should retain enough speed to continue');

  const secondImpact = forceHardImpact();
  assert.equal(secondImpact?.type, 'crash', 'opening safety net must only rescue one impact');
  return recovery.speed;
}

const startedAt = Date.now();
const terrain = inspectTerrain();
const openingDistance = verifyOpeningRunway();
const forwardDrive = verifyForwardDrive();
const openingLaunch = verifyOpeningLaunchPace();
const badLanding = verifyBadLandingRecovery();
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
    maxFlowCurvature: Number(terrain.maxFlowCurvature.toFixed(6)),
    maxSharpBallPathCurvature: Number(terrain.maxSharpFrameCurvature.toFixed(6)),
    maxJoinAngleDegrees: Number((terrain.maxCenterAngleJoinGap * 180 / Math.PI).toFixed(5)),
    sharpCrests: terrain.sharpCrests,
    firstSharpCrestRange: [
      Number(terrain.earliestSharpCrest.toFixed(1)),
      Number(terrain.latestFirstSharpCrest.toFixed(1))
    ],
    minimumSharpSpacing: Number(terrain.minimumSharpSpacing.toFixed(1))
  },
  opening: {
    noInputDistance: Number(openingDistance.toFixed(1)),
    recoverySpeed: Number(recoverySpeed.toFixed(1)),
    launchTime: Number(openingLaunch.time.toFixed(2)),
    launchX: Number(openingLaunch.x.toFixed(1))
  },
  forwardDrive: forwardDrive.map(result => ({
    slope: result.slope,
    released: Number(result.released.toFixed(1)),
    held: Number(result.held.toFixed(1))
  })),
  badLanding: {
    landingSpeed: Number(badLanding.landingSpeed.toFixed(1)),
    recoveredSpeed: Number(badLanding.recoveredSpeed.toFixed(1))
  },
  seededSurvival: {
    seeds: TEST_SEEDS,
    minimumDistance: Number(survival.minimum.x.toFixed(1)),
    p10Distance: Number(survival.p10.x.toFixed(1)),
    medianDistance: Number(survival.median.x.toFixed(1)),
    averageDistance: Number(survival.average.toFixed(1)),
    shortestScoredFlight: Number(survival.shortestFlight.toFixed(3))
  },
  diveDifference: Number(diveDifference.toFixed(1))
}, null, 2));
