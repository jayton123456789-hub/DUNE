(function attachDriftIntro(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftIntro = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createIntroModule() {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const ease = value => value * value * (3 - 2 * value);
  const out = value => 1 - Math.pow(1 - value, 3);

  function cubic(a, b, c, d, t) {
    const u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y
    };
  }

  class IntroCinematic {
    constructor({ canvas, splash, logo, onImpact, onComplete, selectedSkin, selectedWorld, motionEnabled }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this.splash = splash;
      this.logo = logo;
      this.logoMark = logo?.querySelector('.logo-mark') || null;
      this.onImpact = onImpact;
      this.onComplete = onComplete;
      this.selectedSkin = selectedSkin || (() => ({ id: 'aqua', primary: '#25cbd2', secondary: '#087c91', trail: '#76f3ef' }));
      this.selectedWorld = selectedWorld || (() => ({
        skyTop: '#0abecb', skyBottom: '#9ce9d7', horizon: '#fff0b1', sun: '#fff2a2', sunX: 0.78, sunY: 0.22,
        far: '#65cdbc', mid: '#2eada7', sandTop: '#f8cf72', sandMid: '#efb654', sandDeep: '#c97a36', crest: '#fff4c8'
      }));
      this.motionEnabled = motionEnabled || (() => true);
      this.duration = 1.72;
      this.active = false;
      this.completed = false;
      this.impactFired = false;
      this.trail = [];
      this.rotation = -0.4;
      this.lastPoint = null;
      this.boundFrame = time => this.frame(time);
      this.resize();
    }

    viewport() {
      const viewport = window.visualViewport;
      return {
        width: Math.max(1, Math.round(viewport?.width || document.documentElement.clientWidth || innerWidth || 1)),
        height: Math.max(1, Math.round(viewport?.height || document.documentElement.clientHeight || innerHeight || 1))
      };
    }

    resize() {
      const viewport = this.viewport();
      this.W = viewport.width;
      this.H = viewport.height;
      const nativeDpr = Math.max(1, devicePixelRatio || 1);
      const budgetDpr = Math.sqrt(780000 / Math.max(1, this.W * this.H));
      this.DPR = clamp(Math.min(nativeDpr, 1.65, budgetDpr), 1, 1.65);
      this.canvas.width = Math.max(1, Math.round(this.W * this.DPR));
      this.canvas.height = Math.max(1, Math.round(this.H * this.DPR));
      this.canvas.style.width = `${this.W}px`;
      this.canvas.style.height = `${this.H}px`;
      this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    }

    start() {
      this.stop(false);
      this.resize();
      this.active = true;
      this.completed = false;
      this.impactFired = false;
      this.trail.length = 0;
      this.rotation = -0.4;
      this.lastPoint = null;
      this.logo?.classList.remove('impact', 'settled');
      this.startTime = performance.now();
      this.drawScene(this.startTime, 0, this.pointAt(0));
      this.raf = requestAnimationFrame(this.boundFrame);
    }

    stop(complete = false) {
      this.active = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (complete && !this.completed) {
        this.completed = true;
        this.onComplete?.();
      }
    }

    skip() {
      this.logo?.classList.add('impact', 'settled');
      this.stop(true);
    }

    targets() {
      const logo = this.logo?.getBoundingClientRect();
      const mark = this.logoMark?.getBoundingClientRect();
      return {
        impact: {
          x: logo?.width ? logo.left + logo.width * 0.73 : this.W * 0.65,
          y: logo?.height ? logo.top + logo.height * 0.06 : this.H * 0.58
        },
        settle: {
          x: mark?.width ? mark.left + mark.width * 0.5 : this.W * 0.37,
          y: mark?.height ? mark.top + mark.height * 0.5 : this.H * 0.66
        }
      };
    }

    pointAt(progress) {
      const W = this.W;
      const H = this.H;
      const targets = this.targets();
      const start = { x: -W * 0.08, y: H * 0.39 };
      const bowl = { x: W * 0.31, y: H * 0.78 };
      const crest = { x: W * 0.53, y: H * 0.35 };
      if (progress < 0.42) {
        const t = ease(progress / 0.42);
        return { ...cubic(start, { x: W * 0.04, y: H * 0.36 }, { x: W * 0.16, y: H * 0.79 }, bowl, t), phase: 'roll' };
      }
      if (progress < 0.61) {
        const t = ease((progress - 0.42) / 0.19);
        return { ...cubic(bowl, { x: W * 0.4, y: H * 0.78 }, { x: W * 0.47, y: H * 0.43 }, crest, t), phase: 'climb' };
      }
      if (progress < 0.78) {
        const t = (progress - 0.61) / 0.17;
        return { ...cubic(crest, { x: W * 0.59, y: H * 0.12 }, { x: targets.impact.x - W * 0.06, y: H * 0.22 }, targets.impact, t), phase: 'air' };
      }
      if (progress < 0.86) {
        const t = out((progress - 0.78) / 0.08);
        return { x: targets.impact.x + t * 9, y: targets.impact.y - Math.sin(t * Math.PI) * 13, phase: 'impact' };
      }
      const t = ease(clamp((progress - 0.86) / 0.14, 0, 1));
      return {
        x: lerp(targets.impact.x + 9, targets.settle.x, t),
        y: lerp(targets.impact.y, targets.settle.y, t) - Math.sin(t * Math.PI) * 4,
        phase: 'settle',
        alpha: 1 - clamp((t - 0.72) / 0.28, 0, 1)
      };
    }

    duneY(x) {
      const W = this.W;
      const H = this.H;
      const normalized = x / Math.max(1, W);
      if (normalized < 0.32) {
        const t = clamp((normalized + 0.08) / 0.4, 0, 1);
        return lerp(H * 0.37, H * 0.79, ease(t));
      }
      if (normalized < 0.55) {
        const t = clamp((normalized - 0.32) / 0.23, 0, 1);
        return lerp(H * 0.79, H * 0.36, ease(t));
      }
      const rollingY = H * (0.61 + Math.sin(normalized * 7.5) * 0.035);
      if (normalized < 0.72) {
        const t = clamp((normalized - 0.55) / 0.17, 0, 1);
        return lerp(H * 0.36, rollingY, ease(t));
      }
      return rollingY;
    }

    drawBackdrop(time) {
      const c = this.ctx;
      const theme = this.selectedWorld();
      const sky = c.createLinearGradient(0, 0, 0, this.H);
      sky.addColorStop(0, theme.skyTop);
      sky.addColorStop(0.62, theme.skyBottom);
      sky.addColorStop(1, theme.horizon);
      c.fillStyle = sky;
      c.fillRect(0, 0, this.W, this.H);

      const sunRadius = clamp(this.H * 0.1, 22, 52);
      c.globalAlpha = 0.22;
      c.fillStyle = theme.sun;
      c.beginPath();
      c.arc(this.W * theme.sunX, this.H * theme.sunY, sunRadius * 1.7, 0, TAU);
      c.fill();
      c.globalAlpha = 0.95;
      c.beginPath();
      c.arc(this.W * theme.sunX, this.H * theme.sunY, sunRadius, 0, TAU);
      c.fill();

      const layer = (base, amplitude, phase, color, alpha) => {
        c.beginPath();
        c.moveTo(0, this.H);
        for (let x = 0; x <= this.W + 12; x += 12) {
          c.lineTo(x, this.H * base + Math.sin(x / this.W * TAU + phase + time * 0.00008) * this.H * amplitude);
        }
        c.lineTo(this.W, this.H);
        c.closePath();
        c.globalAlpha = alpha;
        c.fillStyle = color;
        c.fill();
      };
      layer(0.69, 0.055, 0.8, theme.far, 0.45);
      layer(0.77, 0.072, 2.3, theme.mid, 0.65);
      c.globalAlpha = 1;

      c.beginPath();
      c.moveTo(-20, this.H + 20);
      for (let x = -20; x <= this.W + 20; x += 7) c.lineTo(x, this.duneY(x));
      c.lineTo(this.W + 20, this.H + 20);
      c.closePath();
      const sand = c.createLinearGradient(0, this.H * 0.3, 0, this.H);
      sand.addColorStop(0, theme.sandTop);
      sand.addColorStop(0.5, theme.sandMid);
      sand.addColorStop(1, theme.sandDeep);
      c.fillStyle = sand;
      c.fill();
      c.beginPath();
      for (let x = -20; x <= this.W + 20; x += 7) {
        const y = this.duneY(x);
        if (x === -20) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.strokeStyle = theme.crest;
      c.lineWidth = clamp(this.H * 0.012, 2.5, 5);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.stroke();
    }

    drawScene(time, progress, point) {
      const c = this.ctx;
      this.drawBackdrop(time);
      if (this.trail.length > 1) {
        const skin = this.selectedSkin();
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.lineCap = 'round';
        for (let index = 1; index < this.trail.length; index += 1) {
          const alpha = index / this.trail.length * 0.52;
          c.globalAlpha = alpha;
          c.strokeStyle = skin.trail === 'rainbow' ? `hsl(${index * 24 + time * 0.08} 95% 68%)` : skin.trail;
          c.lineWidth = 2 + alpha * 5;
          c.beginPath();
          c.moveTo(this.trail[index - 1].x, this.trail[index - 1].y);
          c.lineTo(this.trail[index].x, this.trail[index].y);
          c.stroke();
        }
        c.restore();
      }
      globalThis.DriftArt.drawBall(c, {
        x: point.x,
        y: point.y,
        radius: clamp(this.H * 0.052, 15, 26),
        rotation: this.rotation,
        skin: this.selectedSkin(),
        alpha: point.alpha ?? 1,
        time
      });

      c.save();
      c.globalAlpha = clamp((progress - 0.05) / 0.28, 0, 0.28);
      c.fillStyle = '#fff';
      c.font = '900 9px ui-rounded, system-ui, sans-serif';
      c.letterSpacing = '0.16em';
      c.fillText('ONE TOUCH. ENDLESS FLOW.', 18, 24);
      c.restore();
    }

    frame(time) {
      if (!this.active) return;
      const progress = clamp((time - this.startTime) / 1000 / this.duration, 0, 1);
      const point = this.pointAt(progress);
      if (this.lastPoint) this.rotation += Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y) / 18;
      this.lastPoint = point;
      if (point.phase === 'air' && this.motionEnabled()) {
        this.trail.push({ x: point.x, y: point.y });
        if (this.trail.length > 22) this.trail.shift();
      } else if (point.phase === 'settle' && this.trail.length) this.trail.shift();

      if (!this.impactFired && progress >= 0.775) {
        this.impactFired = true;
        this.logo?.classList.add('impact');
        this.onImpact?.();
      }
      if (progress >= 0.91) this.logo?.classList.add('settled');
      this.drawScene(time, progress, point);
      if (progress >= 1) {
        this.active = false;
        this.completed = true;
        this.onComplete?.();
        return;
      }
      this.raf = requestAnimationFrame(this.boundFrame);
    }
  }

  return { IntroCinematic };
});
