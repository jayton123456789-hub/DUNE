(function attachDriftIntro(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftIntro = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createIntroModule() {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);
  const cubic = (p0, p1, p2, p3, t) => {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    };
  };
  const quadratic = (p0, p1, p2, t) => {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
    };
  };

  class IntroCinematic {
    constructor({ canvas, splash, logo, onImpact, onComplete }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.splash = splash;
      this.logo = logo;
      this.logoMark = logo?.querySelector('.logo-mark') || null;
      this.onImpact = onImpact;
      this.onComplete = onComplete;
      this.duration = 3.45;
      this.active = false;
      this.impactFired = false;
      this.completed = false;
      this.trail = [];
      this.rotation = 0;
      this.lastPoint = null;
      this.boundFrame = now => this.frame(now);
      this.resize();
    }

    viewport() {
      const vv = window.visualViewport;
      return {
        width: Math.max(280, Math.round(vv?.width || document.documentElement.clientWidth || innerWidth)),
        height: Math.max(320, Math.round(vv?.height || document.documentElement.clientHeight || innerHeight))
      };
    }

    resize() {
      const viewport = this.viewport();
      this.W = viewport.width;
      this.H = viewport.height;
      this.DPR = Math.min(devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.W * this.DPR);
      this.canvas.height = Math.round(this.H * this.DPR);
      this.canvas.style.width = `${this.W}px`;
      this.canvas.style.height = `${this.H}px`;
      this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    }

    targets() {
      const logoRect = this.logo?.getBoundingClientRect();
      const markRect = this.logoMark?.getBoundingClientRect();
      const fallbackY = this.H * 0.66;
      return {
        impact: {
          x: logoRect?.width ? logoRect.left + logoRect.width * 0.72 : this.W * 0.63,
          y: logoRect?.height ? logoRect.top - Math.min(19, this.W * 0.035) : fallbackY - 30
        },
        settle: {
          x: markRect?.width ? markRect.left + markRect.width * 0.5 : this.W * 0.36,
          y: markRect?.height ? markRect.top + markRect.height * 0.5 : fallbackY
        }
      };
    }

    start() {
      this.stop(false);
      this.resize();
      this.active = true;
      this.completed = false;
      this.impactFired = false;
      this.trail.length = 0;
      this.rotation = -0.6;
      this.lastPoint = null;
      this.logo?.classList.remove('impact', 'settled', 'landed');
      this.startTime = performance.now();
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

    pointAt(progress) {
      const W = this.W;
      const H = this.H;
      const targets = this.targets();
      const p0 = { x: -W * 0.07, y: H * 0.08 };
      const p1 = { x: W * 0.08, y: H * 0.14 };
      const p2 = { x: W * 0.22, y: H * 0.72 };
      const valley = { x: W * 0.43, y: H * 0.77 };
      const climb1 = { x: W * 0.52, y: H * 0.74 };
      const climb2 = { x: W * 0.57, y: H * 0.32 };
      const launch = { x: W * 0.64, y: H * 0.27 };

      if (progress < 0.43) {
        const t = ease(progress / 0.43);
        return { ...cubic(p0, p1, p2, valley, t), phase: 'roll' };
      }
      if (progress < 0.61) {
        const t = ease((progress - 0.43) / 0.18);
        return { ...cubic(valley, climb1, climb2, launch, t), phase: 'climb' };
      }
      if (progress < 0.82) {
        const t = (progress - 0.61) / 0.21;
        const control = {
          x: lerp(launch.x, targets.impact.x, 0.52),
          y: Math.min(H * 0.075, launch.y - H * 0.18)
        };
        return { ...quadratic(launch, control, targets.impact, t), phase: 'air' };
      }
      if (progress < 0.89) {
        const t = (progress - 0.82) / 0.07;
        const bounce = Math.sin(t * Math.PI) * Math.min(26, H * 0.04);
        return { x: targets.impact.x + t * 6, y: targets.impact.y - bounce, phase: 'bounce' };
      }
      const t = ease(clamp((progress - 0.89) / 0.095, 0, 1));
      return {
        x: lerp(targets.impact.x + 6, targets.settle.x, t),
        y: lerp(targets.impact.y, targets.settle.y, t) - Math.sin(t * Math.PI) * 3,
        phase: 'settle',
        fade: clamp((t - 0.78) / 0.22, 0, 1)
      };
    }

    drawTrail() {
      const ctx = this.ctx;
      if (this.trail.length < 2) return;
      for (let index = 1; index < this.trail.length; index++) {
        const previous = this.trail[index - 1];
        const point = this.trail[index];
        const age = index / this.trail.length;
        ctx.strokeStyle = `rgba(66,225,235,${0.06 + age * 0.54})`;
        ctx.lineWidth = 1.5 + age * 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
    }

    drawBall(point) {
      const ctx = this.ctx;
      const radius = clamp(Math.min(this.W, this.H) * 0.034, 13, 24);
      const alpha = 1 - (point.fade || 0);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(point.x, point.y);
      ctx.rotate(this.rotation);
      ctx.shadowColor = 'rgba(53,228,235,.65)';
      ctx.shadowBlur = 18;
      const gradient = ctx.createRadialGradient(-radius * 0.35, -radius * 0.38, radius * 0.08, 0, 0, radius);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.5, '#f8ffff');
      gradient.addColorStop(1, '#bdeff2');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#25d2da';
      ctx.lineWidth = Math.max(3, radius * 0.18);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.72, -0.78, 0.78);
      ctx.stroke();
      ctx.restore();
    }

    frame(now) {
      if (!this.active) return;
      const elapsed = (now - this.startTime) / 1000;
      const progress = clamp(elapsed / this.duration, 0, 1);
      const point = this.pointAt(progress);

      if (this.lastPoint) {
        const distance = Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y);
        this.rotation += distance / 18;
      }
      this.lastPoint = point;

      if (point.phase === 'air') {
        this.trail.push({ x: point.x, y: point.y });
        if (this.trail.length > 32) this.trail.shift();
      } else if (point.phase === 'settle' && this.trail.length) {
        this.trail.shift();
      }

      if (!this.impactFired && progress >= 0.815) {
        this.impactFired = true;
        this.logo?.classList.add('impact');
        this.onImpact?.();
      }
      if (progress >= 0.955) this.logo?.classList.add('settled');

      const ctx = this.ctx;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.W, this.H);
      this.drawTrail();
      this.drawBall(point);

      if (progress >= 1) {
        this.active = false;
        this.completed = true;
        setTimeout(() => this.onComplete?.(), 260);
        return;
      }
      this.raf = requestAnimationFrame(this.boundFrame);
    }
  }

  return { IntroCinematic };
});
