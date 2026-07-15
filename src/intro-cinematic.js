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
    return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
  };

  class IntroCinematic {
    constructor({ canvas, splash, logo, onImpact, onComplete }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this.splash = splash;
      this.logo = logo;
      this.logoMark = logo?.querySelector('.logo-mark') || null;
      this.onImpact = onImpact;
      this.onComplete = onComplete;
      this.duration = 3.25;
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
      const viewport = window.visualViewport;
      return { width: Math.max(280, Math.round(viewport?.width || document.documentElement.clientWidth || innerWidth)), height: Math.max(320, Math.round(viewport?.height || document.documentElement.clientHeight || innerHeight)) };
    }

    resize() {
      const viewport = this.viewport();
      this.W = viewport.width; this.H = viewport.height;
      const nativeDpr = Math.max(1, devicePixelRatio || 1);
      const budgetDpr = Math.sqrt(430000 / Math.max(1, this.W * this.H));
      this.DPR = clamp(Math.min(nativeDpr, 1.15, budgetDpr), 0.7, 1.15);
      this.canvas.width = Math.round(this.W * this.DPR); this.canvas.height = Math.round(this.H * this.DPR);
      this.canvas.style.width = `${this.W}px`; this.canvas.style.height = `${this.H}px`;
      this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0); this.buildBallSprite();
    }

    buildBallSprite() {
      const radius = clamp(Math.min(this.W, this.H) * 0.034, 13, 24); const size = Math.ceil(radius * 2.6);
      const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
      const c = canvas.getContext('2d'); const center = size / 2;
      const gradient = c.createRadialGradient(center - radius * 0.35, center - radius * 0.38, radius * 0.08, center, center, radius);
      gradient.addColorStop(0, '#fff'); gradient.addColorStop(0.55, '#f8ffff'); gradient.addColorStop(1, '#bdeff2');
      c.fillStyle = gradient; c.beginPath(); c.arc(center, center, radius, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#25d2da'; c.lineWidth = Math.max(3, radius * 0.18); c.beginPath(); c.arc(center, center, radius * 0.72, -0.78, 0.78); c.stroke();
      this.ballSprite = canvas;
    }

    targets() {
      const logoRect = this.logo?.getBoundingClientRect(); const markRect = this.logoMark?.getBoundingClientRect(); const fallbackY = this.H * 0.66;
      return {
        impact: { x: logoRect?.width ? logoRect.left + logoRect.width * 0.72 : this.W * 0.63, y: logoRect?.height ? logoRect.top - Math.min(19, this.W * 0.035) : fallbackY - 30 },
        settle: { x: markRect?.width ? markRect.left + markRect.width * 0.5 : this.W * 0.36, y: markRect?.height ? markRect.top + markRect.height * 0.5 : fallbackY }
      };
    }

    start() {
      this.stop(false); this.resize(); this.active = true; this.completed = false; this.impactFired = false;
      this.trail.length = 0; this.rotation = -0.6; this.lastPoint = null;
      this.logo?.classList.remove('impact', 'settled', 'landed'); this.startTime = performance.now(); this.raf = requestAnimationFrame(this.boundFrame);
    }

    stop(complete = false) {
      this.active = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0;
      if (complete && !this.completed) { this.completed = true; this.onComplete?.(); }
    }

    skip() { this.logo?.classList.add('impact', 'settled'); this.stop(true); }

    pointAt(progress) {
      const W = this.W, H = this.H, targets = this.targets();
      const p0 = { x: -W * 0.07, y: H * 0.08 }, p1 = { x: W * 0.08, y: H * 0.14 }, p2 = { x: W * 0.22, y: H * 0.72 };
      const valley = { x: W * 0.43, y: H * 0.77 }, climb1 = { x: W * 0.52, y: H * 0.74 }, climb2 = { x: W * 0.57, y: H * 0.32 }, launch = { x: W * 0.64, y: H * 0.27 };
      if (progress < 0.43) return { ...cubic(p0, p1, p2, valley, ease(progress / 0.43)), phase: 'roll' };
      if (progress < 0.61) return { ...cubic(valley, climb1, climb2, launch, ease((progress - 0.43) / 0.18)), phase: 'climb' };
      if (progress < 0.82) {
        const t = (progress - 0.61) / 0.21; const control = { x: lerp(launch.x, targets.impact.x, 0.52), y: Math.min(H * 0.075, launch.y - H * 0.18) };
        return { ...quadratic(launch, control, targets.impact, t), phase: 'air' };
      }
      if (progress < 0.89) {
        const t = (progress - 0.82) / 0.07;
        return { x: targets.impact.x + t * 6, y: targets.impact.y - Math.sin(t * Math.PI) * Math.min(26, H * 0.04), phase: 'bounce' };
      }
      const t = ease(clamp((progress - 0.89) / 0.095, 0, 1));
      return { x: lerp(targets.impact.x + 6, targets.settle.x, t), y: lerp(targets.impact.y, targets.settle.y, t) - Math.sin(t * Math.PI) * 3, phase: 'settle', fade: clamp((t - 0.78) / 0.22, 0, 1) };
    }

    drawTrail() {
      if (this.trail.length < 2) return;
      const c = this.ctx; c.globalAlpha = 0.58; c.strokeStyle = '#42e1eb'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(this.trail[0].x, this.trail[0].y);
      for (let index = 1; index < this.trail.length; index += 1) c.lineTo(this.trail[index].x, this.trail[index].y);
      c.stroke(); c.globalAlpha = 1;
    }

    drawBall(point) {
      const alpha = 1 - (point.fade || 0); const c = this.ctx; const size = this.ballSprite.width;
      c.save(); c.globalAlpha = alpha; c.translate(point.x, point.y); c.rotate(this.rotation); c.drawImage(this.ballSprite, -size / 2, -size / 2, size, size); c.restore();
    }

    frame(now) {
      if (!this.active) return;
      const elapsed = (now - this.startTime) / 1000; const progress = clamp(elapsed / this.duration, 0, 1); const point = this.pointAt(progress);
      if (this.lastPoint) this.rotation += Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y) / 18; this.lastPoint = point;
      if (point.phase === 'air') { this.trail.push({ x: point.x, y: point.y }); if (this.trail.length > 24) this.trail.shift(); }
      else if (point.phase === 'settle' && this.trail.length) this.trail.shift();
      if (!this.impactFired && progress >= 0.815) { this.impactFired = true; this.logo?.classList.add('impact'); this.onImpact?.(); }
      if (progress >= 0.955) this.logo?.classList.add('settled');
      const c = this.ctx; c.fillStyle = '#000'; c.fillRect(0, 0, this.W, this.H); this.drawTrail(); this.drawBall(point);
      if (progress >= 1) { this.active = false; this.completed = true; setTimeout(() => this.onComplete?.(), 220); return; }
      this.raf = requestAnimationFrame(this.boundFrame);
    }
  }

  return { IntroCinematic };
});
