(function applyV14Performance(root) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function patchUI() {
    const module = root.DriftGameUI;
    if (!module || typeof module.create !== 'function' || module.create.__v14Patched) return;
    const originalCreate = module.create.bind(module);

    const patchedCreate = (...args) => {
      const ui = originalCreate(...args);
      const originalUpdateHud = ui.updateHud?.bind(ui);
      if (originalUpdateHud) {
        let lastPaint = 0;
        let lastKey = '';
        ui.updateHud = payload => {
          const normalized = {
            ...payload,
            score: Math.floor(payload.score || 0),
            distance: Math.floor(payload.distance || 0),
            pending: Math.floor(payload.pending || 0),
            multiplier: Math.round((payload.multiplier || 1) * 10) / 10,
            coins: Math.floor(payload.coins || 0),
            speed: Math.round((payload.speed || 0) / 8) * 8,
            altitude: Math.round((payload.altitude || 0) / 3) * 3,
            aboveLine: Boolean(payload.aboveLine)
          };
          const key = [
            normalized.score,
            normalized.distance,
            normalized.pending,
            normalized.multiplier,
            normalized.coins,
            normalized.speed,
            normalized.altitude,
            normalized.aboveLine ? 1 : 0
          ].join('|');
          const now = performance.now();
          if (key === lastKey || now - lastPaint < 32) return;
          lastKey = key;
          lastPaint = now;
          originalUpdateHud(normalized);
        };
      }
      return ui;
    };

    patchedCreate.__v14Patched = true;
    module.create = patchedCreate;
  }

  function patchSand() {
    const SandSystem = root.DriftSand?.SandSystem;
    if (!SandSystem || SandSystem.prototype.__v14Patched) return;
    const proto = SandSystem.prototype;
    const originalLanding = proto.landing;
    const originalTakeoff = proto.takeoff;
    const originalUpdate = proto.update;

    const trim = system => {
      if (system.grains?.length > 100) system.grains.splice(0, system.grains.length - 100);
      if (system.dust?.length > 12) system.dust.splice(0, system.dust.length - 12);
      if (system.tracks?.length > 8) system.tracks.splice(0, system.tracks.length - 8);
    };

    proto.landing = function landing(event) {
      originalLanding.call(this, event);
      trim(this);
    };
    proto.takeoff = function takeoff(x, speed) {
      originalTakeoff.call(this, x, speed);
      trim(this);
    };
    proto.update = function update(dt) {
      originalUpdate.call(this, dt);
      trim(this);
    };
    proto.__v14Patched = true;
  }

  function patchRenderer() {
    const Renderer = root.DriftSandRenderer?.SandRenderer;
    if (!Renderer || Renderer.prototype.__v14Patched) return;
    const proto = Renderer.prototype;

    proto.resize = function resize() {
      const viewport = root.visualViewport;
      this.W = Math.max(280, Math.round(viewport?.width || innerWidth));
      this.H = Math.max(320, Math.round(viewport?.height || innerHeight));
      this._v14Perf ||= {
        quality: (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ? 1 : 0,
        ema: 7,
        frames: 0,
        goodCycles: 0,
        lastCost: 0
      };

      const quality = this._v14Perf.quality;
      const nativeDpr = Math.max(1, devicePixelRatio || 1);
      const dprCap = quality === 0 ? 1.45 : quality === 1 ? 1.2 : 1;
      const pixelBudget = quality === 0 ? 820000 : quality === 1 ? 560000 : 400000;
      const budgetDpr = Math.sqrt(pixelBudget / Math.max(1, this.W * this.H));
      this.DPR = clamp(Math.min(nativeDpr, dprCap, budgetDpr), 0.85, dprCap);
      this.baseScale = clamp(this.H / 620, 0.58, 1.05);
      this.canvas.width = Math.max(1, Math.round(this.W * this.DPR));
      this.canvas.height = Math.max(1, Math.round(this.H * this.DPR));
      this.canvas.style.width = `${this.W}px`;
      this.canvas.style.height = `${this.H}px`;
      this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = quality === 0 ? 'medium' : 'low';

      this._skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.H);
      this._skyGradient.addColorStop(0, '#20cbd5');
      this._skyGradient.addColorStop(0.55, '#d6f3df');
      this._skyGradient.addColorStop(1, '#fff0b8');
      this._groundGradient = this.ctx.createLinearGradient(0, this.H * 0.2, 0, this.H);
      this._groundGradient.addColorStop(0, '#ffe7a6');
      this._groundGradient.addColorStop(0.3, '#f8d27f');
      this._groundGradient.addColorStop(0.66, '#edbc62');
      this._groundGradient.addColorStop(1, '#d89b43');
      this.pattern = quality === 0 && root.DriftSand?.createPattern
        ? root.DriftSand.createPattern(this.ctx)
        : null;
    };

    proto.sky = function sky() {
      const c = this.ctx;
      const quality = this._v14Perf?.quality || 0;
      const spaceBlend = clamp(this.camera.spaceBlend || 0, 0, 1);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = this._skyGradient || '#20cbd5';
      c.fillRect(0, 0, this.W, this.H);

      if (quality < 2 && this.assets.bg.complete && this.assets.bg.naturalWidth) {
        const h = this.H;
        const w = h * this.assets.bg.naturalWidth / this.assets.bg.naturalHeight;
        const offset = -((this.camera.x * 0.06) % w + w) % w;
        c.globalAlpha = (quality === 0 ? 0.2 : 0.12) * (1 - spaceBlend);
        for (let x = offset - w; x < this.W + w; x += w) c.drawImage(this.assets.bg, x, 0, w, h);
        c.globalAlpha = 1;
      }

      if (spaceBlend > 0.01) {
        c.fillStyle = `rgba(2,5,22,${0.96 * spaceBlend})`;
        c.fillRect(0, 0, this.W, this.H);
        const limit = quality === 0 ? 90 : quality === 1 ? 50 : 24;
        c.fillStyle = '#fff';
        for (let index = 0; index < Math.min(limit, this.stars.length); index += 1) {
          const star = this.stars[index];
          c.globalAlpha = spaceBlend * star.alpha;
          c.beginPath();
          c.arc(star.x * this.W, star.y * this.H, star.size, 0, TAU);
          c.fill();
        }
        c.globalAlpha = 1;
      }
    };

    proto.scoreLine = function scoreLine() {
      if (!this.score) return;
      const c = this.ctx;
      const y = this.sy(this.score.config.lineY);
      if (!Number.isFinite(y) || y < -50 || y > this.H + 50) return;
      const snapshot = this.score.snapshot();
      const active = snapshot.aboveLine;
      const time = performance.now() * 0.004;
      c.save();
      c.strokeStyle = active ? 'rgba(255,239,143,.92)' : 'rgba(255,255,255,.55)';
      c.lineWidth = active ? 3 : 2;
      c.setLineDash([15, 11]);
      c.lineDashOffset = -time * (active ? 13 : 5);
      c.beginPath();
      c.moveTo(-20, y);
      c.lineTo(this.W + 20, y);
      c.stroke();
      c.setLineDash([]);

      const label = active ? `RISK +${snapshot.pending}` : 'SCORE LINE';
      c.font = '900 10px ui-rounded, system-ui, sans-serif';
      const width = c.measureText(label).width + 18;
      const x = this.W - width - 12;
      c.fillStyle = active ? 'rgba(255,228,112,.94)' : 'rgba(8,42,52,.68)';
      c.fillRect(x, y - 14, width, 22);
      c.fillStyle = active ? '#17323a' : '#fff';
      c.fillText(label, x + 9, y + 1);
      c.restore();
    };

    proto.ground = function ground() {
      const c = this.ctx;
      const quality = this._v14Perf?.quality || 0;
      const scale = Math.max(0.08, this.scale());
      const start = this.camera.x - 60 / scale;
      const end = this.camera.x + (this.W + 60) / scale;
      const baseStep = quality === 0 ? 8 : quality === 1 ? 11 : 15;
      const step = clamp(baseStep / scale, 5, 28);
      const points = [];
      for (let x = start; x <= end + step; x += step) {
        points.push([this.sx(x), this.sy(this.terrain.height(x))]);
      }
      if (!points.length) return;

      const terrainPath = () => {
        c.beginPath();
        c.moveTo(-20, this.H + 60);
        for (const point of points) c.lineTo(point[0], point[1]);
        c.lineTo(this.W + 20, this.H + 60);
        c.closePath();
      };

      terrainPath();
      c.fillStyle = this._groundGradient || '#edbc62';
      c.fill();

      if (quality === 0 && this.pattern) {
        c.save();
        terrainPath();
        c.clip();
        c.globalAlpha = 0.28;
        c.translate(-((this.camera.x * scale) % 128), 0);
        c.fillStyle = this.pattern;
        c.fillRect(-128, 0, this.W + 256, this.H);
        c.restore();
      }

      const tracks = this.sand.tracks || [];
      const firstTrack = Math.max(0, tracks.length - (quality === 0 ? 7 : 4));
      for (let index = firstTrack; index < tracks.length; index += 1) {
        const track = tracks[index];
        const px = this.sx(track.x);
        if (px < -100 || px > this.W + 100) continue;
        const frame = this.terrain.frame(track.x, this.world.ball.radius);
        c.save();
        c.translate(px, this.sy(this.terrain.height(track.x)));
        c.rotate(Math.atan2(frame.slope, 1));
        c.globalAlpha = clamp(track.life / track.maxLife, 0, 1) * 0.16;
        c.fillStyle = '#c9893e';
        c.beginPath();
        c.ellipse(0, 2, track.width * scale * 0.5, track.depth * scale, 0, 0, TAU);
        c.fill();
        c.restore();
      }

      c.globalAlpha = 1;
      c.beginPath();
      c.moveTo(points[0][0], points[0][1]);
      for (let index = 1; index < points.length; index += 1) c.lineTo(points[index][0], points[index][1]);
      c.strokeStyle = 'rgba(255,250,216,.98)';
      c.lineWidth = clamp(3.5 * scale, 1.5, 4.2);
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.stroke();
    };

    proto.money = function money() {
      const c = this.ctx;
      const scale = this.scale();
      const leftWorld = this.camera.x - 60 / Math.max(0.08, scale);
      const rightWorld = this.camera.x + (this.W + 60) / Math.max(0.08, scale);
      const time = performance.now() * 0.0035;
      const size = clamp(28 * scale, 13, 29);
      const imageReady = this.assets.coin.complete && this.assets.coin.naturalWidth;

      for (const coin of this.coins.items) {
        if (coin.taken || coin.x < leftWorld) continue;
        if (coin.x > rightWorld) break;
        const x = this.sx(coin.x);
        const y = this.sy(coin.y + Math.sin(time + coin.phase) * 1.5);
        if (!Number.isFinite(x) || !Number.isFinite(y) || y < -45 || y > this.H + 45) continue;
        if (imageReady) c.drawImage(this.assets.coin, x - size / 2, y - size / 2, size, size);
        else {
          c.fillStyle = '#ffc63d';
          c.beginPath();
          c.arc(x, y, size * 0.36, 0, TAU);
          c.fill();
        }
      }
    };

    proto.sandParticles = function sandParticles() {
      const c = this.ctx;
      const quality = this._v14Perf?.quality || 0;
      const dust = this.sand.dust || [];
      const grains = this.sand.grains || [];
      const dustLimit = quality === 0 ? 9 : quality === 1 ? 6 : 3;
      const grainLimit = quality === 0 ? 75 : quality === 1 ? 45 : 24;

      for (let index = Math.max(0, dust.length - dustLimit); index < dust.length; index += 1) {
        const cloud = dust[index];
        const alpha = clamp(cloud.life / cloud.maxLife, 0, 1) * 0.12;
        c.globalAlpha = alpha;
        c.fillStyle = '#ffe0a0';
        c.beginPath();
        c.arc(this.sx(cloud.x), this.sy(cloud.y), cloud.radius * this.scale() * 0.72, 0, TAU);
        c.fill();
      }

      for (let index = Math.max(0, grains.length - grainLimit); index < grains.length; index += 1) {
        const grain = grains[index];
        const size = clamp(grain.size * this.scale(), 0.8, 4.8);
        c.globalAlpha = clamp(grain.life / grain.maxLife, 0, 1);
        c.fillStyle = grain.color;
        c.fillRect(this.sx(grain.x) - size, this.sy(grain.y) - size * 0.5, size * 2, size);
      }
      c.globalAlpha = 1;
    };

    proto.ball = function ball() {
      const c = this.ctx;
      const ball = this.world.ball;
      const skin = this.selectedSkin();
      const size = clamp((ball.radius * 2 / 0.96875) * this.scale(), 20, 56);
      const x = this.sx(ball.x);
      const y = this.sy(ball.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const time = performance.now() * 0.06;
      const quality = this._v14Perf?.quality || 0;

      c.save();
      c.translate(x, y);
      c.rotate(ball.rotation);
      if (skin.animated) {
        c.filter = quality < 2 ? `hue-rotate(${time % 360}deg) saturate(1.55)` : 'none';
        if (quality === 0) {
          c.shadowColor = `hsl(${time % 360},100%,65%)`;
          c.shadowBlur = 14;
        }
      } else if (skin.hue) {
        c.filter = `hue-rotate(${skin.hue}deg) saturate(1.08)`;
      }
      if (this.assets.ball.complete && this.assets.ball.naturalWidth) {
        c.drawImage(this.assets.ball, -size / 2, -size / 2, size, size);
      } else {
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(0, 0, size * 0.484375, 0, TAU);
        c.fill();
      }
      c.restore();

      if (skin.animated && quality < 2) {
        c.strokeStyle = `hsla(${(time + 100) % 360},100%,70%,0.55)`;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, size * 0.6, 0, TAU);
        c.stroke();
      }
    };

    proto.draw = function draw() {
      const started = performance.now();
      this.sky();
      this.scoreLine();
      this.ground();
      this.money();
      this.sandParticles();
      this.ball();

      const perf = this._v14Perf;
      const cost = performance.now() - started;
      perf.lastCost = cost;
      perf.ema = perf.ema * 0.94 + cost * 0.06;
      perf.frames += 1;

      if (perf.frames % 180 === 0) {
        if (perf.ema > 9.2 && perf.quality < 2) {
          perf.quality += 1;
          perf.goodCycles = 0;
          this.resize();
        } else if (perf.ema < 4.8 && perf.quality > 0) {
          perf.goodCycles += 1;
          if (perf.goodCycles >= 4) {
            perf.quality -= 1;
            perf.goodCycles = 0;
            this.resize();
          }
        } else {
          perf.goodCycles = 0;
        }
      }
    };

    proto.performanceInfo = function performanceInfo() {
      const perf = this._v14Perf || {};
      return {
        quality: perf.quality ?? 0,
        drawMs: Number((perf.ema || 0).toFixed(2)),
        dpr: Number((this.DPR || 1).toFixed(2)),
        pixelWidth: this.canvas.width,
        pixelHeight: this.canvas.height
      };
    };

    proto.__v14Patched = true;
  }

  patchUI();
  patchSand();
  patchRenderer();
})(typeof globalThis !== 'undefined' ? globalThis : window);
