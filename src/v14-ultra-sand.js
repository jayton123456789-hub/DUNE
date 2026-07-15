(function installUltraSand(root) {
  'use strict';

  const base = root.DriftSand;
  if (!base || base.SandSystem?.__ultraSand) return;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  class UltraSandSystem {
    constructor(terrain, world, motionEnabled) {
      this.terrain = terrain;
      this.world = world;
      this.motionEnabled = motionEnabled;
      this.grains = [];
      this.dust = [];
      this.tracks = [];
      this.grainPool = [];
      this.dustPool = [];
      this.trackPool = [];
      this.rollAccumulator = 0;
      this.randomState = 0x8f31a2b7;
    }

    random() {
      this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
      return this.randomState / 4294967296;
    }

    clear() {
      while (this.grains.length) this.grainPool.push(this.grains.pop());
      while (this.dust.length) this.dustPool.push(this.dust.pop());
      while (this.tracks.length) this.trackPool.push(this.tracks.pop());
      this.rollAccumulator = 0;
    }

    acquire(pool) { return pool.pop() || {}; }

    pushGrain(data) {
      if (this.grains.length >= 48) return;
      const grain = this.acquire(this.grainPool);
      Object.assign(grain, data);
      this.grains.push(grain);
    }

    pushDust(data) {
      if (this.dust.length >= 4) return;
      const cloud = this.acquire(this.dustPool);
      Object.assign(cloud, data);
      this.dust.push(cloud);
    }

    pushTrack(data) {
      if (this.tracks.length >= 4) {
        const recycled = this.tracks.shift();
        Object.assign(recycled, data);
        this.tracks.push(recycled);
        return;
      }
      const track = this.acquire(this.trackPool);
      Object.assign(track, data);
      this.tracks.push(track);
    }

    landing(event) {
      if (!this.motionEnabled()) return;
      const frame = this.terrain.frame(event.x, this.world.ball.radius);
      const impact = clamp(event.normalImpact / 950, 0.12, 1.35);
      const speed = clamp(event.tangentSpeed / 950, 0.15, 1.25);
      const count = Math.round(9 + impact * 13 + speed * 5);

      for (let index = 0; index < count; index += 1) {
        const fan = (this.random() - 0.5) * (1 + impact * 0.55);
        const backward = 45 + this.random() * (115 + speed * 95);
        const upward = 45 + this.random() * (105 + impact * 150);
        this.pushGrain({
          x: event.x + (this.random() - 0.5) * 10,
          y: frame.centerY + this.world.ball.radius * 0.55,
          vx: -frame.tx * backward + frame.nx * upward + frame.tx * fan * 60,
          vy: -frame.ty * backward + frame.ny * upward + frame.ty * fan * 60,
          life: 0.34 + this.random() * 0.38,
          maxLife: 0.72,
          size: 1 + this.random() * (1.7 + impact * 1.5),
          color: this.random() < 0.55 ? '#f7d486' : '#e8b95f'
        });
      }

      const dustCount = Math.min(3, 1 + Math.round(impact * 1.5));
      for (let index = 0; index < dustCount; index += 1) {
        this.pushDust({
          x: event.x - frame.tx * this.random() * 18,
          y: frame.centerY - 3 - this.random() * 9,
          vx: -frame.tx * (20 + this.random() * 50),
          vy: frame.ny * (14 + this.random() * 35),
          life: 0.48 + this.random() * 0.38,
          maxLife: 0.86,
          radius: 10 + this.random() * (10 + impact * 14)
        });
      }

      this.pushTrack({
        x: event.x,
        width: clamp(32 + event.normalImpact * 0.025, 34, 68),
        depth: clamp(4 + event.normalImpact * 0.007, 5, 12),
        life: 2.8,
        maxLife: 2.8
      });
    }

    takeoff(x, speed) {
      if (!this.motionEnabled() || speed < 360) return;
      const frame = this.terrain.frame(x, this.world.ball.radius);
      const count = Math.round(clamp(speed / 170, 3, 7));
      for (let index = 0; index < count; index += 1) {
        const backward = 25 + this.random() * 55;
        const upward = 25 + this.random() * 48;
        this.pushGrain({
          x,
          y: frame.centerY + this.world.ball.radius * 0.58,
          vx: -frame.tx * backward + frame.nx * upward,
          vy: -frame.ty * backward + frame.ny * upward,
          life: 0.24 + this.random() * 0.24,
          maxLife: 0.48,
          size: 0.8 + this.random() * 1.5,
          color: '#f1ca78'
        });
      }
    }

    removeAt(array, pool, index) {
      const last = array.length - 1;
      const item = array[index];
      if (index !== last) array[index] = array[last];
      array.pop();
      pool.push(item);
    }

    update(dt) {
      const step = Math.min(0.05, Math.max(0, dt));
      this.rollAccumulator += step;

      if (this.motionEnabled() && this.world.ball.grounded && this.rollAccumulator >= 1 / 30) {
        this.rollAccumulator = 0;
        const speed = Math.hypot(this.world.ball.vx, this.world.ball.vy);
        if (speed > 520 && this.random() < clamp((speed - 500) / 1900, 0.04, 0.18)) {
          const frame = this.terrain.frame(this.world.ball.x, this.world.ball.radius);
          this.pushGrain({
            x: this.world.ball.x - frame.tx * this.world.ball.radius * 0.72,
            y: frame.centerY + this.world.ball.radius * 0.53,
            vx: -frame.tx * (25 + this.random() * 45),
            vy: frame.ny * (12 + this.random() * 24),
            life: 0.18 + this.random() * 0.2,
            maxLife: 0.38,
            size: 0.7 + this.random() * 1.1,
            color: '#edc46f'
          });
        }
      }

      for (let index = this.grains.length - 1; index >= 0; index -= 1) {
        const grain = this.grains[index];
        grain.life -= step;
        if (grain.life <= 0) {
          this.removeAt(this.grains, this.grainPool, index);
          continue;
        }
        grain.vy += 500 * step;
        grain.vx *= 1 - 0.5 * step;
        grain.x += grain.vx * step;
        grain.y += grain.vy * step;
      }

      for (let index = this.dust.length - 1; index >= 0; index -= 1) {
        const cloud = this.dust[index];
        cloud.life -= step;
        if (cloud.life <= 0) {
          this.removeAt(this.dust, this.dustPool, index);
          continue;
        }
        cloud.x += cloud.vx * step;
        cloud.y += cloud.vy * step;
        cloud.vx *= 1 - 1.1 * step;
        cloud.vy *= 1 - 1.25 * step;
        cloud.radius += 15 * step;
      }

      for (let index = this.tracks.length - 1; index >= 0; index -= 1) {
        const track = this.tracks[index];
        track.life -= step;
        if (track.life <= 0) this.removeAt(this.tracks, this.trackPool, index);
      }
    }
  }

  UltraSandSystem.__ultraSand = true;
  root.DriftSand = { ...base, SandSystem: UltraSandSystem };
})(typeof globalThis !== 'undefined' ? globalThis : window);
