(function attachSandRenderer(root, factory) {
  root.DriftSandRenderer = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  class SandRenderer {
    constructor({ canvas, terrain, world, sand, coins, camera, selectedSkin, selectedWorld, score, presentation, bestDistance, showBestMarker, showCoins }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this.terrain = terrain;
      this.world = world;
      this.sand = sand;
      this.coins = coins;
      this.camera = camera;
      this.selectedSkin = selectedSkin;
      this.selectedWorld = selectedWorld;
      this.score = score;
      this.presentation = presentation || (() => ({ motion: true }));
      this.bestDistance = bestDistance || (() => 0);
      this.showBestMarker = showBestMarker || (() => true);
      this.showCoins = showCoins || (() => true);
      this.shake = 0;
      this.shakeAngle = 0;
      this.pattern = null;
      this.patternWorld = '';
      this.lastResizeKey = '';
      this.bestLabel = document.getElementById('bestMarkerLabel');
      this.stars = Array.from({ length: 92 }, (_, index) => ({
        x: this.noise(index * 13.31 + 1.7),
        y: this.noise(index * 47.87 + 5.2) * 0.72,
        size: 0.65 + this.noise(index * 71.1 + 0.3) * 1.55,
        alpha: 0.32 + this.noise(index * 17.9 + 2.8) * 0.66
      }));
      this.motes = Array.from({ length: 26 }, (_, index) => ({
        x: this.noise(index * 23.1 + 3.7),
        y: this.noise(index * 41.3 + 8.1),
        size: 0.7 + this.noise(index * 9.8) * 1.9,
        drift: 0.4 + this.noise(index * 31.7) * 0.8
      }));
      this.resize(true);
    }

    noise(value) {
      return ((Math.sin(value * 12.9898) * 43758.5453) % 1 + 1) % 1;
    }

    viewport() {
      const viewport = window.visualViewport;
      return {
        width: Math.max(1, Math.round(viewport?.width || document.documentElement.clientWidth || innerWidth || 1)),
        height: Math.max(1, Math.round(viewport?.height || document.documentElement.clientHeight || innerHeight || 1))
      };
    }

    resize(force = false) {
      const viewport = this.viewport();
      const nativeDpr = Math.max(1, devicePixelRatio || 1);
      const budgetDpr = Math.sqrt(900000 / Math.max(1, viewport.width * viewport.height));
      const dpr = clamp(Math.min(nativeDpr, 1.75, budgetDpr), 1, 1.75);
      const key = `${viewport.width}:${viewport.height}:${dpr.toFixed(3)}`;
      if (!force && key === this.lastResizeKey) return false;
      this.lastResizeKey = key;
      this.W = viewport.width;
      this.H = viewport.height;
      this.DPR = dpr;
      this.baseScale = clamp(this.H / 620, 0.52, 1.08);
      this.canvas.width = Math.max(1, Math.round(this.W * dpr));
      this.canvas.height = Math.max(1, Math.round(this.H * dpr));
      this.canvas.style.width = `${this.W}px`;
      this.canvas.style.height = `${this.H}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.themeChanged();
      return true;
    }

    themeChanged() {
      const theme = this.selectedWorld();
      this.pattern = globalThis.DriftSand.createPattern(this.ctx, theme);
      this.patternWorld = theme.id;
    }

    kick(amount = 5) {
      if (!this.presentation().motion) return;
      this.shake = Math.max(this.shake, amount);
      this.shakeAngle = Math.random() * TAU;
    }

    scale() { return this.baseScale * this.camera.zoom; }
    sx(x) { return (x - this.camera.x) * this.scale(); }
    sy(y) { return (y - this.camera.y) * this.scale(); }

    hillY(screenX, layer, time) {
      const travel = this.camera.x * layer.parallax;
      const x = screenX + travel;
      return this.H * layer.base
        + Math.sin(x / layer.wave + layer.phase) * this.H * layer.height
        + Math.sin(x / (layer.wave * 0.43) + layer.phase * 1.7) * this.H * layer.detail
        + Math.sin(time * 0.00008 + layer.phase) * 1.4;
    }

    traceBackdrop(layer, time) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(-20, this.H + 20);
      for (let x = -20; x <= this.W + 20; x += 12) c.lineTo(x, this.hillY(x, layer, time));
      c.lineTo(this.W + 20, this.H + 20);
      c.closePath();
    }

    sky(time) {
      const c = this.ctx;
      const theme = this.selectedWorld();
      if (theme.id !== this.patternWorld) this.themeChanged();
      const altitudeBlend = clamp(this.camera.spaceBlend || 0, 0, 1);
      const sky = c.createLinearGradient(0, 0, 0, this.H);
      sky.addColorStop(0, theme.skyTop);
      sky.addColorStop(0.58, theme.skyBottom);
      sky.addColorStop(1, theme.horizon);
      c.fillStyle = sky;
      c.fillRect(0, 0, this.W, this.H);

      const sunX = this.W * theme.sunX - (this.camera.x * 0.008 % (this.W * 0.12));
      const sunY = this.H * theme.sunY + this.camera.y * 0.006;
      const sunRadius = clamp(this.H * 0.105, 24, 58);
      c.save();
      c.globalAlpha = 0.12;
      c.fillStyle = theme.sun;
      c.beginPath();
      c.arc(sunX, sunY, sunRadius * 1.85, 0, TAU);
      c.fill();
      c.globalAlpha = 0.95;
      const sun = c.createRadialGradient(sunX - sunRadius * 0.25, sunY - sunRadius * 0.3, 1, sunX, sunY, sunRadius);
      sun.addColorStop(0, '#fff');
      sun.addColorStop(0.28, theme.sun);
      sun.addColorStop(1, theme.sun);
      c.fillStyle = sun;
      c.beginPath();
      c.arc(sunX, sunY, sunRadius, 0, TAU);
      c.fill();
      c.restore();

      const night = theme.id === 'midnight' ? 0.92 : altitudeBlend;
      if (night > 0.015) {
        c.save();
        c.globalAlpha = night;
        for (const star of this.stars) {
          const x = ((star.x * this.W - this.camera.x * 0.012) % this.W + this.W) % this.W;
          const twinkle = 0.72 + Math.sin(time * 0.0018 + star.x * 31) * 0.28;
          c.globalAlpha = night * star.alpha * twinkle;
          c.fillStyle = theme.star || '#fff';
          c.beginPath();
          c.arc(x, star.y * this.H, star.size, 0, TAU);
          c.fill();
        }
        c.restore();
      }

      const layers = [
        { base: 0.71, height: 0.072, detail: 0.014, wave: 330, phase: 0.7, parallax: 0.055, color: theme.far, alpha: 0.48 },
        { base: 0.79, height: 0.086, detail: 0.02, wave: 245, phase: 2.4, parallax: 0.11, color: theme.mid, alpha: 0.68 }
      ];
      for (const layer of layers) {
        this.traceBackdrop(layer, time);
        c.globalAlpha = layer.alpha;
        c.fillStyle = layer.color;
        c.fill();
      }
      c.globalAlpha = 1;

      if (this.presentation().motion) {
        c.save();
        c.fillStyle = theme.crest;
        for (const mote of this.motes) {
          const x = ((mote.x * (this.W + 80) + time * 0.012 * mote.drift - this.camera.x * 0.018) % (this.W + 80) + this.W + 80) % (this.W + 80) - 40;
          const y = mote.y * this.H * 0.67 + Math.sin(time * 0.0007 + mote.x * 20) * 5;
          c.globalAlpha = 0.12 + altitudeBlend * 0.15;
          c.beginPath();
          c.arc(x, y, mote.size, 0, TAU);
          c.fill();
        }
        c.restore();
      }
    }

    terrainRange() {
      const scale = this.scale();
      return {
        start: this.camera.x - 42 / scale,
        end: this.camera.x + (this.W + 42) / scale,
        step: clamp(6 / scale, 3.5, 15)
      };
    }

    traceGround(range, verticalOffset = 0, close = true) {
      const c = this.ctx;
      c.beginPath();
      if (close) c.moveTo(-30, this.H + 45);
      let first = true;
      for (let x = range.start; x <= range.end + range.step; x += range.step) {
        const px = this.sx(x);
        const py = this.sy(this.terrain.height(x)) + verticalOffset;
        if (!close && first) c.moveTo(px, py);
        else c.lineTo(px, py);
        first = false;
      }
      if (close) {
        c.lineTo(this.W + 30, this.H + 45);
        c.closePath();
      }
    }

    scoreLine(time) {
      if (!this.score) return;
      const c = this.ctx;
      const y = this.sy(this.score.config.lineY);
      if (y < -45 || y > this.H + 45) return;
      const snapshot = this.score.snapshot();
      const active = snapshot.aboveLine;
      const pulse = active ? 0.78 + Math.sin(time * 0.008) * 0.14 : 0.48;
      c.save();
      c.strokeStyle = active ? `rgba(255,244,158,${pulse})` : `rgba(255,255,255,${pulse})`;
      c.lineWidth = active ? 3 : 2;
      c.shadowColor = active ? '#ffe55b' : '#c8ffff';
      c.shadowBlur = active ? 15 : 7;
      c.setLineDash([13, 9]);
      c.lineDashOffset = -time * (active ? 0.035 : 0.012);
      c.beginPath();
      c.moveTo(-20, y);
      c.lineTo(this.W + 20, y);
      c.stroke();
      c.setLineDash([]);
      c.shadowBlur = 0;
      const label = active ? `UNBANKED +${snapshot.pending}` : 'FLOW LINE';
      c.font = '900 10px ui-rounded, system-ui, sans-serif';
      c.textBaseline = 'middle';
      const width = c.measureText(label).width + 22;
      const x = this.W - width - 12;
      roundedRect(c, x, y - 13, width, 24, 12);
      c.fillStyle = active ? '#ffe36b' : 'rgba(5,40,51,.72)';
      c.fill();
      c.fillStyle = active ? '#17313a' : '#fff';
      c.fillText(label, x + 11, y - 1);
      c.restore();
    }

    ground(time) {
      const c = this.ctx;
      const theme = this.selectedWorld();
      const range = this.terrainRange();
      this.traceGround(range, 0, true);
      c.save();
      c.shadowColor = 'rgba(15,35,42,.16)';
      c.shadowBlur = 18;
      c.shadowOffsetY = -2;
      const sand = c.createLinearGradient(0, Math.max(0, this.sy(180)), 0, this.H);
      sand.addColorStop(0, theme.sandTop);
      sand.addColorStop(0.44, theme.sandMid);
      sand.addColorStop(1, theme.sandDeep);
      c.fillStyle = sand;
      c.fill();
      c.restore();

      if (this.pattern) {
        c.save();
        this.traceGround(range, 0, true);
        c.clip();
        c.globalAlpha = 0.45;
        c.translate(-((this.camera.x * this.scale()) % 192), 0);
        c.fillStyle = this.pattern;
        c.fillRect(-192, -10, this.W + 384, this.H + 30);
        c.restore();
      }

      this.drawTracks();
      this.traceGround(range, 0, false);
      c.strokeStyle = theme.crest;
      c.lineWidth = clamp(4.6 * this.scale(), 2.2, 5.4);
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.stroke();
      this.traceGround(range, clamp(8 * this.scale(), 3, 9), false);
      c.strokeStyle = 'rgba(64,36,24,.11)';
      c.lineWidth = clamp(4.5 * this.scale(), 2, 5.2);
      c.stroke();

      if (this.world.ball.grounded && Math.hypot(this.world.ball.vx, this.world.ball.vy) > 850 && this.presentation().motion) {
        c.save();
        c.globalAlpha = 0.11;
        c.strokeStyle = theme.crest;
        c.lineWidth = 1;
        for (let index = 0; index < 7; index += 1) {
          const y = this.H * (0.18 + index * 0.075) + Math.sin(time * 0.004 + index) * 7;
          c.beginPath();
          c.moveTo(-10, y);
          c.lineTo(this.W * (0.08 + index * 0.025), y - 5);
          c.stroke();
        }
        c.restore();
      }
    }

    drawTracks() {
      const c = this.ctx;
      for (const track of this.sand.tracks) {
        const frame = this.terrain.frame(track.x, this.world.ball.radius);
        const alpha = clamp(track.life / track.maxLife, 0, 1) * 0.22;
        c.save();
        c.translate(this.sx(track.x), this.sy(this.terrain.height(track.x)) + 2);
        c.rotate(Math.atan2(frame.groundSlope, 1));
        c.globalAlpha = alpha;
        c.fillStyle = track.grade === 'perfect' ? '#fff0b0' : '#6d3f29';
        c.beginPath();
        c.ellipse(0, 0, track.width * this.scale() * 0.5, track.depth * this.scale(), 0, 0, TAU);
        c.fill();
        c.restore();
      }
    }

    bestMarker() {
      const best = Number(this.bestDistance()) || 0;
      if (best <= 0 || !this.showBestMarker()) {
        this.bestLabel?.classList.remove('show');
        this.bestLabel?.setAttribute('aria-hidden', 'true');
        return;
      }
      const x = this.sx(120 + best * 10);
      if (x < 25 || x > this.W - 15) {
        this.bestLabel?.classList.remove('show');
        this.bestLabel?.setAttribute('aria-hidden', 'true');
        return;
      }
      const c = this.ctx;
      c.save();
      const y = this.sy(this.terrain.height(120 + best * 10));
      c.strokeStyle = 'rgba(255,255,255,.72)';
      c.lineWidth = 2;
      c.setLineDash([5, 6]);
      c.beginPath();
      c.moveTo(x, Math.max(70, y - 105));
      c.lineTo(x, y - 5);
      c.stroke();
      c.restore();
      if (this.bestLabel) {
        this.bestLabel.style.left = `${clamp(x, 60, this.W - 60)}px`;
        this.bestLabel.style.top = `${clamp(y - 125, 72, this.H - 60)}px`;
        this.bestLabel.classList.add('show');
        this.bestLabel.setAttribute('aria-hidden', 'false');
      }
    }

    drawCoins(time) {
      if (!this.showCoins()) return;
      const items = this.coins?.items || [];
      for (const coin of items) {
        if (coin.taken) continue;
        const x = this.sx(coin.x);
        const y = this.sy(coin.y);
        if (x < -38 || x > this.W + 38 || y < -42 || y > this.H + 42) continue;
        globalThis.DriftArt.drawCoin(this.ctx, { x, y, radius: clamp(14 * this.scale(), 10, 17), phase: coin.phase, time });
      }
    }

    drawEffects(time) {
      const c = this.ctx;
      const scale = this.scale();
      const skin = this.selectedSkin();

      for (const trail of this.sand.trail) {
        const alpha = Math.pow(clamp(trail.life / trail.maxLife, 0, 1), 1.5) * 0.62;
        const color = trail.color === 'rainbow' ? `hsl(${(time * 0.08 + trail.phase * 60) % 360} 95% 68%)` : trail.color;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = alpha;
        c.fillStyle = color;
        c.beginPath();
        c.arc(this.sx(trail.x), this.sy(trail.y), clamp(trail.radius * scale, 2, 15), 0, TAU);
        c.fill();
        c.restore();
      }

      for (const cloud of this.sand.dust) {
        const alpha = Math.pow(clamp(cloud.life / cloud.maxLife, 0, 1), 1.6) * 0.16;
        const x = this.sx(cloud.x);
        const y = this.sy(cloud.y);
        const radius = cloud.radius * scale;
        const gradient = c.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, cloud.warm ? `rgba(255,224,159,${alpha})` : `rgba(210,255,245,${alpha})`);
        gradient.addColorStop(1, 'rgba(215,158,72,0)');
        c.fillStyle = gradient;
        c.beginPath();
        c.arc(x, y, radius, 0, TAU);
        c.fill();
      }

      for (const grain of this.sand.grains) {
        c.save();
        c.translate(this.sx(grain.x), this.sy(grain.y));
        c.rotate(grain.rotation);
        c.globalAlpha = clamp(grain.life / grain.maxLife, 0, 1);
        c.fillStyle = grain.color;
        const size = clamp(grain.size * scale, 0.7, 6);
        c.beginPath();
        c.ellipse(0, 0, size * 1.45, size * 0.68, 0, 0, TAU);
        c.fill();
        c.restore();
      }

      for (const spark of this.sand.sparks) {
        const alpha = clamp(spark.life / spark.maxLife, 0, 1);
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = alpha;
        c.fillStyle = spark.color || skin.burst;
        c.beginPath();
        c.arc(this.sx(spark.x), this.sy(spark.y), clamp(spark.size * scale, 1, 5), 0, TAU);
        c.fill();
        c.restore();
      }

      for (const ring of this.sand.rings) {
        const alpha = clamp(ring.life / ring.maxLife, 0, 1);
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = alpha * 0.74;
        c.strokeStyle = ring.color;
        c.lineWidth = clamp(3 * alpha, 1, 3);
        c.beginPath();
        c.arc(this.sx(ring.x), this.sy(ring.y), ring.radius * scale, 0, TAU);
        c.stroke();
        c.restore();
      }

      for (const pop of this.sand.coinPops) {
        const alpha = clamp(pop.life / pop.maxLife, 0, 1);
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = alpha;
        c.strokeStyle = '#fff09a';
        c.lineWidth = 3 * alpha;
        c.beginPath();
        c.arc(this.sx(pop.x), this.sy(pop.y), pop.radius * scale, 0, TAU);
        c.stroke();
        c.restore();
      }
    }

    drawBall(time) {
      const c = this.ctx;
      const ball = this.world.ball;
      const scale = this.scale();
      const groundY = this.terrain.frame(ball.x, ball.radius).centerY;
      const altitude = Math.max(0, groundY - ball.y);
      const x = this.sx(ball.x);
      const y = this.sy(ball.y);
      const radius = clamp(ball.radius * scale, 12, 30);
      const shadowY = this.sy(groundY + ball.radius * 0.8);
      const shadowScale = clamp(1 - altitude / 700, 0.32, 1);
      c.save();
      c.globalAlpha = clamp(0.28 - altitude / 2400, 0.05, 0.28);
      c.fillStyle = '#173a3c';
      c.filter = `blur(${clamp(2 + altitude / 120, 2, 8)}px)`;
      c.beginPath();
      c.ellipse(x, shadowY, radius * 0.8 * shadowScale, radius * 0.25 * shadowScale, 0, 0, TAU);
      c.fill();
      c.restore();

      const scoreSnapshot = this.score?.snapshot();
      if (scoreSnapshot?.aboveLine) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.2 + Math.sin(time * 0.008) * 0.05;
        c.strokeStyle = this.selectedSkin().trail === 'rainbow' ? '#fff' : this.selectedSkin().trail;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, radius * 1.3, 0, TAU);
        c.stroke();
        c.restore();
      }

      globalThis.DriftArt.drawBall(c, { x, y, radius, rotation: ball.rotation, skin: this.selectedSkin(), time });
    }

    draw(time = performance.now()) {
      this.resize(false);
      this.sky(time);
      this.scoreLine(time);
      const motion = this.presentation().motion;
      let shakeX = 0;
      let shakeY = 0;
      if (this.shake > 0.05 && motion) {
        shakeX = Math.cos(this.shakeAngle + time * 0.04) * this.shake;
        shakeY = Math.sin(this.shakeAngle * 1.7 + time * 0.052) * this.shake * 0.62;
        this.shake *= 0.87;
      } else this.shake = 0;

      this.ctx.save();
      this.ctx.translate(shakeX, shakeY);
      this.ground(time);
      this.bestMarker();
      this.drawCoins(time);
      this.drawEffects(time);
      this.drawBall(time);
      this.ctx.restore();
    }
  }

  return { SandRenderer };
});
