(function attachCoinRoutes(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftCoinRoutes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCoinRoutes() {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const dot = (ax, ay, bx, by) => ax * bx + ay * by;

  function cloneBall(ball) {
    return {
      x: ball.x,
      y: ball.y,
      vx: ball.vx,
      vy: ball.vy,
      radius: ball.radius,
      grounded: Boolean(ball.grounded),
      groundSpeed: Number.isFinite(ball.groundSpeed) ? ball.groundSpeed : Math.hypot(ball.vx, ball.vy),
      groundTime: Math.max(1, Number(ball.groundTime) || 0)
    };
  }

  function groundControl(terrain, ball, speed) {
    const frame = terrain.frame(ball.x, ball.radius);
    const near = terrain.frame(ball.x + clamp(speed * 0.18, 55, 170), ball.radius);
    const far = terrain.frame(ball.x + clamp(speed * 0.42, 150, 390), ball.radius);
    const descending = frame.slope > 0.025;
    const valleyAhead = near.centerY > frame.centerY + 18 || far.centerY > frame.centerY + 42;
    const climbing = frame.slope < -0.045;
    const crestSoon = climbing && near.slope > -0.12 && far.slope > 0.015;
    if (descending || valleyAhead) return true;
    if (crestSoon) return false;
    if (climbing || speed < 360) return true;
    return far.centerY > frame.centerY + 8 || frame.slope > -0.025;
  }

  function confirmLaunchClearance(terrain, config, launch, radius, dt, held) {
    let x = launch.x;
    let y = launch.y;
    let vx = launch.vx;
    let vy = launch.vy;
    let previousGap = y - terrain.frame(x, radius).centerY;
    const steps = Math.ceil((config.launchConfirmTime ?? 0.055) / dt);

    for (let step = 0; step < steps; step += 1) {
      // The decision that caused detachment remains active for the current
      // fixed step; the route pilot releases on the following step.
      const stepHeld = held && step === 0;
      const oldX = x;
      const oldY = y;
      const speed = Math.hypot(vx, vy);
      if (speed > 0) {
        const dragAcceleration = (config.airDrag ?? 0.000009) * speed * speed;
        vx -= vx / speed * dragAcceleration * dt;
        vy -= vy / speed * dragAcceleration * dt;
      }
      const forwardTarget = stepHeld
        ? (config.heldAirForwardSpeed ?? 250)
        : (config.airForwardSpeed ?? 165);
      if (vx < forwardTarget) {
        vx += (forwardTarget - vx) * (config.airForwardResponse ?? 2.2) * dt;
      }
      vx = Math.max(config.minimumAirForwardSpeed ?? 110, vx);
      vy += ((config.gravity ?? 455) + (stepHeld ? (config.airDiveExtraGravity ?? 0) : 0)) * dt;
      const limitedSpeed = Math.hypot(vx, vy);
      if (limitedSpeed > (config.maxSpeedSafety ?? 2700)) {
        const scale = (config.maxSpeedSafety ?? 2700) / limitedSpeed;
        vx *= scale;
        vy *= scale;
      }
      x += vx * dt;
      y += vy * dt;
      const gap = y - terrain.frame(x, radius).centerY;
      if ((previousGap <= 0 && gap >= 0) || gap > radius * 0.08) {
        let low = 0;
        let high = 1;
        for (let iteration = 0; iteration < (config.collisionIterations ?? 15); iteration += 1) {
          const middle = (low + high) * 0.5;
          const probeX = lerp(oldX, x, middle);
          const probeY = lerp(oldY, y, middle);
          if (probeY - terrain.frame(probeX, radius).centerY >= 0) high = middle;
          else low = middle;
        }
        const hitX = lerp(oldX, x, high);
        const frame = terrain.frame(hitX, radius);
        const tangent = dot(vx, vy, frame.tx, frame.ty);
        const outward = dot(vx, vy, frame.nx, frame.ny);
        const normalImpact = Math.max(0, -outward);
        if (normalImpact <= (config.perfectNormalSpeed ?? 235)) {
          return {
            confirmed: false,
            x: hitX,
            frame,
            speed: Math.max(
              tangent,
              vx * frame.tx,
              config.minimumForwardSpeed ?? 150
            )
          };
        }
      }
      previousGap = gap;
    }

    return { confirmed: true };
  }

  function simulateGroundToLaunch(terrain, config, sourceBall, options) {
    const ball = cloneBall(sourceBall);
    const dt = options.dt;
    const maxSteps = Math.ceil(options.maxGroundSeconds / dt);
    const groundTrace = [];

    if (!ball.grounded) {
      return {
        launch: {
          x: ball.x,
          y: ball.y,
          vx: ball.vx,
          vy: ball.vy,
          speed: Math.hypot(ball.vx, ball.vy)
        },
        groundTrace
      };
    }

    for (let step = 0; step < maxSteps; step += 1) {
      let frame = terrain.frame(ball.x, ball.radius);
      let speed = Math.max(0, dot(ball.vx, ball.vy, frame.tx, frame.ty));
      if (speed < 1) speed = Math.max(0, ball.groundSpeed);

      const held = groundControl(terrain, ball, speed);
      const baseGravity = config.groundGravity ?? config.gravity ?? 455;
      const extraGravity = held ? (config.groundDiveExtraGravity ?? 0) : 0;
      const totalGravity = baseGravity + extraGravity;
      const normalForcePerMass = -speed * speed * frame.curvature - totalGravity * frame.ny;
      // Keep this launch gate byte-for-byte equivalent in meaning to
      // PhysicsWorld.stepGround. A looser predictor can draw a coin arc for a
      // crest the real ball never leaves, which is far worse than omitting an
      // uncertain route.
      const crestFacing = frame.slope < 0.14
        && frame.slope > -1.05
        && frame.curvature > 0.00008;
      const canDetach = crestFacing
        && normalForcePerMass < -(config.detachForceMargin ?? 34)
        && ball.groundTime >= (config.minGroundContact ?? 0.065)
        && speed > 105;

      if (canDetach) {
        const launch = {
          x: ball.x,
          y: frame.centerY - 0.02,
          vx: frame.tx * speed,
          vy: frame.ty * speed,
          speed,
          slope: frame.slope,
          curvature: frame.curvature
        };
        const clearance = confirmLaunchClearance(terrain, config, launch, ball.radius, dt, held);
        if (clearance.confirmed) return { launch, groundTrace };

        ball.x = clearance.x;
        ball.y = clearance.frame.centerY;
        ball.vx = clearance.frame.tx * clearance.speed;
        ball.vy = clearance.frame.ty * clearance.speed;
        ball.groundSpeed = clearance.speed;
        ball.groundTime = 0;
        continue;
      }

      const tangentGravity = totalGravity * frame.ty;
      const resistance = (config.rollingResistance ?? 1.1) + speed * (config.rollingSpeedDrag ?? 0.00055);
      const coastDrive = Math.max(0, (config.coastTargetSpeed ?? 240) - speed)
        * (config.coastResponse ?? 2.8);
      const heldDrive = held
        ? Math.max(0, (config.heldTargetSpeed ?? 560) - speed) * (config.heldResponse ?? 3.8)
          + (config.heldUphillAssist ?? 850) * clamp(-frame.slope / 1.05, 0, 1)
        : 0;
      const acceleration = tangentGravity / (config.rollingInertiaFactor ?? 1.24)
        + coastDrive
        + heldDrive
        - resistance;
      speed = clamp(
        speed + acceleration * dt,
        config.minimumForwardSpeed ?? 150,
        config.maxSpeedSafety ?? 2700
      );
      ball.x += frame.tx * speed * dt;
      frame = terrain.frame(ball.x, ball.radius);
      ball.y = frame.centerY;
      ball.vx = frame.tx * speed;
      ball.vy = frame.ty * speed;
      ball.groundSpeed = speed;
      ball.groundTime += dt;

      if (step % options.groundSampleEvery === 0) {
        groundTrace.push({ x: ball.x, y: ball.y, speed, held });
      }
    }

    return { launch: null, groundTrace };
  }

  function simulateFlightCandidate(terrain, config, launch, radius, options, diveDelay) {
    const dt = options.dt;
    const maxSteps = Math.ceil(options.maxAirSeconds / dt);
    const points = [{ x: launch.x, y: launch.y, time: 0, held: false }];
    let x = launch.x;
    let y = launch.y;
    let vx = launch.vx;
    let vy = launch.vy;
    let maxAltitude = 0;
    let apexTime = null;
    let previousGap = y - terrain.frame(x, radius).centerY;

    for (let step = 1; step <= maxSteps; step += 1) {
      const time = step * dt;
      if (apexTime === null && vy >= 0) apexTime = time;
      const held = apexTime !== null && Number.isFinite(diveDelay) && time - apexTime >= diveDelay;
      const gravity = (config.gravity ?? 455) + (held ? (config.airDiveExtraGravity ?? 0) : 0);
      const speed = Math.hypot(vx, vy);

      if (speed > 0) {
        const dragAcceleration = (config.airDrag ?? 0.000009) * speed * speed;
        vx -= vx / speed * dragAcceleration * dt;
        vy -= vy / speed * dragAcceleration * dt;
      }

      const forwardTarget = held
        ? (config.heldAirForwardSpeed ?? 250)
        : (config.airForwardSpeed ?? 165);
      if (vx < forwardTarget) {
        vx += (forwardTarget - vx) * (config.airForwardResponse ?? 2.2) * dt;
      }
      vx = Math.max(config.minimumAirForwardSpeed ?? 110, vx);

      vy += gravity * dt;
      const limitedSpeed = Math.hypot(vx, vy);
      if (limitedSpeed > (config.maxSpeedSafety ?? 2700)) {
        const scale = (config.maxSpeedSafety ?? 2700) / limitedSpeed;
        vx *= scale;
        vy *= scale;
      }

      x += vx * dt;
      y += vy * dt;
      const frame = terrain.frame(x, radius);
      const gap = y - frame.centerY;
      maxAltitude = Math.max(maxAltitude, frame.centerY - y);

      if (step % options.airSampleEvery === 0) points.push({ x, y, time, held });

      if (step > 4 && previousGap <= 0 && gap >= 0) {
        const tangent = dot(vx, vy, frame.tx, frame.ty);
        const outward = dot(vx, vy, frame.nx, frame.ny);
        const normalImpact = Math.max(0, -outward);
        const landingAngle = Math.atan2(normalImpact, Math.max(1, tangent));
        points.push({ x, y: frame.centerY, time, held });

        const survivalPenalty = tangent <= 0 ? 100000 : 0;
        const impactPenalty = normalImpact * 0.95 + landingAngle * 690;
        const idealAnglePenalty = Math.abs(landingAngle - 0.12) * 150;
        const distanceReward = clamp((x - launch.x) * 0.045, 0, 170);
        const heightReward = clamp(maxAltitude * 0.055, 0, 70);
        const score = tangent * 0.42 + distanceReward + heightReward
          - impactPenalty - idealAnglePenalty - survivalPenalty;

        return {
          launch,
          landing: { x, y: frame.centerY, time, vx, vy, tangent, normalImpact, landingAngle },
          points,
          airtime: time,
          distance: x - launch.x,
          maxAltitude,
          control: { diveDelay },
          qualityScore: score
        };
      }

      previousGap = gap;
    }

    return null;
  }

  function chooseFlight(terrain, config, launch, radius, options, requireRewardArc = true) {
    let candidates = [Infinity, 0, 0.2, 0.42, 0.68]
      .map(delay => simulateFlightCandidate(terrain, config, launch, radius, options, delay))
      .filter(Boolean)
      .filter(route => route.landing.tangent > 0
        && route.landing.normalImpact < (config.crashNormalSpeed ?? 1880));

    if (requireRewardArc) {
      candidates = candidates.filter(route => route.airtime >= options.minAirtime
        && route.distance >= options.minDistance
        && route.maxAltitude >= options.minAltitude);
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.qualityScore - a.qualityScore);
    return candidates[0];
  }

  function landingState(terrain, config, route, radius) {
    const frame = terrain.frame(route.landing.x + 5, radius);
    const tangent = Math.max(0, dot(route.landing.vx, route.landing.vy, frame.tx, frame.ty));
    const normalImpact = route.landing.normalImpact;
    const landingAngle = route.landing.landingAngle;
    let retention;
    if (landingAngle <= (config.perfectAngle ?? 0.2)
      && normalImpact <= (config.perfectNormalSpeed ?? 235)) {
      retention = config.perfectRetention ?? 1.012;
    } else if (landingAngle <= (config.goodAngle ?? 0.6)
      && normalImpact <= (config.goodNormalSpeed ?? 650)) {
      retention = config.goodRetention ?? 0.99;
    } else {
      const impactLoss = clamp(normalImpact / (config.crashNormalSpeed ?? 1880), 0, 1) * 0.12;
      const angleLoss = clamp(landingAngle / (config.crashAngle ?? 1.42), 0, 1) * 0.08;
      retention = clamp(
        (config.roughRetentionMax ?? 0.93) - impactLoss - angleLoss,
        config.roughRetentionMin ?? 0.76,
        config.roughRetentionMax ?? 0.93
      );
    }
    const speed = clamp(
      tangent * retention,
      config.minimumForwardSpeed ?? 150,
      config.maxSpeedSafety ?? 2700
    );
    return {
      x: route.landing.x + 5,
      y: frame.centerY,
      vx: frame.tx * speed,
      vy: frame.ty * speed,
      radius,
      grounded: true,
      groundSpeed: speed,
      groundTime: 1
    };
  }

  function predictReleaseRoute(terrain, config, ball, customOptions = {}) {
    const options = {
      // Prediction uses the same fixed step as the live simulation. At 1/75,
      // marginal detach windows could be crossed on a different frame and
      // move a later launch by an entire dune.
      dt: customOptions.dt ?? 1 / 120,
      maxGroundSeconds: customOptions.maxGroundSeconds ?? 7.5,
      maxAirSeconds: customOptions.maxAirSeconds ?? 7,
      groundSampleEvery: customOptions.groundSampleEvery ?? 26,
      airSampleEvery: customOptions.airSampleEvery ?? 6,
      minAirtime: customOptions.minAirtime ?? 0.3,
      minDistance: customOptions.minDistance ?? 150,
      minAltitude: customOptions.minAltitude ?? 16,
      maxSkippedHops: customOptions.maxSkippedHops ?? 3
    };

    let planningBall = cloneBall(ball);
    let route = null;
    let groundPrediction = null;
    for (let hop = 0; hop <= options.maxSkippedHops; hop += 1) {
      groundPrediction = simulateGroundToLaunch(terrain, config, planningBall, options);
      if (!groundPrediction.launch) return null;
      route = chooseFlight(terrain, config, groundPrediction.launch, planningBall.radius, options, true);
      if (route) break;

      const connector = chooseFlight(
        terrain,
        config,
        groundPrediction.launch,
        planningBall.radius,
        options,
        false
      );
      if (!connector) return null;
      planningBall = landingState(terrain, config, connector, planningBall.radius);
    }
    if (!route) return null;

    route.groundTrace = groundPrediction.groundTrace;
    const diveKey = Number.isFinite(route.control.diveDelay) ? Math.round(route.control.diveDelay * 10) : 99;
    route.key = [
      Math.round(route.launch.x / 24),
      Math.round(route.landing.x / 32),
      Math.round(route.launch.speed / 30),
      diveKey
    ].join(':');
    return route;
  }

  function buildArcTable(points) {
    const lengths = [0];
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
      lengths.push(total);
    }
    return { lengths, total };
  }

  function pointAtArcFraction(points, table, fraction) {
    if (!points.length) return null;
    if (points.length === 1 || table.total <= 0) return { ...points[0] };
    const target = clamp(fraction, 0, 1) * table.total;
    let right = 1;
    while (right < table.lengths.length && table.lengths[right] < target) right += 1;
    right = Math.min(right, points.length - 1);
    const left = Math.max(0, right - 1);
    const span = Math.max(0.0001, table.lengths[right] - table.lengths[left]);
    const amount = (target - table.lengths[left]) / span;
    return {
      x: lerp(points[left].x, points[right].x, amount),
      y: lerp(points[left].y, points[right].y, amount),
      time: lerp(points[left].time, points[right].time, amount)
    };
  }

  function pointAtFraction(points, fraction) {
    return pointAtArcFraction(points, buildArcTable(points), fraction);
  }

  function buildCoinLine(route, terrain, radius, customOptions = {}) {
    const table = buildArcTable(route.points);
    const startFraction = customOptions.startFraction ?? 0.12;
    const endFraction = customOptions.endFraction ?? 0.84;
    const usableLength = table.total * Math.max(0, endFraction - startFraction);
    const count = clamp(
      customOptions.count ?? Math.round(usableLength / (customOptions.spacing ?? 125)),
      customOptions.minCount ?? 5,
      customOptions.maxCount ?? 9
    );
    const verticalEase = customOptions.verticalEase ?? 1.5;
    const minimumSpacing = customOptions.minimumSpacing ?? 78;
    const coins = [];

    for (let index = 0; index < count; index += 1) {
      const fraction = count === 1 ? 0.5 : index / (count - 1);
      const routeFraction = lerp(startFraction, endFraction, fraction);
      const point = pointAtArcFraction(route.points, table, routeFraction);
      if (!point) continue;
      const centerY = terrain.frame(point.x, radius).centerY;
      const coin = {
        x: point.x,
        y: Math.min(point.y - verticalEase, centerY - radius * 0.12),
        routeKey: route.key,
        fraction: routeFraction
      };
      const previous = coins[coins.length - 1];
      if (previous && Math.hypot(coin.x - previous.x, coin.y - previous.y) < minimumSpacing) continue;
      coins.push(coin);
    }

    return coins;
  }

  return {
    predictReleaseRoute,
    buildCoinLine,
    pointAtFraction,
    groundControl,
    simulateGroundToLaunch,
    simulateFlightCandidate
  };
});
