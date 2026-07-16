(function attachDriftSand(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftSand = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDriftSand() {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);

  function createPattern(context, theme = {}) {
    const tile = document.createElement('canvas');
    tile.width = 192;
    tile.height = 192;
    const c = tile.getContext('2d');
    let state = 0x7a11c0de;
    const seeded = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };

    for (let index = 0; index < 360; index += 1) {
      const light = seeded() > 0.44;
      c.fillStyle = light ? 'rgba(255,255,235,.16)' : 'rgba(72,37,25,.075)';
      const size = seeded() > 0.9 ? 1.8 : 1;
      c.fillRect(seeded() * tile.width, seeded() * tile.height, size, size);
    }

    c.lineCap = 'round';
    for (let index = 0; index < 12; index += 1) {
      const y = seeded() * tile.height;
      c.strokeStyle = index % 3 ? 'rgba(89,49,28,.045)' : 'rgba(255,255,228,.065)';
      c.lineWidth = index % 4 ? 1 : 1.6;
      c.beginPath();
      c.moveTo(-15, y);
      c.bezierCurveTo(42, y + random(-5, 5), 116, y + random(-5, 5), 207, y + random(-3, 3));
      c.stroke();
    }

    if (theme.sandDeep) {
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = theme.sandDeep;
      c.globalAlpha = 0.06;
      c.fillRect(0, 0, tile.width, tile.height);
    }
    return context.createPattern(tile, 'repeat');
  }

  class SandSystem {
    constructor(terrain, world, motionEnabled = () => true) {
      this.terrain = terrain;
      this.world = world;
      this.motionEnabled = motionEnabled;
      this.grains = [];
      this.dust = [];
      this.tracks = [];
      this.rings = [];
      this.sparks = [];
      this.trail = [];
      this.coinPops = [];
      this.speedDustClock = 0;
      this.trailClock = 0;
    }

    clear() {
      this.grains.length = 0;
      this.dust.length = 0;
      this.tracks.length = 0;
      this.rings.length = 0;
      this.sparks.length = 0;
      this.trail.length = 0;
      this.coinPops.length = 0;
      this.speedDustClock = 0;
      this.trailClock = 0;
    }

    trim() {
      if (this.grains.length > 150) this.grains.splice(0, this.grains.length - 150);
      if (this.dust.length > 26) this.dust.splice(0, this.dust.length - 26);
      if (this.tracks.length > 22) this.tracks.splice(0, this.tracks.length - 22);
      if (this.rings.length > 12) this.rings.splice(0, this.rings.length - 12);
      if (this.sparks.length > 90) this.sparks.splice(0, this.sparks.length - 90);
      if (this.trail.length > 38) this.trail.splice(0, this.trail.length - 38);
      if (this.coinPops.length > 10) this.coinPops.splice(0, this.coinPops.length - 10);
    }

    addGrain(x, y, vx, vy, size, life, color) {
      this.grains.push({ x, y, vx, vy, size, life, maxLife: life, color, rotation: random(0, TAU), spin: random(-11, 11) });
    }

    landing(event) {
      if (!this.motionEnabled()) return;
      const frame = this.terrain.frame(event.x, this.world.ball.radius);
      const impact = clamp((event.normalImpact || 120) / 820, 0.14, 1.65);
      const speed = clamp((event.speed || event.tangentSpeed || 250) / 920, 0.2, 1.65);
      const grade = event.grade || 'good';
      const color = grade === 'perfect' ? '#fff7c8' : grade === 'recovery' ? '#88f3e9' : '#f8cd79';
      const count = Math.round(12 + impact * 27 + speed * 9);

      for (let index = 0; index < count; index += 1) {
        const backward = random(45, 155 + speed * 110);
        const lift = random(44, 120 + impact * 230);
        const spread = random(-110, 110) * (0.45 + impact * 0.35);
        this.addGrain(
          event.x + random(-9, 9),
          frame.centerY + this.world.ball.radius * 0.66,
          -frame.tx * backward + frame.nx * lift + frame.tx * spread,
          -frame.ty * backward + frame.ny * lift + frame.ty * spread,
          random(1.1, 2.8 + impact * 2.2),
          random(0.38, 0.82),
          Math.random() > 0.42 ? color : '#e3a74e'
        );
      }

      for (let index = 0; index < Math.round(3 + impact * 4); index += 1) {
        this.dust.push({
          x: event.x - frame.tx * random(0, 28),
          y: frame.centerY + random(-11, 5),
          vx: -frame.tx * random(22, 78),
          vy: frame.ny * random(12, 48),
          radius: random(13, 26) * (0.7 + impact * 0.45),
          life: random(0.58, 1.05),
          maxLife: 1.05,
          warm: Math.random() > 0.35
        });
      }

      this.tracks.push({
        x: event.x,
        width: clamp(34 + impact * 39, 34, 94),
        depth: clamp(4 + impact * 8, 5, 17),
        life: 5.2,
        maxLife: 5.2,
        grade
      });
      this.rings.push({
        x: event.x,
        y: frame.centerY,
        radius: this.world.ball.radius * 0.55,
        speed: 115 + impact * 105,
        life: grade === 'perfect' ? 0.7 : 0.48,
        maxLife: grade === 'perfect' ? 0.7 : 0.48,
        color
      });

      if (grade === 'perfect' || grade === 'recovery') {
        const sparkCount = grade === 'perfect' ? 18 : 12;
        for (let index = 0; index < sparkCount; index += 1) {
          const angle = random(Math.PI * 1.08, Math.PI * 1.92);
          const velocity = random(100, grade === 'perfect' ? 250 : 190);
          this.sparks.push({
            x: event.x,
            y: frame.centerY,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity,
            life: random(0.32, 0.68),
            maxLife: 0.68,
            size: random(1.4, 3.5),
            color
          });
        }
      }
      this.trim();
    }

    takeoff(x, speed) {
      if (!this.motionEnabled() || speed < 230) return;
      const frame = this.terrain.frame(x, this.world.ball.radius);
      const count = Math.round(clamp(speed / 72, 5, 18));
      for (let index = 0; index < count; index += 1) {
        const backward = random(36, 120);
        const lift = random(28, 92);
        this.addGrain(x + random(-5, 5), frame.centerY + this.world.ball.radius * 0.55,
          -frame.tx * backward + frame.nx * lift, -frame.ty * backward + frame.ny * lift,
          random(1, 3), random(0.28, 0.58), '#f5cb75');
      }
      this.trim();
    }

    collect(coin, color = '#ffd447') {
      if (!this.motionEnabled()) return;
      this.coinPops.push({ x: coin.x, y: coin.y, life: 0.62, maxLife: 0.62, radius: 10 });
      for (let index = 0; index < 14; index += 1) {
        const angle = index / 14 * TAU + random(-0.08, 0.08);
        const velocity = random(80, 205);
        this.sparks.push({ x: coin.x, y: coin.y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
          life: random(0.35, 0.7), maxLife: 0.7, size: random(1.6, 3.6), color });
      }
      this.trim();
    }

    lineCross(x, y, color = '#fff2a8') {
      if (!this.motionEnabled()) return;
      this.rings.push({ x, y, radius: 14, speed: 210, life: 0.72, maxLife: 0.72, color });
      for (let index = 0; index < 18; index += 1) {
        const angle = random(0, TAU);
        const velocity = random(80, 250);
        this.sparks.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
          life: random(0.32, 0.74), maxLife: 0.74, size: random(1.1, 3.2), color });
      }
      this.trim();
    }

    crash(x, y) {
      if (!this.motionEnabled()) return;
      for (let index = 0; index < 30; index += 1) {
        const angle = random(Math.PI * 1.05, Math.PI * 1.95);
        const velocity = random(110, 330);
        this.sparks.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
          life: random(0.45, 0.95), maxLife: 0.95, size: random(1.8, 4.5), color: index % 3 ? '#ff775f' : '#ffe08a' });
      }
      this.rings.push({ x, y, radius: 18, speed: 260, life: 0.6, maxLife: 0.6, color: '#ff775f' });
      this.trim();
    }

    update(dt, skin = {}) {
      const enabled = this.motionEnabled();
      const ball = this.world.ball;
      const speed = Math.hypot(ball.vx, ball.vy);

      if (enabled && ball.grounded && speed > 360) {
        this.speedDustClock -= dt;
        if (this.speedDustClock <= 0) {
          this.speedDustClock = clamp(0.08 - speed / 25000, 0.025, 0.07);
          const frame = this.terrain.frame(ball.x, ball.radius);
          this.addGrain(ball.x - frame.tx * ball.radius * 0.75, frame.centerY + ball.radius * 0.62,
            -frame.tx * random(30, 95), frame.ny * random(12, 42), random(0.8, 2.2), random(0.22, 0.46), '#efbb61');
        }
      }

      if (enabled && !ball.grounded && speed > 250) {
        this.trailClock -= dt;
        if (this.trailClock <= 0) {
          this.trailClock = clamp(0.045 - speed / 80000, 0.018, 0.042);
          this.trail.push({ x: ball.x, y: ball.y, radius: ball.radius * 0.42, life: 0.46, maxLife: 0.46,
            color: skin.trail || '#73f2ed', phase: Math.random() * TAU });
        }
      }

      for (let index = this.grains.length - 1; index >= 0; index -= 1) {
        const item = this.grains[index];
        item.life -= dt;
        if (item.life <= 0) { this.grains.splice(index, 1); continue; }
        item.vy += 500 * dt;
        item.vx *= Math.max(0, 1 - 0.42 * dt);
        item.x += item.vx * dt;
        item.y += item.vy * dt;
        item.rotation += item.spin * dt;
      }
      for (let index = this.dust.length - 1; index >= 0; index -= 1) {
        const item = this.dust[index];
        item.life -= dt;
        if (item.life <= 0) { this.dust.splice(index, 1); continue; }
        item.x += item.vx * dt;
        item.y += item.vy * dt;
        item.vx *= Math.max(0, 1 - 1.35 * dt);
        item.vy *= Math.max(0, 1 - 1.7 * dt);
        item.radius += 20 * dt;
      }
      for (let index = this.sparks.length - 1; index >= 0; index -= 1) {
        const item = this.sparks[index];
        item.life -= dt;
        if (item.life <= 0) { this.sparks.splice(index, 1); continue; }
        item.vy += 260 * dt;
        item.vx *= Math.max(0, 1 - 0.65 * dt);
        item.x += item.vx * dt;
        item.y += item.vy * dt;
      }
      for (const item of this.rings) { item.life -= dt; item.radius += item.speed * dt; }
      for (const item of this.tracks) item.life -= dt;
      for (const item of this.trail) { item.life -= dt; item.radius *= 1 + dt * 0.65; }
      for (const item of this.coinPops) { item.life -= dt; item.radius += 95 * dt; }
      this.rings = this.rings.filter(item => item.life > 0);
      this.tracks = this.tracks.filter(item => item.life > 0);
      this.trail = this.trail.filter(item => item.life > 0);
      this.coinPops = this.coinPops.filter(item => item.life > 0);
      this.trim();
    }
  }

  return { SandSystem, createPattern };
});
