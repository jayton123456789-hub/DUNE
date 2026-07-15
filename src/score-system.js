(function attachScoreSystem(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createScoreSystem() {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const DEFAULT_CONFIG = Object.freeze({
    lineY: 110,
    lineGrace: 8,
    minimumFlightTime: 0.2,
    tiers: [
      { height: 0, rate: 7, label: 'ABOVE THE LINE' },
      { height: 80, rate: 11, label: 'HIGH AIR' },
      { height: 190, rate: 17, label: 'SKY RUN' },
      { height: 340, rate: 25, label: 'STRATOSPHERE' },
      { height: 620, rate: 36, label: 'ORBITAL' }
    ],
    landingBank: {
      perfect: 1,
      good: 0.9,
      rough: 0.58,
      hard: 0.28
    },
    maxMultiplier: 4,
    multiplierStep: 0.5
  });

  class ScoreSystem {
    constructor(config = {}) {
      this.config = {
        ...DEFAULT_CONFIG,
        ...config,
        landingBank: { ...DEFAULT_CONFIG.landingBank, ...(config.landingBank || {}) },
        tiers: config.tiers || DEFAULT_CONFIG.tiers
      };
      this.resetRun();
    }

    resetRun() {
      this.score = 0;
      this.pendingRaw = 0;
      this.pendingDisplay = 0;
      this.chain = 0;
      this.multiplier = 1;
      this.aboveLine = false;
      this.crossings = 0;
      this.flightCrossed = false;
      this.currentTier = -1;
      this.maxTier = -1;
      this.lostThisRun = 0;
      this.bankedThisRun = 0;
      this.events = [];
    }

    beginFlight() {
      this.pendingRaw = 0;
      this.pendingDisplay = 0;
      this.aboveLine = false;
      this.flightCrossed = false;
      this.currentTier = -1;
      this.maxTier = -1;
    }

    tierForHeight(height) {
      let tier = -1;
      for (let index = 0; index < this.config.tiers.length; index++) {
        if (height >= this.config.tiers[index].height) tier = index;
        else break;
      }
      return tier;
    }

    update(ball, dt, flightTime = 0) {
      if (!ball || ball.grounded) {
        this.aboveLine = false;
        return this.consumeEvents();
      }

      const heightAboveLine = this.config.lineY - ball.y;
      const isAbove = heightAboveLine >= -this.config.lineGrace;
      this.aboveLine = isAbove;

      if (isAbove && !this.flightCrossed && flightTime >= this.config.minimumFlightTime) {
        this.flightCrossed = true;
        this.crossings += 1;
        this.events.push({ type: 'line-cross', crossing: this.crossings });
      }

      if (isAbove && flightTime >= this.config.minimumFlightTime) {
        const tier = this.tierForHeight(Math.max(0, heightAboveLine));
        if (tier >= 0) {
          const tierConfig = this.config.tiers[tier];
          this.pendingRaw += tierConfig.rate * dt;
          this.pendingDisplay = Math.floor(this.pendingRaw * this.multiplier);
          if (tier > this.currentTier) {
            this.currentTier = tier;
            this.maxTier = Math.max(this.maxTier, tier);
            this.events.push({
              type: 'tier-up',
              tier,
              label: tierConfig.label,
              height: Math.max(0, heightAboveLine)
            });
          }
        }
      }

      return this.consumeEvents();
    }

    land(grade) {
      const pendingBeforeBank = this.pendingDisplay;
      const ratio = clamp(this.config.landingBank[grade] ?? 0, 0, 1);
      const banked = Math.floor(pendingBeforeBank * ratio);
      const lost = pendingBeforeBank - banked;

      if (grade === 'perfect' && this.flightCrossed) this.chain += 1;
      else if (grade === 'good' && this.flightCrossed) this.chain = Math.max(0, this.chain - 1);
      else this.chain = 0;

      this.multiplier = clamp(
        1 + this.chain * this.config.multiplierStep,
        1,
        this.config.maxMultiplier
      );

      this.score += banked;
      this.bankedThisRun += banked;
      this.lostThisRun += lost;
      this.events.push({
        type: 'bank',
        grade,
        banked,
        lost,
        attempted: pendingBeforeBank,
        chain: this.chain,
        multiplier: this.multiplier,
        crossed: this.flightCrossed
      });
      this.beginFlight();
      return this.consumeEvents();
    }

    losePending(reason = 'crash') {
      const lost = this.pendingDisplay;
      if (lost > 0) {
        this.lostThisRun += lost;
        this.events.push({ type: 'pending-lost', lost, reason });
      }
      this.chain = 0;
      this.multiplier = 1;
      this.beginFlight();
      return this.consumeEvents();
    }

    addBonus(points, reason = 'bonus') {
      const amount = Math.max(0, Math.floor(points));
      this.score += amount;
      this.bankedThisRun += amount;
      this.events.push({ type: 'bonus', points: amount, reason });
      return this.consumeEvents();
    }

    consumeEvents() {
      const events = this.events;
      this.events = [];
      return events;
    }

    snapshot() {
      return {
        score: this.score,
        pending: this.pendingDisplay,
        chain: this.chain,
        multiplier: this.multiplier,
        aboveLine: this.aboveLine,
        crossings: this.crossings,
        tier: this.currentTier,
        maxTier: this.maxTier,
        lineY: this.config.lineY,
        banked: this.bankedThisRun,
        lost: this.lostThisRun
      };
    }
  }

  return { ScoreSystem, DEFAULT_CONFIG };
});
