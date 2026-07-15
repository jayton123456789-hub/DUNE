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
  }

  class SplineTerrain {
    constructor(options = {}) {
      this.top = options.top ?? 155;
      this.bottom = options.bottom ?? 585;
      this.maxSlope = options.maxSlope ?? 1.28;
      this.maxCurvature = options.maxCurvature ?? 0.0075;
      this.seed = options.seed ?? 0x51f15e;
      this.points = [];
      this.reset(this.seed);
    }

    reset(seed = this.seed) {
      this.seed = seed >>> 0;
      this.random = new SeededRandom(this.seed);
      this.points = [
        { x: -500, y: 175, kind: 'peak' },
        { x: 120, y: 170, kind: 'peak' },
        { x: 650, y: 575, kind: 'valley' },
        { x: 1135, y: 235, kind: 'peak' },
        { x: 1580, y: 535, kind: 'valley' },
        { x: 1995, y: 275, kind: 'peak' },
        { x: 2450, y: 555, kind: 'valley' }
      ];
      this.nextKind = 'peak';
      this.ensure(9000);
    }

    ensure(targetX) {
      while (this.points[this.points.length - 1].x < targetX) {
        const last = this.points[this.points.length - 1];
        const previous = this.points[this.points.length - 2];
        const difficulty = clamp((last.x - 1800) / 26000, 0, 1);
        let kind = last.kind === 'peak' ? 'valley' : 'peak';

        const softFeature = this.random.next() < 0.16;
        let y;
        if (kind === 'peak') {
          y = softFeature
            ? this.random.range(250, 330)
            : this.random.range(this.top - 18 * difficulty, 255 - 10 * difficulty);
        } else {
          y = softFeature
            ? this.random.range(430, 500)
            : this.random.range(475 + 22 * difficulty, this.bottom + 14 * difficulty);
        }
        y = clamp(y, 125, 610);

        const delta = Math.abs(y - last.y);
        if (delta < 145) {
          y = kind === 'peak' ? clamp(last.y - this.random.range(175, 260), 135, 310)
            : clamp(last.y + this.random.range(175, 270), 440, 605);
        }

        const actualDelta = Math.abs(y - last.y);
        const densityRoll = this.random.next();
        let width;
        if (densityRoll < 0.22) width = this.random.range(245, 310);
        else if (densityRoll < 0.84) width = this.random.range(310, 465);
        else width = this.random.range(465, 650);

        const slopeWidth = actualDelta * PI / (2 * this.maxSlope);
        const curvatureWidth = Math.sqrt(actualDelta * PI * PI / (2 * this.maxCurvature));
        width = Math.max(width, slopeWidth, curvatureWidth);
        width = clamp(width, 245, 675);

        const previousWidth = last.x - previous.x;
        if (previousWidth > 530 && width > 530) {
          const compact = this.random.range(300, 430);
          width = Math.max(compact, slopeWidth, curvatureWidth);
        }

        this.points.push({ x: last.x + width, y, kind });
      }
    }

    segmentIndex(x) {
      this.ensure(x + 2200);
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

    sample(x) {
      const index = this.segmentIndex(x);
      const a = this.points[index];
      const b = this.points[index + 1];
      const width = Math.max(1, b.x - a.x);
      const t = clamp((x - a.x) / width, 0, 1);
      const phase = PI * t;
      const delta = b.y - a.y;
      const blend = 0.5 - 0.5 * Math.cos(phase);
      const y = a.y + delta * blend;
      const slope = delta * 0.5 * PI * Math.sin(phase) / width;
      const second = delta * 0.5 * PI * PI * Math.cos(phase) / (width * width);
      const denominator = Math.pow(1 + slope * slope, 1.5);
      const curvature = second / denominator;
      return { y, slope, second, curvature, index };
    }

    height(x) { return this.sample(x).y; }
    slope(x) { return this.sample(x).slope; }
    curvature(x) { return this.sample(x).curvature; }

    frame(x, radius = 0) {
      const sample = this.sample(x);
      const length = Math.hypot(1, sample.slope);
      const tx = 1 / length;
      const ty = sample.slope / length;
      const nx = sample.slope / length;
      const ny = -1 / length;
      const centerY = sample.y - radius * length;
      return { ...sample, tx, ty, nx, ny, length, centerY };
    }
  }

  const DEFAULT_CONFIG = Object.freeze({
    massKg: 136.0777,
    radius: 24,
    gravity: 535,
    diveExtraGravity: 1040,
    rollingInertiaFactor: 1.4,
    rollingResistance: 4.8,
    rollingSpeedDrag: 0.002,
    airDrag: 0.000018,
    maxSpeedSafety: 2400,
    maxSubsteps: 18,
    collisionIterations: 12,
    perfectAngle: 0.21,
    goodAngle: 0.49,
    perfectNormalSpeed: 245,
    goodNormalSpeed: 485,
    crashNormalSpeed: 760,
    stallSpeed: 32,
    stallDelay: 0.52,
    failAfterX: 1420,
    perfectRetention: 1.025,
    goodRetention: 0.965,
    restitution: 0.02
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
      const speed = 255;
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
        rotation: 0
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
      const targetTravel = this.ball.radius * 0.28;
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

      const totalGravity = c.gravity + (held ? c.diveExtraGravity : 0);
      const gravityOutward = totalGravity * frame.ny;
      const requiredOutward = -speed * speed * frame.curvature;
      const normalForcePerMass = requiredOutward - gravityOutward;

      if (normalForcePerMass <= 0 && speed > 80) {
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

      if (ball.x > c.failAfterX && speed < c.stallSpeed && frame.slope < -0.035) ball.stallTime += dt;
      else ball.stallTime = Math.max(0, ball.stallTime - dt * 2);

      if (ball.stallTime >= c.stallDelay || speed <= 0.25 || ball.vx < -0.1) {
        this.emit('stall', { speed, x: ball.x, slope: frame.slope });
      }
    }

    stepAir(dt, held) {
      const c = this.config;
      const ball = this.ball;
      const oldX = ball.x;
      const oldY = ball.y;
      const oldGap = this.surfaceGap(oldX, oldY);

      const totalGravity = c.gravity + (held ? c.diveExtraGravity : 0);
      const speedBefore = Math.hypot(ball.vx, ball.vy);
      if (speedBefore > 0) {
        const dragAcceleration = c.airDrag * speedBefore * speedBefore;
        ball.vx -= (ball.vx / speedBefore) * dragAcceleration * dt;
        ball.vy -= (ball.vy / speedBefore) * dragAcceleration * dt;
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

      if (tangentSpeed <= 0 || normalImpact > c.crashNormalSpeed || landingAngle > 0.93) {
        this.emit('crash', {
          reason: tangentSpeed <= 0 ? 'backward' : 'impact',
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
      let bonus = 0;
      if (landingAngle <= c.perfectAngle && normalImpact <= c.perfectNormalSpeed) {
        grade = 'perfect';
        retention = c.perfectRetention;
        bonus = clamp(
          this.flight.airtime * 9 + this.flight.maxAltitude * 0.045 + Math.max(0, this.flight.launchSpeed - 420) * 0.035,
          12,
          78
        );
      } else if (landingAngle <= c.goodAngle && normalImpact <= c.goodNormalSpeed) {
        grade = 'good';
        retention = c.goodRetention;
      } else {
        this.emit('crash', {
          reason: 'alignment',
          x: ball.x,
          tangentSpeed,
          normalImpact,
          landingAngle,
          flight: { ...this.flight }
        });
        return;
      }

      const settledSpeed = clamp(tangentSpeed * retention + bonus, 0, c.maxSpeedSafety);
      ball.grounded = true;
      ball.groundSpeed = settledSpeed;
      ball.vx = frame.tx * settledSpeed;
      ball.vy = frame.ty * settledSpeed;
      ball.omega = settledSpeed / ball.radius;
      ball.stallTime = 0;
      this.emit('landing', {
        grade,
        x: ball.x,
        speed: settledSpeed,
        tangentSpeed,
        normalImpact,
        landingAngle,
        bonus,
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