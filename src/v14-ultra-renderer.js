(function installUltraRenderer(root) {
  'use strict';

  const module = root.DriftSandRenderer;
  if (!module || module.SandRenderer?.__ultraRenderer) return;
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const makeCanvas = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };

  class UltraRenderer {
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
      this.assets.ball.decoding = 'async';
      this.assets.coin.decoding = 'async';
      this.assets.bg.decoding = 'async';
      this.assets.ball.src = 'assets/ball.svg';
      this.assets.coin.src = 'assets/coin.svg';
      this.assets.bg.src = 'assets/background.svg';
      this.chunkSize = 1024;
      this.chunkStep = 20;
      this.chunks = new Map();
      this.chunkSeed = null;
      this.ballSprites = new Map();
      this.coinSprite = null;
      this.stats = { quality: 1, drawEma: 4, lastDrawMs: 0, frames: 0, degradations: 0, dpr: 1 };
      const rebuild = () => {
        this.buildSky();
        this.coinSprite = null;
        this.ballSprites.clear();
      };
      this.assets.bg.addEventListener('load', rebuild);
      this.assets.coin.addEventListener('load', rebuild);
      this.assets.ball.addEventListener('load', rebuild);
      this.resize();
    }

    isIOS() {
      return /iPhone|iPad|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    qualityProfile() {
      const quality = this.stats.quality;
      if (quality === 0) return { dprCap: 1.18, pixelBudget: 680000, chunkStep: 16, particles: 40 };
      if (quality === 1) return { dprCap: 1, pixelBudget: 450000, chunkStep: 20, particles: 26 };
      return { dprCap: 0.82, pixelBudget: 300000, chunkStep: 26, particles: 14 };
    }

    resize() {
      const viewport = root.visualViewport;
      this.W = Math.max(280, Math.round(viewport?.width || innerWidth));
      this.H = Math.max(320, Math.round(viewport?.height || innerHeight));
      if (this.stats.frames === 0) {
        const area = this.W * this.H;
        this.stats.quality = this.isIOS() || area > 700000 ? 1 : 0;
      }
      const profile = this.qualityProfile();
      const nativeDpr = Math.max(1, devicePixelRatio || 1);
      const budgetDpr = Math.sqrt(profile.pixelBudget / Math.max(1, this.W * this.H));
      this.DPR = clamp(Math.min(nativeDpr, profile.dprCap, budgetDpr), 0.62, profile.dprCap);
      this.stats.dpr = this.DPR;
      this.baseScale = clamp(this.H / 620, 0.58, 1.05);
      this.canvas.width = Math.max(1, Math.round(this.W * this.DPR));
      this.canvas.height = Math.max(1, Math.round(this.H * this.DPR));
      this.canvas.style.width = `${this.W}px`;
      this.canvas.style.height = `${this.H}px`;
      this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'low';
      this.chunkStep = profile.chunkStep;
      this.chunks.clear();
      this.ballSprites.clear();
      this.coinSprite = null;
      this.buildSky();
    }

    scale() { return this.baseScale * this.camera.zoom; }
    sx(x) { return (x - this.camera.x) * this.scale(); }
    sy(y) { return (y - this.camera.y) * this.scale(); }

    buildSky() {
      if (!this.W || !this.H || !this.DPR) return;
      const width = Math.max(1, Math.round(this.W * this.DPR));
      const height = Math.max(1, Math.round(this.H * this.DPR));
      const canvas = makeCanvas(width, height);
      const c = canvas.getContext('2d', { alpha: false });
      const gradient = c.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#22cbd4');
      gradient.addColorStop(0.56, '#d8f2df');
      gradient.addColorStop(1, '#fff0b7');
      c.fillStyle = gradient;
      c.fillRect(0, 0, width, height);
      if (this.assets.bg.complete && this.assets.bg.naturalWidth) {
        const bgHeight = height;
        const bgWidth = bgHeight * this.assets.bg.naturalWidth / this.assets.bg.naturalHeight;
        c.globalAlpha = 0.16;
        for (let x = -bgWidth * 0.2; x < width + bgWidth; x += bgWidth) c.drawImage(this.assets.bg, x, 0, bgWidth, bgHeight);
        c.globalAlpha = 1;
      }
      this.skyCanvas = canvas;
    }

    ensureTerrainCache() {
      if (this.chunkSeed === this.terrain.seed && this.chunkStep === this._cachedChunkStep) return;
      this.chunkSeed = this.terrain.seed;
      this._cachedChunkStep = this.chunkStep;
      this.chunks.clear();
    }

    buildChunk(index) {
      const start = index * this.chunkSize;
      const end = start + this.chunkSize;
      this.terrain.ensure(end + this.chunkStep * 2);
      const points = [];
      for (let x = start; x <= end + this.chunkStep; x += this.chunkStep) points.push(x, this.terrain.height(x));
      const fill = typeof Path2D === 'function' ? new Path2D() : null;
      const crest = typeof Path2D === 'function' ? new Path2D() : null;
      const bottom = this.terrain.bottom + 1000;
      if (fill && crest) {
        fill.moveTo(start, bottom);
        fill.lineTo(points[0], points[1]);
        crest.moveTo(points[0], points[1]);
        for (let offset = 2; offset < points.length; offset += 2) {
          fill.lineTo(points[offset], points[offset + 1]);
          crest.lineTo(points[offset], points[offset + 1]);
        }
        fill.lineTo(end + this.chunkStep, bottom);
        fill.closePath();
      }
      const chunk = { start, end, points, fill, crest, bottom };
      this.chunks.set(index, chunk);
      if (this.chunks.size > 14) this.chunks.delete(this.chunks.keys().next().value);
      return chunk;
    }

    getChunk(index) { return this.chunks.get(index) || this.buildChunk(index); }

    drawSky() {
      const c = this.ctx;
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
      if (this.skyCanvas) c.drawImage(this.skyCanvas, 0, 0, this.W, this.H);
      else {
        c.fillStyle = '#5bd8d5';
        c.fillRect(0, 0, this.W, this.H);
      }
      const space = clamp(this.camera.spaceBlend || 0, 0, 1);
      if (space > 0.02) {
        c.fillStyle = `rgba(3,7,24,${space * 0.94})`;
        c.fillRect(0, 0, this.W, this.H);
      }
    }

    drawScoreLine() {
      if (!this.score) return;
      const y = this.sy(this.score.config.lineY);
      if (!Number.isFinite(y) || y < -30 || y > this.H + 30) return;
      const snapshot = this.score.snapshot();
      const c = this.ctx;
      c.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
      c.globalAlpha = snapshot.aboveLine ? 0.9 : 0.52;
      c.strokeStyle = snapshot.aboveLine ? '#ffe78b' : '#ffffff';
      c.lineWidth = snapshot.aboveLine ? 2.5 : 1.5;
      c.setLineDash([12, 10]);
      c.beginPath();
      c.moveTo(0, Math.round(y) + 0.5);
      c.lineTo(this.W, Math.round(y) + 0.5);
      c.stroke();
      c.setLineDash([]);
      c.globalAlpha = 1;
    }

    drawGround() {
      this.ensureTerrainCache();
      const c = this.ctx;
      const scale = Math.max(0.08, this.scale());
      const left = this.camera.x - 80 / scale;
      const right = this.camera.x + (this.W + 80) / scale;
      const first = Math.floor(left / this.chunkSize);
      const last = Math.floor(right / this.chunkSize);
      c.save();
      c.setTransform(this.DPR * scale, 0, 0, this.DPR * scale, -this.camera.x * this.DPR * scale, -this.camera.y * this.DPR * scale);
      c.fillStyle = '#efbd63';
      c.strokeStyle = '#fff3c7';
      c.lineWidth = clamp(3.2 / scale, 1.4, 4.8);
      c.lineJoin = 'round';
      c.lineCap = 'round';
      for (let index = first; index <= last; index += 1) {
        const chunk = this.getChunk(index);
        if (chunk.fill) c.fill(chunk.fill);
        else {
          c.beginPath();
          c.moveTo(chunk.start, chunk.bottom);
          for (let offset = 0; offset < chunk.points.length; offset += 2) c.lineTo(chunk.points[offset], chunk.points[offset + 1]);
          c.lineTo(chunk.end + this.chunkStep, chunk.bottom);
          c.closePath();
          c.fill();
        }
      }
      for (let index = first; index <= last; index += 1) {
        const chunk = this.getChunk(index);
        if (chunk.crest) c.stroke(chunk.crest);
        else {
          c.beginPath();
          c.moveTo(chunk.points[0], chunk.points[1]);
          for (let offset = 2; offset < chunk.points.length; offset += 2) c.lineTo(chunk.points[offset], chunk.points[offset + 1]);
          c.stroke();
        }
      }
      c.restore();

      const tracks = this.sand.tracks || [];
      c.fillStyle = 'rgba(194,126,45,.17)';
      for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        const x = this.sx(track.x);
        if (x < -80 || x > this.W + 80) continue;
        const y = this.sy(this.terrain.height(track.x));
        c.globalAlpha = clamp(track.life / track.maxLife, 0, 1) * 0.18;
        c.beginPath();
        c.ellipse(x, y + 2, track.width * scale * 0.45, track.depth * scale, 0, 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
    }

    getCoinSprite(size = 32) {
      if (this.coinSprite && this.coinSprite.size === size) return this.coinSprite.canvas;
      const canvas = makeCanvas(size, size);
      const c = canvas.getContext('2d');
      if (this.assets.coin.complete && this.assets.coin.naturalWidth) c.drawImage(this.assets.coin, 0, 0, size, size);
      else {
        c.fillStyle = '#ffc43a';
        c.beginPath();
        c.arc(size / 2, size / 2, size * 0.37, 0, TAU);
        c.fill();
        c.strokeStyle = '#e48b00';
        c.lineWidth = Math.max(1, size * 0.08);
        c.stroke();
      }
      this.coinSprite = { size, canvas };
      return canvas;
    }

    drawCoins() {
      const scale = this.scale();
      const size = Math.round(clamp(27 * scale, 13, 28));
      const sprite = this.getCoinSprite(Math.max(16, size * 2));
      const left = this.camera.x - 60 / Math.max(0.08, scale);
      const right = this.camera.x + (this.W + 60) / Math.max(0.08, scale);
      const c = this.ctx;
      for (let index = 0; index < this.coins.items.length; index += 1) {
        const coin = this.coins.items[index];
        if (coin.taken || coin.x < left) continue;
        if (coin.x > right) break;
        const x = this.sx(coin.x);
        const y = this.sy(coin.y);
        if (y < -40 || y > this.H + 40) continue;
        c.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      }
    }

    drawParticles() {
      const c = this.ctx;
      const scale = this.scale();
      const profile = this.qualityProfile();
      const dust = this.sand.dust || [];
      const grains = this.sand.grains || [];
      c.fillStyle = '#ffe0a0';
      for (let index = 0; index < dust.length; index += 1) {
        const cloud = dust[index];
        c.globalAlpha = clamp(cloud.life / cloud.maxLife, 0, 1) * 0.11;
        c.beginPath();
        c.arc(this.sx(cloud.x), this.sy(cloud.y), cloud.radius * scale * 0.65, 0, TAU);
        c.fill();
      }
      const first = Math.max(0, grains.length - profile.particles);
      for (let index = first; index < grains.length; index += 1) {
        const grain = grains[index];
        const size = clamp(grain.size * scale, 0.8, 3.8);
        c.globalAlpha = clamp(grain.life / grain.maxLife, 0, 1);
        c.fillStyle = grain.color;
        c.fillRect(this.sx(grain.x) - size, this.sy(grain.y) - size * 0.4, size * 2, size * 0.8);
      }
      c.globalAlpha = 1;
    }

    createBallSprite(skin, frame = 0) {
      const key = `${skin.id || skin.name}:${frame}`;
      const cached = this.ballSprites.get(key);
      if (cached) return cached;
      const size = 96;
      const canvas = makeCanvas(size, size);
      const c = canvas.getContext('2d');
      if (this.assets.ball.complete && this.assets.ball.naturalWidth) {
        if (skin.animated) c.filter = `hue-rotate(${frame * 30}deg) saturate(1.45)`;
        else if (skin.hue) c.filter = `hue-rotate(${skin.hue}deg) saturate(1.08)`;
        c.drawImage(this.assets.ball, 0, 0, size, size);
        c.filter = 'none';
      } else {
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(size / 2, size / 2, size * 0.47, 0, TAU);
        c.fill();
      }
      if (skin.animated) {
        c.strokeStyle = `hsla(${frame * 30},100%,65%,0.65)`;
        c.lineWidth = 4;
        c.beginPath();
        c.arc(size / 2, size / 2, size * 0.46, 0, TAU);
        c.stroke();
      }
      this.ballSprites.set(key, canvas);
      if (this.ballSprites.size > 18) this.ballSprites.delete(this.ballSprites.keys().next().value);
      return canvas;
    }

    drawBall() {
      const ball = this.world.ball;
      const x = this.sx(ball.x);
      const y = this.sy(ball.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const skin = this.selectedSkin();
      const frame = skin.animated ? Math.floor(performance.now() / 90) % 12 : 0;
      const sprite = this.createBallSprite(skin, frame);
      const size = clamp((ball.radius * 2 / 0.96875) * this.scale(), 20, 55);
      const c = this.ctx;
      c.save();
      c.translate(x, y);
      c.rotate(ball.rotation);
      c.drawImage(sprite, -size / 2, -size / 2, size, size);
      c.restore();
    }

    draw() {
      const started = performance.now();
      this.drawSky();
      this.drawScoreLine();
      this.drawGround();
      this.drawCoins();
      this.drawParticles();
      this.drawBall();
      const cost = performance.now() - started;
      this.stats.lastDrawMs = cost;
      this.stats.drawEma = this.stats.drawEma * 0.95 + cost * 0.05;
      this.stats.frames += 1;
      if (this.stats.frames % 240 === 0 && this.stats.drawEma > 7.2 && this.stats.quality < 2) {
        this.stats.quality += 1;
        this.stats.degradations += 1;
        this.resize();
      }
    }

    performanceInfo() {
      return {
        quality: this.stats.quality,
        drawMs: Number(this.stats.drawEma.toFixed(2)),
        lastDrawMs: Number(this.stats.lastDrawMs.toFixed(2)),
        dpr: Number(this.DPR.toFixed(2)),
        pixelWidth: this.canvas.width,
        pixelHeight: this.canvas.height,
        chunks: this.chunks.size,
        degradations: this.stats.degradations
      };
    }
  }

  UltraRenderer.__ultraRenderer = true;
  root.DriftSandRenderer = { ...module, SandRenderer: UltraRenderer };
})(typeof globalThis !== 'undefined' ? globalThis : window);
