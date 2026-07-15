(function attachSmartCoins(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftSmartCoins = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSmartCoins() {
  'use strict';

  const dot = (ax, ay, bx, by) => ax * bx + ay * by;

  class SmartCoinField {
    constructor({ world, terrain, routes, onCollect }) {
      this.world = world;
      this.terrain = terrain;
      this.routes = routes;
      this.onCollect = onCollect;
      this.prefetchDistance = 8200;
      this.preserveDistance = 2700;
      this.maxRoutes = 7;
      this.reset();
    }

    reset() {
      this.items = [];
      this.routeQueue = [];
      this.routeKeys = new Set();
      this.activeRoute = null;
      this.lastRebaseX = -Infinity;
      this.prefill(this.world.ball);
    }

    cloneBall(ball) {
      return {
        x: ball.x,
        y: ball.y,
        vx: ball.vx,
        vy: ball.vy,
        radius: ball.radius,
        grounded: Boolean(ball.grounded),
        groundSpeed: Number.isFinite(ball.groundSpeed) ? ball.groundSpeed : Math.hypot(ball.vx, ball.vy),
        groundTime: Math.max(1, Number(ball.groundTime) || 0)
      };
    }

    landingState(route, radius) {
      const frame = this.terrain.frame(route.landing.x + 4, radius);
      const incomingTangent = Math.max(170, dot(route.landing.vx, route.landing.vy, frame.tx, frame.ty));
      const retained = incomingTangent * (this.world.config.goodRetention || 0.985);
      return {
        x: route.landing.x + 4,
        y: frame.centerY,
        vx: frame.tx * retained,
        vy: frame.ty * retained,
        radius,
        grounded: true,
        groundSpeed: retained,
        groundTime: 1
      };
    }

    predict(ball) {
      return this.routes.predictReleaseRoute(this.terrain, this.world.config, ball, {
        maxGroundSeconds: 11,
        maxAirSeconds: 9,
        minAirtime: 0.28,
        minDistance: 120,
        minAltitude: 12,
        groundSampleEvery: 12,
        airSampleEvery: 3
      });
    }

    addRoute(route) {
      if (!route || this.routeKeys.has(route.key)) return false;
      const line = this.routes.buildCoinLine(route, this.terrain, this.world.ball.radius, {
        spacing: 55,
        minCount: 7,
        maxCount: 18,
        startFraction: 0.075,
        endFraction: 0.91,
        verticalEase: 2
      });
      if (!line.length) return false;
      this.routeKeys.add(route.key);
      this.routeQueue.push(route);
      this.items.push(...line.map((coin, index) => ({
        ...coin,
        taken: false,
        phase: index * 0.43 + route.launch.x * 0.002
      })));
      this.items.sort((a, b) => a.x - b.x);
      return true;
    }

    appendFrom(seedBall) {
      let ghost = this.cloneBall(seedBall);
      let guard = 0;
      while (guard++ < this.maxRoutes) {
        const route = this.predict(ghost);
        if (!route || route.launch.x <= ghost.x + 55) break;
        this.addRoute(route);
        ghost = this.landingState(route, ghost.radius);
        const furthest = this.routeQueue[this.routeQueue.length - 1];
        if (furthest && furthest.landing.x >= this.world.ball.x + this.prefetchDistance) break;
      }
    }

    prefill(ball) {
      this.appendFrom(this.cloneBall(ball));
      this.updateActiveRoute();
    }

    rebaseFromActualBall(ball) {
      const preserveUntil = ball.x + this.preserveDistance;
      const keptRoutes = this.routeQueue.filter(route => route.launch.x < preserveUntil);
      const keptKeys = new Set(keptRoutes.map(route => route.key));
      this.routeQueue = keptRoutes;
      this.routeKeys = keptKeys;
      this.items = this.items.filter(coin => coin.x < preserveUntil || keptKeys.has(coin.routeKey));
      const seed = keptRoutes.length
        ? this.landingState(keptRoutes[keptRoutes.length - 1], ball.radius)
        : this.cloneBall(ball);
      this.appendFrom(seed);
      this.lastRebaseX = ball.x;
    }

    updateActiveRoute() {
      const x = this.world.ball.x;
      this.activeRoute = this.routeQueue.find(route => route.landing.x > x - 80) || null;
    }

    update() {
      const ball = this.world.ball;
      this.items = this.items.filter(coin => !coin.taken && coin.x > ball.x - 180);
      this.routeQueue = this.routeQueue.filter(route => route.landing.x > ball.x - 240);
      this.routeKeys = new Set(this.routeQueue.map(route => route.key));

      const justLanded = ball.grounded && ball.groundTime < 0.14;
      if (justLanded && ball.x - this.lastRebaseX > 260) {
        this.rebaseFromActualBall(ball);
      }

      const furthest = this.routeQueue[this.routeQueue.length - 1];
      if (!furthest || furthest.landing.x < ball.x + this.prefetchDistance) {
        const seed = furthest ? this.landingState(furthest, ball.radius) : this.cloneBall(ball);
        this.appendFrom(seed);
      }
      this.updateActiveRoute();
    }

    collect() {
      const ball = this.world.ball;
      for (const coin of this.items) {
        if (coin.taken) continue;
        const dx = coin.x - ball.x;
        if (dx < -100) continue;
        if (dx > 110) break;
        const dy = coin.y - ball.y;
        const radius = ball.radius + 14;
        if (dx * dx + dy * dy <= radius * radius) {
          coin.taken = true;
          this.onCollect(coin);
        }
      }
    }
  }

  return { SmartCoinField };
});
