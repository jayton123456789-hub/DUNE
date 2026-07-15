(function attachSandRenderer(root, factory) {
  root.DriftSandRenderer = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  class SandRenderer {
    constructor({ canvas, terrain, world, sand, coins, camera, selectedSkin, score, presentation }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this.terrain = terrain;
      this.world = world;
      this.sand = sand;
      this.coins = coins;
      this.camera = camera;
      this.selectedSkin = selectedSkin;
      this.score = score;
      this.presentation = presentation;
      this.assets = { ball: new Image(), coin: new Image(), bg: new Image() };
      this.assets.ball.src = 'assets/ball.svg';
      this.assets.coin.src = 'assets/coin.svg';
      this.assets.bg.src = 'assets/background.svg';
      this.stars = Array.from({ length: 125 }, (_, index) => ({
        x: ((Math.sin(index * 91.733) * 43758.5453) % 1 + 1) % 1,
        y: ((Math.sin(index * 37.119 + 2.4) * 24634.6345) % 1 + 1) % 1,
        size: 0.6 + (((Math.sin(index * 13.31) * 911.2) % 1 + 1) % 1) * 1.7,
        alpha: 0.35 + (((Math.sin(index * 71.9) * 333.8) % 1 + 1) % 1) * 0.65
      }));
      this.resize();
    }

    resize() {
      this.W = Math.max(280, Math.round(innerWidth));
      this.H = Math.max(320, Math.round(innerHeight));
      this.DPR = Math.min(devicePixelRatio || 1, 2);
      this.baseScale = clamp(this.H / 620, 0.58, 1.05);
      this.canvas.width = Math.round(this.W * this.DPR);
      this.canvas.height = Math.round(this.H * this.DPR);
      this.canvas.style.width = `${this.W}px`;
      this.canvas.style.height = `${this.H}px`;
      this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
      this.pattern = globalThis.DriftSand.createPattern(this.ctx);
    }

    scale() { return this.baseScale * this.camera.zoom; }
    sx(x) { return (x - this.camera.x) * this.scale(); }
    sy(y) { return (y - this.camera.y) * this.scale(); }

    trace(start, end, step) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(-20, this.H + 60);
      for (let x = start; x <= end; x += step) c.lineTo(this.sx(x), this.sy(this.terrain.height(x)));
      c.lineTo(this.W + 20, this.H + 60);
      c.closePath();
    }

    sky() {
      const c = this.ctx;
      const gradient = c.createLinearGradient(0, 0, 0, this.H);
      gradient.addColorStop(0, '#20cbd5');
      gradient.addColorStop(0.55, '#d6f3df');
      gradient.addColorStop(1, '#fff0b8');
      c.fillStyle = gradient;
      c.fillRect(0, 0, this.W, this.H);

      if (this.assets.bg.complete && this.assets.bg.naturalWidth) {
        const h = this.H;
        const w = h * this.assets.bg.naturalWidth / this.assets.bg.naturalHeight;
        const offset = -((this.camera.x * 0.06) % w + w) % w;
        c.globalAlpha = 0.22 * (1 - this.camera.spaceBlend);
        for (let x = offset - w; x < this.W + w; x += w) c.drawImage(this.assets.bg, x, 0, w, h);
        c.globalAlpha = 1;
      }

      if (this.camera.spaceBlend > 0.001) {
        c.fillStyle = `rgba(2,5,22,${0.96 * this.camera.spaceBlend})`;
        c.fillRect(0, 0, this.W, this.H);
        for (const star of this.stars) {
          c.globalAlpha = this.camera.spaceBlend * star.alpha;
          c.fillStyle = '#fff';
          c.beginPath();
          c.arc(star.x * this.W, star.y * this.H, star.size, 0, TAU);
          c.fill();
        }
        c.globalAlpha = 1;
      }
    }

    scoreLine() {
      if (!this.score) return;
      const c = this.ctx;
      const y = this.sy(this.score.config.lineY);
      if (y < -80 || y > this.H + 80) return;
      const snapshot = this.score.snapshot();
      const time = performance.now() * 0.004;
      const active = snapshot.aboveLine;
      const pulse = active ? 0.75 + Math.sin(time * 2.2) * 0.18 : 0.42 + Math.sin(time) * 0.05;

      c.save();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = active ? `rgba(255,246,178,${pulse})` : `rgba(255,255,255,${pulse})`;
      c.shadowColor = active ? '#ffe580' : '#d8ffff';
      c.shadowBlur = active ? 22 : 11;
      c.lineWidth = active ? 3.4 : 2.1;
      c.setLineDash([14, 10]);
      c.lineDashOffset = -time * (active ? 18 : 7);
      c.beginPath();
      c.moveTo(-30, y);
      c.lineTo(this.W + 30, y);
      c.stroke();
      c.setLineDash([]);

      const label = active ? `RISK +${snapshot.pending}` : 'SCORE LINE';
      c.font = '900 10px ui-rounded, system-ui, sans-serif';
      const width = c.measureText(label).width + 22;
      const x = this.W - width - 16;
      c.globalCompositeOperation = 'source-over';
      c.shadowBlur = 0;
      c.fillStyle = active ? 'rgba(255,228,112,.93)' : 'rgba(8,42,52,.68)';
      const top = y - 15;
      const radius = 12;
      c.beginPath();
      c.moveTo(x + radius, top);
      c.lineTo(x + width - radius, top);
      c.quadraticCurveTo(x + width, top, x + width, top + radius);
      c.lineTo(x + width, top + 24 - radius);
      c.quadraticCurveTo(x + width, top + 24, x + width - radius, top + 24);
      c.lineTo(x + radius, top + 24);
      c.quadraticCurveTo(x, top + 24, x, top + 24 - radius);
      c.lineTo(x, top + radius);
      c.quadraticCurveTo(x, top, x + radius, top);
      c.closePath();
      c.fill();
      c.fillStyle = active ? '#17323a' : '#fff';
      c.fillText(label, x + 11, y + 1);
      c.restore();
    }

    tracks() {
      const c = this.ctx;
      for (const track of this.sand.tracks) {
        const alpha = clamp(track.life / track.maxLife, 0, 1) * 0.2;
        const frame = this.terrain.frame(track.x, this.world.ball.radius);
        c.save();
        c.translate(this.sx(track.x), this.sy(this.terrain.height(track.x)));
        c.rotate(Math.atan2(frame.slope, 1));
        c.globalAlpha = alpha;
        c.fillStyle = '#c9893e';
        c.beginPath();
        c.ellipse(0, 2, track.width * this.scale() * 0.5, track.depth * this.scale(), 0, 0, TAU);
        c.fill();
        c.restore();
      }
      c.globalAlpha = 1;
    }

    ground() {
      const c = this.ctx;
      const scale = this.scale();
      const start = this.camera.x - 50 / scale;
      const end = this.camera.x + (this.W + 50) / scale;
      const step = clamp(7 / scale, 4, 18);

      this.trace(start, end, step);
      const gradient = c.createLinearGradient(0, this.H * 0.2, 0, this.H);
      gradient.addColorStop(0, this.camera.spaceBlend > 0.45 ? '#e5bd75' : '#ffe7a6');
      gradient.addColorStop(0.28, '#f8d27f');
      gradient.addColorStop(0.62, '#edbc62');
      gradient.addColorStop(1, '#d89b43');
      c.fillStyle = gradient;
      c.fill();

      if (this.pattern) {
        c.save();
        this.trace(start, end, step);
        c.clip();
        c.globalAlpha = 0.38;
        c.translate(-((this.camera.x * scale) % 128), 0);
        c.fillStyle = this.pattern;
        c.fillRect(-128, 0, this.W + 256, this.H);
        c.restore();
      }

      this.tracks();

      const line = offset => {
        c.beginPath();
        let first = true;
        for (let x = start; x <= end; x += step) {
          const px = this.sx(x);
          const py = this.sy(this.terrain.height(x)) + offset;
          if (first) {
            c.moveTo(px, py);
            first = false;
          } else c.lineTo(px, py);
        }
      };

      line(0);
      c.strokeStyle = 'rgba(255,250,216,.98)';
      c.lineWidth = clamp(4 * scale, 1.6, 4.6);
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.stroke();

      line(clamp(8 * scale, 3, 9));
      c.strokeStyle = 'rgba(205,139,55,.12)';
      c.lineWidth = clamp(5 * scale, 2, 5.8);
      c.stroke();
    }

    sandParticles() {
      const c = this.ctx;
      for (const cloud of this.sand.dust) {
        const alpha = clamp(cloud.life / cloud.maxLife, 0, 1) * 0.18;
        const x = this.sx(cloud.x);
        const y = this.sy(cloud.y);
        const radius = cloud.radius * this.scale();
        const g = c.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, `rgba(255,224,157,${alpha})`);
        g.addColorStop(1, 'rgba(239,184,91,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, radius, 0, TAU);
        c.fill();
      }

      for (const grain of this.sand.grains) {
        c.save();
        c.translate(this.sx(grain.x), this.sy(grain.y));
        c.rotate(grain.angle);
        c.globalAlpha = clamp(grain.life / grain.maxLife, 0, 1);
        c.fillStyle = grain.color;
        const size = clamp(grain.size * this.scale(), 0.7, 6.5);
        c.beginPath();
        c.ellipse(0, 0, size * 1.45, size * 0.72, 0, 0, TAU);
        c.fill();
        c.restore();
      }
      c.globalAlpha = 1;
    }

    money() {
      const c = this.ctx;
      const time = performance.now() * 0.004;
      for (const coin of this.coins.items) {
        if (coin.taken) continue;
        const x = this.sx(coin.x);
        const y = this.sy(coin.y + Math.sin(time + coin.phase) * 2.1);
        if (x < -45 || x > this.W + 45 || y < -55 || y > this.H + 55) continue;
        const size = clamp(30 * this.scale(), 14, 32);
        c.save();
        c.translate(x, y);
        c.rotate(Math.sin(time * 0.7 + coin.phase) * 0.08);
        c.shadowColor = 'rgba(255,190,0,.55)';
        c.shadowBlur = clamp(12 * this.scale(), 5, 12);
        if (this.assets.coin.complete) c.drawImage(this.assets.coin, -size / 2, -size / 2, size, size);
        c.restore();
      }
    }

    ball() {
      const c = this.ctx;
      const ball = this.world.ball;
      const skin = this.selectedSkin();
      const size = clamp((ball.radius * 2 / 0.96875) * this.scale(), 20, 56);
      const time = performance.now() * 0.06;
      c.save();
      c.translate(this.sx(ball.x), this.sy(ball.y));
      c.rotate(ball.rotation);
      if (skin.animated) {
        c.shadowColor = `hsl(${time % 360} 100% 65%)`;
        c.shadowBlur = clamp(22 * this.scale(), 12, 28);
        c.filter = `hue-rotate(${time % 360}deg) saturate(1.65)`;
      } else {
        c.filter = `hue-rotate(${skin.hue}deg) saturate(1.12)`;
        c.shadowColor = 'rgba(18,92,105,.28)';
        c.shadowBlur = clamp(9 * this.scale(), 4, 11);
      }
      if (this.assets.ball.complete) c.drawImage(this.assets.ball, -size / 2, -size / 2, size, size);
      else {
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(0, 0, size * 0.484375, 0, TAU);
        c.fill();
      }
      c.restore();

      if (skin.animated) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = `hsla(${(time + 100) % 360} 100% 70% / .55)`;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(this.sx(ball.x), this.sy(ball.y), size * 0.6, 0, TAU);
        c.stroke();
        c.restore();
      }
    }

    draw() {
      this.sky();
      this.scoreLine();
      this.ground();
      this.money();
      this.sandParticles();
      this.ball();
    }
  }

  return { SandRenderer };
});
