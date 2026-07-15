(function attachDriftSand(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftSand = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDriftSand() {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function createPattern(ctx) {
    const tile = document.createElement('canvas');
    tile.width = 128;
    tile.height = 128;
    const c = tile.getContext('2d');

    for (let index = 0; index < 300; index++) {
      c.fillStyle = Math.random() < 0.62
        ? 'rgba(255,249,215,.22)'
        : 'rgba(194,132,54,.075)';
      const size = Math.random() < 0.92 ? 1 : 1.5;
      c.fillRect(Math.random() * 128, Math.random() * 128, size, size);
    }

    for (let index = 0; index < 14; index++) {
      const y = Math.random() * 128;
      c.strokeStyle = 'rgba(177,112,39,.055)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(Math.random() * 26, y);
      c.quadraticCurveTo(60, y + Math.random() * 5 - 2.5, 95 + Math.random() * 33, y + Math.random() * 4 - 2);
      c.stroke();
    }
    return ctx.createPattern(tile, 'repeat');
  }

  class SandSystem {
    constructor(terrain, world, motionEnabled) {
      this.terrain = terrain;
      this.world = world;
      this.motionEnabled = motionEnabled;
      this.grains = [];
      this.dust = [];
      this.tracks = [];
    }

    clear() {
      this.grains.length = 0;
      this.dust.length = 0;
      this.tracks.length = 0;
    }

    landing(event) {
      if (!this.motionEnabled()) return;
      const frame = this.terrain.frame(event.x, this.world.ball.radius);
      const impact = clamp(event.normalImpact / 900, 0.18, 1.5);
      const speed = clamp(event.tangentSpeed / 900, 0.2, 1.4);
      const count = Math.round(16 + impact * 34 + speed * 12);

      for (let index = 0; index < count; index++) {
        const fan = (Math.random() - 0.5) * (1.25 + impact * 0.65);
        const backward = 55 + Math.random() * (160 + speed * 130);
        const upward = 60 + Math.random() * (170 + impact * 220);
        this.grains.push({
          x: event.x + (Math.random() - 0.5) * 12,
          y: frame.centerY + this.world.ball.radius * 0.55,
          vx: -frame.tx * backward + frame.nx * upward + frame.tx * fan * 90,
          vy: -frame.ty * backward + frame.ny * upward + frame.ty * fan * 90,
          life: 0.42 + Math.random() * 0.55,
          maxLife: 0.9,
          size: 1.2 + Math.random() * (2.4 + impact * 2.2),
          spin: (Math.random() - 0.5) * 12,
          angle: Math.random() * TAU,
          color: Math.random() < 0.58 ? '#f7d486' : '#e8b95f'
        });
      }

      for (let index = 0; index < Math.round(3 + impact * 5); index++) {
        this.dust.push({
          x: event.x - frame.tx * Math.random() * 24,
          y: frame.centerY - 4 - Math.random() * 12,
          vx: -frame.tx * (25 + Math.random() * 75),
          vy: frame.ny * (18 + Math.random() * 55),
          life: 0.65 + Math.random() * 0.6,
          maxLife: 1.2,
          radius: 12 + Math.random() * (18 + impact * 22)
        });
      }

      this.tracks.push({
        x: event.x,
        width: clamp(34 + event.normalImpact * 0.045, 36, 90),
        depth: clamp(5 + event.normalImpact * 0.012, 6, 19),
        life: 4.5,
        maxLife: 4.5
      });
    }

    takeoff(x, speed) {
      if (!this.motionEnabled() || speed < 300) return;
      const frame = this.terrain.frame(x, this.world.ball.radius);
      const count = Math.round(clamp(speed / 85, 4, 14));
      for (let index = 0; index < count; index++) {
        const backward = 35 + Math.random() * 90;
        const upward = 35 + Math.random() * 80;
        this.grains.push({
          x,
          y: frame.centerY + this.world.ball.radius * 0.6,
          vx: -frame.tx * backward + frame.nx * upward,
          vy: -frame.ty * backward + frame.ny * upward,
          life: 0.3 + Math.random() * 0.32,
          maxLife: 0.62,
          size: 1 + Math.random() * 2.5,
          spin: (Math.random() - 0.5) * 10,
          angle: Math.random() * TAU,
          color: '#f1ca78'
        });
      }
    }

    update(dt) {
      if (this.motionEnabled() && this.world.ball.grounded) {
        const speed = Math.hypot(this.world.ball.vx, this.world.ball.vy);
        if (speed > 430 && Math.random() < clamp((speed - 380) / 1500, 0.08, 0.38)) {
          const frame = this.terrain.frame(this.world.ball.x, this.world.ball.radius);
          this.grains.push({
            x: this.world.ball.x - frame.tx * this.world.ball.radius * 0.75,
            y: frame.centerY + this.world.ball.radius * 0.55,
            vx: -frame.tx * (30 + Math.random() * 75),
            vy: frame.ny * (18 + Math.random() * 35),
            life: 0.22 + Math.random() * 0.28,
            maxLife: 0.5,
            size: 0.8 + Math.random() * 1.7,
            spin: 0,
            angle: 0,
            color: '#edc46f'
          });
        }
      }

      for (let index = this.grains.length - 1; index >= 0; index--) {
        const grain = this.grains[index];
        grain.life -= dt;
        if (grain.life <= 0) {
          this.grains.splice(index, 1);
          continue;
        }
        grain.vy += 520 * dt;
        grain.vx *= Math.max(0, 1 - 0.55 * dt);
        grain.x += grain.vx * dt;
        grain.y += grain.vy * dt;
        grain.angle += grain.spin * dt;
      }

      for (let index = this.dust.length - 1; index >= 0; index--) {
        const cloud = this.dust[index];
        cloud.life -= dt;
        if (cloud.life <= 0) {
          this.dust.splice(index, 1);
          continue;
        }
        cloud.x += cloud.vx * dt;
        cloud.y += cloud.vy * dt;
        cloud.vx *= Math.max(0, 1 - 1.25 * dt);
        cloud.vy *= Math.max(0, 1 - 1.4 * dt);
        cloud.radius += 22 * dt;
      }

      for (let index = this.tracks.length - 1; index >= 0; index--) {
        this.tracks[index].life -= dt;
        if (this.tracks[index].life <= 0) this.tracks.splice(index, 1);
      }
    }
  }

  return { SandSystem, createPattern };
});
