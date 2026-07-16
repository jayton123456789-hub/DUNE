(function attachDriftPhysics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDriftPhysics() {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const dot = (ax, ay, bx, by) => ax * bx + ay * by;

  class SeededRandom {
    constructor(seed) {
      this.state = seed >>> 0 || 0x9e3779b9;
    }

    next() {
      this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
      return this.state / 4294967296;
    }

    range(min, max) {
      return min + (max - min) * this.next();
    }

    int(min, maxInclusive) {
      return Math.floor(this.range(min, maxInclusive + 1));
    }
  }

  /**
   * Endless C2-continuous terrain built from alternating dune crests and bowls.
   *
   * Every segment uses quintic smoothstep. Position, slope, and curvature are
   * all zero-matched at joins, so physics never encounters the invisible
   * curvature seams that made the previous terrain feel kinked. Segment width
   * is derived from its height change, keeping randomized hills readable and
   * physically fair.
   */
  class SplineTerrain {
    constructor(options = {}) {
      this.top = options.top ?? 155;
      this.bottom = options.bottom ?? 610;
      this.maxSlope = options.maxSlope ?? 1.28;
      this.maxCurvature = options.maxCurvature ?? 0.0125;
      this.seed = options.seed ?? 0x51f15e;
      this.points = [];
      this.featureLog = [];
      this.reset(this.seed);
    }

    reset(seed = this.seed) {
      this.seed = seed >>> 0;
      this.random = new SeededRandom(this.seed);
      this.points = [
        { x: -1400, y: 500, kind: 'opening-bowl' },
        { x: -520, y: 225, kind: 'opening-crest' },
        { x: 760, y: 590, kind: 'opening-long-bowl' },
        { x: 1420, y: 235, kind: 'opening-launch-crest' },
        { x: 2040, y: 560, kind: 'opening-landing-bowl' },
        { x: 2560, y: 315, kind: 'opening-soft-crest' },
        { x: 3500, y: 590, kind: 'opening-second-bowl' },
        { x: 4300, y: 315, kind: 'opening-exit-crest' }
      ];
      this.featureLog = ['opening-flow'];
      this._segments = [];
      this._cursor = 0;
      this.ensure(9200);
      return this;
    }

    safeWidth(fromY, toY, requestedWidth) {
      const delta = Math.abs(toY - fromY);
      // Quintic smoothstep has a peak first derivative of 1.875 and a peak
      // second derivative just under 5.78 in normalized segment space.
      const slopeWidth = delta * 1.875 / this.maxSlope;
      const curvatureWidth = Math.sqrt(Math.max(1, delta) * 5.78 / this.maxCurvature);
      return clamp(Math.max(requestedWidth, slopeWidth, curvatureWidth), 300, 880);
    }

    append(y, requestedWidth, kind) {
      const last = this.points[this.points.length - 1];
      const boundedY = clamp(y, this.top, this.bottom);
      const width = this.safeWidth(last.y, boundedY, requestedWidth);
      this.points.push({ x: last.x + width, y: boundedY, kind });
      this._segments.length = Math.max(0, this.points.length - 2);
      return width;
    }

    valley(difficulty, depth = 1) {
      const top = 515 + depth * 35 + difficulty * 8;
      return this.random.range(top, Math.min(this.bottom, top + 42));
    }

    crest(difficulty, height = 1) {
      const upper = 365 - height * 70 - difficulty * 18;
      return this.random.range(Math.max(this.top, upper - 58), upper);
    }

    addFlow(difficulty) {
      this.append(this.valley(difficulty, 0.75), this.random.range(560, 790), 'flow-bowl');
      this.append(this.crest(difficulty, 0.75), this.random.range(500, 730), 'flow-crest');
    }

    addDouble(difficulty) {
      this.append(this.random.range(455, 525), this.random.range(380, 540), 'double-pocket-a');
      this.append(this.random.range(305, 390), this.random.range(350, 520), 'double-ridge');
      this.append(this.valley(difficulty, 0.9), this.random.range(430, 610), 'double-pocket-b');
      this.append(this.crest(difficulty, 0.85), this.random.range(440, 650), 'double-exit-crest');
    }

    addBasin(difficulty) {
      this.append(this.valley(difficulty, 1), this.random.range(690, 860), 'basin-floor');
      this.append(this.random.range(350, 420), this.random.range(410, 560), 'basin-ridge');
      this.append(this.random.range(520, 585), this.random.range(390, 540), 'basin-second-bowl');
      this.append(this.crest(difficulty, 0.85), this.random.range(530, 760), 'basin-exit-crest');
    }

    addRhythm(difficulty) {
      const pairs = this.random.int(2, 3);
      for (let index = 0; index < pairs; index += 1) {
        this.append(this.random.range(450, 545 + difficulty * 18), this.random.range(350, 510), 'rhythm-pocket');
        this.append(this.random.range(300 - difficulty * 12, 405), this.random.range(340, 500), 'rhythm-crest');
      }
    }

    addLaunch(difficulty) {
      this.append(this.valley(difficulty, 1), this.random.range(590, 790), 'launch-bowl');
      this.append(this.crest(difficulty, 1.2), this.random.range(470, 650), 'launch-crest');
      this.append(this.random.range(535, 600), this.random.range(570, 790), 'landing-bowl');
      this.append(this.crest(difficulty, 0.65), this.random.range(540, 740), 'landing-exit-crest');
    }

    addGlide(difficulty) {
      this.append(this.random.range(500, 565), this.random.range(700, 880), 'glide-bowl');
      this.append(this.crest(difficulty, 0.55), this.random.range(690, 860), 'glide-crest');
    }

    ensure(targetX) {
      while (this.points[this.points.length - 1].x < targetX) {
        const last = this.points[this.points.length - 1];
        const difficulty = clamp((last.x - 6500) / 42000, 0, 1);
        const roll = this.random.next();
        let feature;
        if (roll < 0.32) {
          feature = 'flow';
          this.addFlow(difficulty);
        } else if (roll < 0.56) {
          feature = 'double';
          this.addDouble(difficulty);
        } else if (roll < 0.74) {
          feature = 'basin';
          this.addBasin(difficulty);
        } else if (roll < 0.9) {
          feature = 'rhythm';
          this.addRhythm(difficulty);
        } else if (roll < 0.975) {
          feature = 'launch';
          this.addLaunch(difficulty);
        } else {
          feature = 'glide';
          this.addGlide(difficulty);
        }
        this.featureLog.push(feature);
      }
    }

    segmentIndex(x) {
      this.ensure(x + 2800);
      const max = this.points.length - 2;
      let index = clamp(this._cursor, 0, max);

      if (x >= this.points[index].x && x <= this.points[index + 1].x) return index;
      if (x > this.points[index + 1].x) {
        while (index < max && x > this.points[index + 1].x) index += 1;
      } else {
        while (index > 0 && x < this.points[index].x) index -= 1;
      }

      if (x < this.points[index].x || x > this.points[index + 1].x) {
        let low = 0;
        let high = max;
        while (low <= high) {
          const middle = (low + high) >> 1;
          if (x < this.points[middle].x) high = middle - 1;
          else if (x > this.points[middle + 1].x) low = middle + 1;
          else {
            index = middle;
            break;
          }
        }
        index = clamp(index, 0, max);
      }

      this._cursor = index;
      return index;
    }

    segment(index) {
      const cached = this._segments[index];
      if (cached) return cached;
      const a = this.points[index];
      const b = this.points[index + 1];
      const width = Math.max(1, b.x - a.x);
      const segment = {
        index,
        x0: a.x,
        width,
        invWidth: 1 / width,
        delta: b.y - a.y,
        y0: a.y
      };
      this._segments[index] = segment;
      return segment;
    }

    sample(x) {
      const index = this.segmentIndex(x);
      const segment = this.segment(index);
      const t = clamp((x - segment.x0) * segment.invWidth, 0, 1);
      const t2 = t * t;
      const t3 = t2 * t;
      const t4 = t3 * t;
      const t5 = t4 * t;
      const smooth = 6 * t5 - 15 * t4 + 10 * t3;
      const firstT = 30 * t2 * (t - 1) * (t - 1);
      const secondT = 60 * t * (2 * t2 - 3 * t + 1);
      const thirdT = 60 * (6 * t2 - 6 * t + 1);
      const slope = segment.delta * firstT * segment.invWidth;
      const second = segment.delta * secondT * segment.invWidth * segment.invWidth;
      const third = segment.delta * thirdT * segment.invWidth * segment.invWidth * segment.invWidth;
      const q = Math.hypot(1, slope);
      return {
        y: segment.y0 + segment.delta * smooth,
        slope,
        second,
        third,
        curvature: second / (q * q * q),
        index
      };
    }

    height(x) {
      return this.sample(x).y;
    }

    slope(x) {
      return this.sample(x).slope;
    }

    curvature(x) {
      return this.sample(x).curvature;
    }

    centerHeight(x, radius = 0) {
      const sample = this.sample(x);
      return sample.y - radius * Math.hypot(1, sample.slope);
    }

    frame(x, radius = 0) {
      const sample = this.sample(x);
      const epsilon = 1.5;
      const centerY = sample.y - radius * Math.hypot(1, sample.slope);
      const before = this.sample(x - epsilon);
      const after = this.sample(x + epsilon);
      const beforeY = before.y - radius * Math.hypot(1, before.slope);
      const afterY = after.y - radius * Math.hypot(1, after.slope);
      const centerSlope = (afterY - beforeY) / (epsilon * 2);
      const centerSecond = (afterY - 2 * centerY + beforeY) / (epsilon * epsilon);
      const length = Math.hypot(1, centerSlope);
      const tx = 1 / length;
      const ty = centerSlope / length;
      const nx = centerSlope / length;
      const ny = -1 / length;
      return {
        ...sample,
        groundSlope: sample.slope,
        groundCurvature: sample.curvature,
        slope: centerSlope,
        second: centerSecond,
        curvature: centerSecond / Math.pow(1 + centerSlope * centerSlope, 1.5),
        tx,
        ty,
        nx,
        ny,
        length,
        centerY
      };
    }
  }

  const DEFAULT_CONFIG = Object.freeze({
    massKg: 136.0777,
    radius: 24,
    gravity: 455,
    groundGravity: 720,
    groundDiveExtraGravity: 620,
    airDiveExtraGravity: 1350,
    rollingInertiaFactor: 1.28,
    rollingResistance: 1.35,
    rollingSpeedDrag: 0.00072,
    airDrag: 0.000011,
    maxSpeedSafety: 2400,
    maxSubsteps: 24,
    collisionIterations: 15,
    detachForceMargin: 34,
    minGroundContact: 0.065,
    perfectAngle: 0.2,
    goodAngle: 0.6,
    perfectNormalSpeed: 235,
    goodNormalSpeed: 650,
    hardNormalSpeed: 1280,
    crashNormalSpeed: 1880,
    crashAngle: 1.58,
    stallSpeed: 18,
    stallDelay: 1.15,
    failAfterX: 1750,
    safetyNetEndX: 2050,
    perfectRetention: 1.012,
    goodRetention: 0.99,
    roughRetentionMin: 0.76,
    roughRetentionMax: 0.93
  });

  class PhysicsWorld {
    constructor(options = {}) {
      this.config = { ...DEFAULT_CONFIG, ...(options.config || {}) };
      this.terrain = options.terrain || new SplineTerrain({ seed: options.seed });
      this.events = [];
      this.reset(options.seed);
    }

    reset(seed = this.terrain.seed) {
      this.terrain.reset(seed);
      const radius = this.config.radius;
      const startX = 120;
      const frame = this.terrain.frame(startX, radius);
      const speed = 315;
      this.ball = {
        x: startX,
        y: frame.centerY,
        vx: frame.tx * speed,
        vy: frame.ty * speed,
        omega: speed / radius,
        radius,
        massKg: this.config.massKg,
        grounded: true,
        groundSpeed: speed,
        stallTime: 0,
        rotation: 0,
        groundTime: 1,
        safetyUsed: false
      };
      this.flight = this.freshFlight(startX, frame.centerY, speed);
      this.elapsed = 0;
      this.events = [];
      return this.ball;
    }

    freshFlight(x, y, speed) {
      return {
        airtime: 0,
        launchX: x,
        launchY: y,
        launchSpeed: speed,
        maxAltitude: 0,
        maxSpeed: speed,
        distance: 0
      };
    }

    consumeEvents() {
      const output = this.events;
      this.events = [];
      return output;
    }

    emit(type, payload = {}) {
      this.events.push({ type, time: this.elapsed, ...payload });
    }

    surfaceGap(x, y) {
      return y - this.terrain.frame(x, this.ball.radius).centerY;
    }

    detach(frame, speed, normalForcePerMass) {
      const ball = this.ball;
      ball.grounded = false;
      ball.groundSpeed = speed;
      ball.groundTime = 0;
      ball.vx = frame.tx * speed;
      ball.vy = frame.ty * speed;
      ball.y = frame.centerY - 0.02;
      this.flight = this.freshFlight(ball.x, ball.y, speed);
      this.emit('launch', {
        x: ball.x,
        y: ball.y,
        speed,
        slope: frame.slope,
        curvature: frame.curvature,
        normalForcePerMass
      });
    }

    step(dt, held = false) {
      const speed = Math.hypot(this.ball.vx, this.ball.vy);
      const substeps = clamp(Math.ceil(speed * dt / (this.ball.radius * 0.24)), 1, this.config.maxSubsteps);
      const subDt = dt / substeps;
      for (let index = 0; index < substeps; index += 1) {
        if (this.ball.grounded) this.stepGround(subDt, held);
        else this.stepAir(subDt, held);
        this.elapsed += subDt;
        if (this.events.some(event => event.type === 'crash' || event.type === 'stall')) break;
      }
      return this.consumeEvents();
    }

    stepGround(dt, held) {
      const c = this.config;
      const ball = this.ball;
      let frame = this.terrain.frame(ball.x, ball.radius);
      let speed = Math.max(0, dot(ball.vx, ball.vy, frame.tx, frame.ty));
      if (speed < 1) speed = Math.max(0, ball.groundSpeed);

      const totalGravity = c.groundGravity + (held ? c.groundDiveExtraGravity : 0);
      const normalForcePerMass = -speed * speed * frame.curvature - totalGravity * frame.ny;
      const crestFacing = frame.slope < 0.14 && frame.slope > -1.05 && frame.curvature > 0.00008;
      if (crestFacing && normalForcePerMass < -c.detachForceMargin && ball.groundTime >= c.minGroundContact && speed > 105) {
        this.detach(frame, speed, normalForcePerMass);
        return;
      }

      const tangentGravity = totalGravity * frame.ty;
      const resistance = c.rollingResistance + speed * c.rollingSpeedDrag;
      const acceleration = tangentGravity / c.rollingInertiaFactor - resistance;
      speed = clamp(speed + acceleration * dt, 0, c.maxSpeedSafety);

      // The deterministic opening is a tutorial runway. A tiny low-speed assist
      // prevents a new player from getting stranded before learning the input.
      if (ball.x < c.failAfterX) speed = Math.max(speed, 105);

      ball.x += frame.tx * speed * dt;
      frame = this.terrain.frame(ball.x, ball.radius);
      ball.y = frame.centerY;
      ball.vx = frame.tx * speed;
      ball.vy = frame.ty * speed;
      ball.groundSpeed = speed;
      ball.omega = speed / ball.radius;
      ball.rotation += ball.omega * dt;
      ball.groundTime += dt;

      if (ball.x > c.failAfterX && speed < c.stallSpeed && frame.slope < -0.04) ball.stallTime += dt;
      else ball.stallTime = Math.max(0, ball.stallTime - dt * 2.25);

      if (ball.stallTime >= c.stallDelay || (ball.x > c.failAfterX && speed <= 0.12)) {
        this.emit('stall', { speed, x: ball.x, slope: frame.slope });
      }
    }

    stepAir(dt, held) {
      const c = this.config;
      const ball = this.ball;
      const oldX = ball.x;
      const oldY = ball.y;
      const oldGap = this.surfaceGap(oldX, oldY);
      const totalGravity = c.gravity + (held ? c.airDiveExtraGravity : 0);
      const speed = Math.hypot(ball.vx, ball.vy);

      if (speed > 0) {
        const dragAcceleration = c.airDrag * speed * speed;
        ball.vx -= ball.vx / speed * dragAcceleration * dt;
        ball.vy -= ball.vy / speed * dragAcceleration * dt;
      }

      ball.vy += totalGravity * dt;
      const speedAfter = Math.hypot(ball.vx, ball.vy);
      if (speedAfter > c.maxSpeedSafety) {
        const scale = c.maxSpeedSafety / speedAfter;
        ball.vx *= scale;
        ball.vy *= scale;
      }

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.rotation += ball.omega * dt;
      this.flight.airtime += dt;
      this.flight.distance = ball.x - this.flight.launchX;
      this.flight.maxSpeed = Math.max(this.flight.maxSpeed, Math.hypot(ball.vx, ball.vy));
      const altitude = this.terrain.frame(ball.x, ball.radius).centerY - ball.y;
      this.flight.maxAltitude = Math.max(this.flight.maxAltitude, altitude);

      const newGap = this.surfaceGap(ball.x, ball.y);
      if ((oldGap <= 0 && newGap >= 0) || newGap > ball.radius * 0.08) {
        this.resolveSweptCollision(oldX, oldY, ball.x, ball.y);
      }
    }

    settle(frame, speed) {
      const ball = this.ball;
      ball.grounded = true;
      ball.groundSpeed = speed;
      ball.vx = frame.tx * speed;
      ball.vy = frame.ty * speed;
      ball.omega = speed / ball.radius;
      ball.stallTime = 0;
      ball.groundTime = 0;
    }

    resolveSweptCollision(oldX, oldY, newX, newY) {
      const c = this.config;
      const ball = this.ball;
      let low = 0;
      let high = 1;
      for (let iteration = 0; iteration < c.collisionIterations; iteration += 1) {
        const middle = (low + high) * 0.5;
        const x = lerp(oldX, newX, middle);
        const y = lerp(oldY, newY, middle);
        if (this.surfaceGap(x, y) >= 0) high = middle;
        else low = middle;
      }

      ball.x = lerp(oldX, newX, high);
      const frame = this.terrain.frame(ball.x, ball.radius);
      ball.y = frame.centerY;
      const tangentSpeed = dot(ball.vx, ball.vy, frame.tx, frame.ty);
      const outwardSpeed = dot(ball.vx, ball.vy, frame.nx, frame.ny);
      const normalImpact = Math.max(0, -outwardSpeed);
      const landingAngle = Math.atan2(normalImpact, Math.max(1, tangentSpeed));
      const forwardSlideSpeed = Math.max(0, ball.vx * frame.tx);
      const recoverableForwardImpact = tangentSpeed <= 0 && forwardSlideSpeed > 95 && normalImpact < c.crashNormalSpeed * 0.94;
      const wouldCrash = (tangentSpeed <= 0 && !recoverableForwardImpact)
        || normalImpact > c.crashNormalSpeed
        || landingAngle > c.crashAngle;

      const safetyAvailable = !ball.safetyUsed && ball.x <= c.safetyNetEndX;
      if (wouldCrash && safetyAvailable) {
        const recoverySpeed = clamp(Math.max(205, forwardSlideSpeed * 0.68), 205, 390);
        ball.safetyUsed = true;
        this.settle(frame, recoverySpeed);
        this.emit('landing', {
          grade: 'recovery',
          assisted: true,
          x: ball.x,
          speed: recoverySpeed,
          tangentSpeed,
          normalImpact,
          landingAngle,
          retention: 0,
          bonus: 0,
          flight: { ...this.flight }
        });
        return;
      }

      if (wouldCrash) {
        this.emit('crash', {
          reason: tangentSpeed <= 0 && !recoverableForwardImpact ? 'backward' : 'impact',
          x: ball.x,
          tangentSpeed,
          normalImpact,
          landingAngle,
          flight: { ...this.flight }
        });
        return;
      }

      let grade;
      let retention;
      if (recoverableForwardImpact) {
        grade = 'hard';
        retention = 0;
      } else if (landingAngle <= c.perfectAngle && normalImpact <= c.perfectNormalSpeed) {
        grade = 'perfect';
        retention = c.perfectRetention;
      } else if (landingAngle <= c.goodAngle && normalImpact <= c.goodNormalSpeed) {
        grade = 'good';
        retention = c.goodRetention;
      } else {
        grade = normalImpact > c.hardNormalSpeed || landingAngle > 1.1 ? 'hard' : 'rough';
        const impactLoss = clamp(normalImpact / c.crashNormalSpeed, 0, 1) * 0.12;
        const angleLoss = clamp(landingAngle / c.crashAngle, 0, 1) * 0.08;
        retention = clamp(c.roughRetentionMax - impactLoss - angleLoss, c.roughRetentionMin, c.roughRetentionMax);
      }

      const settledSpeed = clamp(
        recoverableForwardImpact ? Math.max(155, forwardSlideSpeed * 0.6) : tangentSpeed * retention,
        0,
        c.maxSpeedSafety
      );
      this.settle(frame, settledSpeed);
      this.emit('landing', {
        grade,
        x: ball.x,
        speed: settledSpeed,
        tangentSpeed,
        normalImpact,
        landingAngle,
        retention,
        bonus: 0,
        flight: { ...this.flight }
      });
    }
  }

  return {
    SeededRandom,
    SplineTerrain,
    PhysicsWorld,
    DEFAULT_CONFIG,
    math: { clamp, lerp, dot }
  };
});
