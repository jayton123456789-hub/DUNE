(function attachDriftPhysics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDriftPhysics() {
  'use strict';

  const PI = Math.PI;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dot = (ax, ay, bx, by) => ax * bx + ay * by;

  class SeededRandom {
    constructor(seed) { this.state = seed >>> 0 || 0x9e3779b9; }
    next() {
      this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
      return this.state / 4294967296;
    }
    range(min, max) { return min + (max - min) * this.next(); }
    int(min, maxInclusive) { return Math.floor(this.range(min, maxInclusive + 1)); }
    pick(values) { return values[Math.min(values.length - 1, Math.floor(this.next() * values.length))]; }
  }

  class SplineTerrain {
    constructor(options = {}) {
      this.top = options.top ?? 145;
      this.bottom = options.bottom ?? 610;
      this.maxSlope = options.maxSlope ?? 1.18;
      this.maxCurvature = options.maxCurvature ?? 0.0095;
      this.seed = options.seed ?? 0x51f15e;
      this.points = [];
      this.featureLog = [];
      this.reset(this.seed);
    }

    reset(seed = this.seed) {
      this.seed = seed >>> 0;
      this.random = new SeededRandom(this.seed);
      this.points = [
        { x: -520, y: 182, kind: 'peak' },
        { x: 120, y: 178, kind: 'peak' },
        { x: 675, y: 535, kind: 'valley' },
        { x: 1160, y: 300, kind: 'peak' },
        { x: 1505, y: 455, kind: 'shoulder' },
        { x: 1905, y: 565, kind: 'valley' },
        { x: 2245, y: 320, kind: 'peak' },
        { x: 2595, y: 505, kind: 'valley' }
      ];
      this.featureLog = ['opening'];
      this.ensure(9000);
    }

    safeWidth(fromY, toY, requested) {
      const delta = Math.abs(toY - fromY);
      const slopeWidth = delta * 1.72 / this.maxSlope;
      const curvatureWidth = Math.sqrt(Math.max(0, delta) * 8.8 / this.maxCurvature);
      return clamp(Math.max(requested, slopeWidth, curvatureWidth), 190, 780);
    }

    append(y, requestedWidth, kind = 'transition') {
      const last = this.points[this.points.length - 1];
      y = clamp(y, this.top - 18, this.bottom + 8);
      const width = this.safeWidth(last.y, y, requestedWidth);
      this.points.push({ x: last.x + width, y, kind });
    }

    addRollers(difficulty) {
      const count = this.random.int(3, 5);
      let direction = this.points[this.points.length - 1].y > 410 ? -1 : 1;
      for (let index = 0; index < count; index++) {
        const magnitude = this.random.range(80, 155 + difficulty * 35);
        const current = this.points[this.points.length - 1].y;
        let target = current + direction * magnitude;
        if (direction < 0) target = clamp(target, 225 - 25 * difficulty, 395);
        else target = clamp(target, 400, 545 + 25 * difficulty);
        this.append(target, this.random.range(205, 330), direction < 0 ? 'small-peak' : 'small-valley');
        if (this.random.next() > 0.18) direction *= -1;
      }
    }

    addBowl(difficulty, mega = false) {
      const current = this.points[this.points.length - 1].y;
      if (current > 470) this.append(this.random.range(215, 325), this.random.range(300, 470), 'entry-peak');
      const valley = mega ? this.random.range(585, 615) : this.random.range(530, 600);
      this.append(valley, mega ? this.random.range(500, 690) : this.random.range(370, 560), mega ? 'mega-valley' : 'deep-valley');
      if (this.random.next() < 0.45) {
        this.append(this.random.range(455, 535), this.random.range(230, 360), 'valley-shoulder');
      }
      const exitPeak = mega
        ? this.random.range(this.top, 220)
        : this.random.range(190 - difficulty * 18, 295);
      this.append(exitPeak, mega ? this.random.range(500, 720) : this.random.range(330, 535), mega ? 'mega-peak' : 'exit-peak');
    }

    addChannel(difficulty) {
      const current = this.points[this.points.length - 1].y;
      if (current < 390) this.append(this.random.range(500, 575), this.random.range(340, 500), 'channel-entry');
      const channelLevel = this.random.range(495, 565 + difficulty * 18);
      this.append(channelLevel, this.random.range(430, 610), 'channel-low');
      this.append(channelLevel + this.random.range(-35, 25), this.random.range(300, 490), 'channel-ripple');
      this.append(this.random.range(215, 315), this.random.range(330, 500), 'channel-exit');
    }

    addDoubleFeature(difficulty) {
      const high = this.random.range(205 - difficulty * 15, 315);
      const saddle = this.random.range(385, 475);
      const highTwo = clamp(high + this.random.range(-55, 55), 175, 330);
      const deep = this.random.range(525, 595 + difficulty * 12);
      this.append(high, this.random.range(270, 420), 'ridge-one');
      this.append(saddle, this.random.range(200, 320), 'saddle');
      this.append(highTwo, this.random.range(205, 335), 'ridge-two');
      this.append(deep, this.random.range(310, 490), 'double-valley');
    }

    ensure(targetX) {
      while (this.points[this.points.length - 1].x < targetX) {
        const last = this.points[this.points.length - 1];
        const difficulty = clamp((last.x - 2800) / 30000, 0, 1);
        const roll = this.random.next();
        let feature;
        if (roll < 0.38) {
          feature = 'rollers';
          this.addRollers(difficulty);
        } else if (roll < 0.69) {
          feature = 'bowl';
          this.addBowl(difficulty, false);
        } else if (roll < 0.86) {
          feature = 'channel';
          this.addChannel(difficulty);
        } else if (roll < 0.97) {
          feature = 'double';
          this.addDoubleFeature(difficulty);
        } else {
          feature = 'mega';
          this.addBowl(difficulty, last.x > 7200);
        }
        this.featureLog.push(feature);
      }
    }

    segmentIndex(x) {
      this.ensure(x + 2600);
      let low = 0;
      let high = this.points.length - 2;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const left = this.points[mid];
        const right = this.points[mid + 1];
        if (x < left.x) high = mid - 1;
        else if (x > right.x) low = mid + 1;
        else return mid;
      }
      return clamp(low, 0, this.points.length - 2);
    }

    tangentAt(index) {
      const point = this.points[index];
      const before = this.points[Math.max(0, index - 1)];
      const after = this.points[Math.min(this.points.length - 1, index + 1)];
      if (before === point || after === point) return 0;
      const leftDelta = point.y - before.y;
      const rightDelta = after.y - point.y;
      if (leftDelta === 0 || rightDelta === 0 || Math.sign(leftDelta) !== Math.sign(rightDelta)) return 0;
      const raw = (after.y - before.y) / Math.max(1, after.x - before.x);
      return clamp(raw * 0.72, -this.maxSlope * 0.72, this.maxSlope * 0.72);
    }

    sample(x) {
      const index = this.segmentIndex(x);
      const a = this.points[index];
      const b = this.points[index + 1];
      const width = Math.max(1, b.x - a.x);
      const t = clamp((x - a.x) / width, 0, 1);
      const t2 = t * t;
      const t3 = t2 * t;
      const m0 = this.tangentAt(index);
      const m1 = this.tangentAt(index + 1);
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      const y = h00 * a.y + h10 * width * m0 + h01 * b.y + h11 * width * m1;
      const dyDt = (6 * t2 - 6 * t) * a.y + (3 * t2 - 4 * t + 1) * width * m0
        + (-6 * t2 + 6 * t) * b.y + (3 * t2 - 2 * t) * width * m1;
      const d2yDt2 = (12 * t - 6) * a.y + (6 * t - 4) * width * m0
        + (-12 * t + 6) * b.y + (6 * t - 2) * width * m1;
      const slope = clamp(dyDt / width, -this.maxSlope * 1.04, this.maxSlope * 1.04);
      const second = d2yDt2 / (width * width);
      const curvature = second / Math.pow(1 + slope * slope, 1.5);
      return { y, slope, second, curvature, index };
    }

    height(x) { return this.sample(x).y; }
    slope(x) { return this.sample(x).slope; }
    curvature(x) { return this.sample(x).curvature; }

    centerHeight(x, radius = 0) {
      const sample = this.sample(x);
      return sample.y - radius * Math.hypot(1, sample.slope);
    }

    frame(x, radius = 0) {
      const sample = this.sample(x);
      const epsilon = 1.5;
      const centerY = sample.y - radius * Math.hypot(1, sample.slope);
      const beforeY = this.centerHeight(x - epsilon, radius);
      const afterY = this.centerHeight(x + epsilon, radius);
      const centerSlope = (afterY - beforeY) / (epsilon * 2);
      const centerSecond = (afterY - 2 * centerY + beforeY) / (epsilon * epsilon);
      const centerLength = Math.hypot(1, centerSlope);
      const tx = 1 / centerLength;
      const ty = centerSlope / centerLength;
      const nx = centerSlope / centerLength;
      const ny = -1 / centerLength;
      const centerCurvature = centerSecond / Math.pow(1 + centerSlope * centerSlope, 1.5);
      return {
        ...sample,
        groundSlope: sample.slope,
        groundCurvature: sample.curvature,
        slope: centerSlope,
        curvature: centerCurvature,
        second: centerSecond,
        tx, ty, nx, ny, length: centerLength, centerY
      };
    }
  }

  const DEFAULT_CONFIG = Object.freeze({
    massKg: 136.0777,
    radius: 24,
    gravity: 640,
    groundDiveExtraGravity: 520,
    airDiveExtraGravity: 980,
    rollingInertiaFactor: 1.4,
    rollingResistance: 3.4,
    rollingSpeedDrag: 0.0018,
    airDrag: 0.00003,
    maxSpeedSafety: 2300,
    maxSubsteps: 22,
    collisionIterations: 14,
    detachForceMargin: 24,
    minGroundContact: 0.065,
    perfectAngle: 0.18,
    goodAngle: 0.5,
    perfectNormalSpeed: 180,
    goodNormalSpeed: 430,
    hardNormalSpeed: 930,
    crashNormalSpeed: 1550,
    crashAngle: 1.47,
    stallSpeed: 22,
    stallDelay: 0.72,
    failAfterX: 1500,
    perfectRetention: 0.998,
    goodRetention: 0.94,
    roughRetentionMin: 0.52,
    roughRetentionMax: 0.8
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
      const speed = 245;
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
        groundTime: 1
      };
      this.flight = {
        airtime: 0,
        launchX: startX,
        launchY: frame.centerY,
        launchSpeed: speed,
        maxAltitude: 0,
        maxSpeed: speed,
        distance: 0
      };
      this.elapsed = 0;
      this.events = [];
      return this.ball;
    }

    consumeEvents() {
      const output = this.events;
      this.events = [];
      return output;
    }

    emit(type, payload = {}) { this.events.push({ type, time: this.elapsed, ...payload }); }

    surfaceGap(x, y) {
      const frame = this.terrain.frame(x, this.ball.radius);
      return y - frame.centerY;
    }

    detach(frame, speed, normalForcePerMass) {
      const ball = this.ball;
      ball.grounded = false;
      ball.groundSpeed = speed;
      ball.groundTime = 0;
      ball.vx = frame.tx * speed;
      ball.vy = frame.ty * speed;
      ball.y = frame.centerY - 0.02;
      this.flight = {
        airtime: 0,
        launchX: ball.x,
        launchY: ball.y,
        launchSpeed: speed,
        maxAltitude: 0,
        maxSpeed: speed,
        distance: 0
      };
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
      const travel = speed * dt;
      const targetTravel = this.ball.radius * 0.25;
      const substeps = clamp(Math.ceil(travel / targetTravel), 1, this.config.maxSubsteps);
      const subDt = dt / substeps;
      for (let index = 0; index < substeps; index++) {
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

      const totalGravity = c.gravity + (held ? c.groundDiveExtraGravity : 0);
      const gravityOutward = totalGravity * frame.ny;
      const requiredOutward = -speed * speed * frame.curvature;
      const normalForcePerMass = requiredOutward - gravityOutward;

      const canDetach = normalForcePerMass < -c.detachForceMargin
        && ball.groundTime >= c.minGroundContact;
      if (canDetach && speed > 90) {
        this.detach(frame, speed, normalForcePerMass);
        return;
      }

      const tangentGravity = totalGravity * frame.ty;
      const resistance = c.rollingResistance + speed * c.rollingSpeedDrag;
      const acceleration = tangentGravity / c.rollingInertiaFactor - resistance;
      speed = clamp(speed + acceleration * dt, 0, c.maxSpeedSafety);

      ball.x += frame.tx * speed * dt;
      frame = this.terrain.frame(ball.x, ball.radius);
      ball.y = frame.centerY;
      ball.vx = frame.tx * speed;
      ball.vy = frame.ty * speed;
      ball.groundSpeed = speed;
      ball.omega = speed / ball.radius;
      ball.rotation += ball.omega * dt;
      ball.groundTime += dt;

      if (ball.x > c.failAfterX && speed < c.stallSpeed && frame.slope < -0.045) ball.stallTime += dt;
      else ball.stallTime = Math.max(0, ball.stallTime - dt * 2);

      if (ball.stallTime >= c.stallDelay || speed <= 0.2 || ball.vx < -0.1) {
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
      const speedBefore = Math.hypot(ball.vx, ball.vy);
      if (speedBefore > 0) {
        const dragAcceleration = c.airDrag * speedBefore * speedBefore;
        ball.vx -= (ball.vx / speedBefore) * dragAcceleration * dt;
        ball.vy -= (ball.vy / speedBefore) * dragAcceleration * dt;
      }
      const projectedVy = ball.vy + totalGravity * dt;
      const speedAfter = Math.hypot(ball.vx, projectedVy);
      if (speedAfter > c.maxSpeedSafety) {
        const scale = c.maxSpeedSafety / speedAfter;
        ball.vx *= scale;
        ball.vy *= scale;
      }
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt + 0.5 * totalGravity * dt * dt;
      ball.vy += totalGravity * dt;
      ball.rotation += ball.omega * dt;

      this.flight.airtime += dt;
      this.flight.distance = ball.x - this.flight.launchX;
      this.flight.maxSpeed = Math.max(this.flight.maxSpeed, Math.hypot(ball.vx, ball.vy));
      const altitude = this.terrain.frame(ball.x, ball.radius).centerY - ball.y;
      this.flight.maxAltitude = Math.max(this.flight.maxAltitude, altitude);

      const newGap = this.surfaceGap(ball.x, ball.y);
      if (oldGap <= 0 && newGap >= 0) this.resolveSweptCollision(oldX, oldY, ball.x, ball.y);
      else if (newGap > ball.radius * 0.08) this.resolveSweptCollision(oldX, oldY, ball.x, ball.y);
    }

    resolveSweptCollision(oldX, oldY, newX, newY) {
      const c = this.config;
      const ball = this.ball;
      let low = 0;
      let high = 1;
      for (let iteration = 0; iteration < c.collisionIterations; iteration++) {
        const mid = (low + high) * 0.5;
        const x = lerp(oldX, newX, mid);
        const y = lerp(oldY, newY, mid);
        if (this.surfaceGap(x, y) >= 0) high = mid;
        else low = mid;
      }

      ball.x = lerp(oldX, newX, high);
      const frame = this.terrain.frame(ball.x, ball.radius);
      ball.y = frame.centerY;

      const tangentSpeed = dot(ball.vx, ball.vy, frame.tx, frame.ty);
      const outwardSpeed = dot(ball.vx, ball.vy, frame.nx, frame.ny);
      const normalImpact = Math.max(0, -outwardSpeed);
      const landingAngle = Math.atan2(normalImpact, Math.max(1, tangentSpeed));

      if (tangentSpeed <= 0) {
        this.emit('crash', {
          reason: 'backward', x: ball.x, tangentSpeed, normalImpact, landingAngle,
          flight: { ...this.flight }
        });
        return;
      }
      if (normalImpact > c.crashNormalSpeed || landingAngle > c.crashAngle) {
        this.emit('crash', {
          reason: 'impact', x: ball.x, tangentSpeed, normalImpact, landingAngle,
          flight: { ...this.flight }
        });
        return;
      }

      let grade;
      let retention;
      if (landingAngle <= c.perfectAngle && normalImpact <= c.perfectNormalSpeed) {
        grade = 'perfect';
        retention = c.perfectRetention;
      } else if (landingAngle <= c.goodAngle && normalImpact <= c.goodNormalSpeed) {
        grade = 'good';
        retention = c.goodRetention;
      } else {
        grade = normalImpact > c.hardNormalSpeed || landingAngle > 1.05 ? 'hard' : 'rough';
        const impactLoss = clamp(normalImpact / c.crashNormalSpeed, 0, 1) * 0.18;
        const angleLoss = clamp(landingAngle / c.crashAngle, 0, 1) * 0.13;
        retention = clamp(c.roughRetentionMax - impactLoss - angleLoss, c.roughRetentionMin, c.roughRetentionMax);
      }

      const settledSpeed = clamp(tangentSpeed * retention, 0, c.maxSpeedSafety);
      ball.grounded = true;
      ball.groundSpeed = settledSpeed;
      ball.vx = frame.tx * settledSpeed;
      ball.vy = frame.ty * settledSpeed;
      ball.omega = settledSpeed / ball.radius;
      ball.stallTime = 0;
      ball.groundTime = 0;
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
