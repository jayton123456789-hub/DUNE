(function attachAutopilot(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftAutopilot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAutopilot() {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const dot = (ax, ay, bx, by) => ax * bx + ay * by;

  class CurvePilot {
    constructor({ world, terrain }) {
      this.world = world;
      this.terrain = terrain;
      this.held = false;
      this.thinkTimer = 0;
      this.lastChoiceScore = 0;
      this.mode = 'demo';
      this.airCommit = 0;
    }

    reset(mode = 'demo') {
      this.mode = mode;
      this.held = false;
      this.thinkTimer = 0;
      this.lastChoiceScore = 0;
      this.airCommit = 0;
    }

    groundDecision() {
      const ball = this.world.ball;
      const speed = Math.hypot(ball.vx, ball.vy);
      const frame = this.terrain.frame(ball.x, ball.radius);
      const aheadNear = this.terrain.frame(ball.x + clamp(speed * 0.2, 70, 180), ball.radius);
      const aheadFar = this.terrain.frame(ball.x + clamp(speed * 0.46, 170, 430), ball.radius);
      const descending = frame.slope > 0.035;
      const climbing = frame.slope < -0.055;
      const valleyAhead = !climbing
        && (aheadNear.centerY > frame.centerY + 18 || aheadFar.centerY > frame.centerY + 55);
      const crestSoon = climbing && aheadNear.slope > -0.12 && aheadFar.slope > 0.015;

      if (descending || valleyAhead) return true;
      if (crestSoon) return false;
      if (climbing || speed < 360) return true;
      return frame.slope > -0.025;
    }

    simulateAir(held) {
      const ball = this.world.ball;
      const config = this.world.config;
      const radius = ball.radius;
      let x = ball.x;
      let y = ball.y;
      let vx = ball.vx;
      let vy = ball.vy;
      const dt = 1 / 90;
      const gravity = config.gravity + (held ? config.airDiveExtraGravity : 0);
      let previousGap = y - this.terrain.frame(x, radius).centerY;

      for (let step = 0; step < 360; step++) {
        const speed = Math.hypot(vx, vy);
        if (speed > 0) {
          const drag = config.airDrag * speed * speed;
          vx -= vx / speed * drag * dt;
          vy -= vy / speed * drag * dt;
        }
        const forwardTarget = held ? config.heldAirForwardSpeed : config.airForwardSpeed;
        if (vx < forwardTarget) {
          vx += (forwardTarget - vx) * config.airForwardResponse * dt;
        }
        vx = Math.max(config.minimumAirForwardSpeed, vx);
        vy += gravity * dt;
        x += vx * dt;
        y += vy * dt;
        const frame = this.terrain.frame(x, radius);
        const gap = y - frame.centerY;
        if (step > 3 && previousGap <= 0 && gap >= 0) {
          const tangent = dot(vx, vy, frame.tx, frame.ty);
          const outward = dot(vx, vy, frame.nx, frame.ny);
          const normal = Math.max(0, -outward);
          const angle = Math.atan2(normal, Math.max(1, tangent));
          const survivalPenalty = tangent <= 0 ? 100000 : 0;
          const impactPenalty = normal * 0.72 + angle * 620;
          const targetSlopeBonus = clamp(-Math.abs(angle - 0.11) * 180, -100, 0);
          const distanceBonus = clamp((x - ball.x) * 0.07, 0, 120);
          return {
            score: tangent + distanceBonus + targetSlopeBonus - impactPenalty - survivalPenalty,
            x,
            y: frame.centerY,
            tangent,
            normal,
            angle,
            time: step * dt
          };
        }
        previousGap = gap;
      }
      return { score: -50000, x, y, tangent: 0, normal: 9999, angle: Math.PI / 2, time: 4 };
    }

    airDecision() {
      const release = this.simulateAir(false);
      const dive = this.simulateAir(true);
      const difference = dive.score - release.score;
      const ball = this.world.ball;

      if (ball.vy < -80 && this.world.flight.airtime < 0.5) return false;
      if (this.airCommit > 0) {
        this.airCommit -= 0.08;
        return this.held;
      }

      if (difference > 42) {
        this.lastChoiceScore = dive.score;
        this.airCommit = 0.12;
        return true;
      }
      if (difference < -42) {
        this.lastChoiceScore = release.score;
        this.airCommit = 0.12;
        return false;
      }

      const ground = this.terrain.frame(ball.x, ball.radius).centerY;
      const altitude = ground - ball.y;
      if (ball.vy > 0 && altitude < 220) return dive.normal < release.normal;
      return this.held;
    }

    update(dt) {
      this.thinkTimer -= dt;
      if (this.thinkTimer > 0) return this.held;
      this.thinkTimer = this.world.ball.grounded ? 0.045 : 0.08;
      this.held = this.world.ball.grounded ? this.groundDecision() : this.airDecision();
      return this.held;
    }
  }

  return { CurvePilot };
});
