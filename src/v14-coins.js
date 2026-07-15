(function attachV14Coins(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftSmartCoins = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV14Coins() {
  'use strict';

  const dot = (ax, ay, bx, by) => ax * bx + ay * by;

  class SmartCoinField {
    constructor({ world, terrain, routes, onCollect }) {
      this.world = world;
      this.terrain = terrain;
      this.routes = routes;
      this.onCollect = typeof onCollect === 'function' ? onCollect : () => {};
      this.prefetchDistance = 4600;
      this.preserveDistance = 1750;
      this.maxRoutes = 3;
      this.maxItems = 27;
      this.minimumCoinSpacing = 82;
      this.token = 0;
      this.idleHandle = 0;
      this.lastMaintenance = 0;
      this.wasGrounded = Boolean(world.ball.grounded);
      this.reset();
    }

    reset() {
      this.cancelScheduled();
      this.token += 1;
      this.items = [];
      this.routeQueue = [];
      this.routeKeys = new Set();
      this.activeRoute = null;
      this.lastRebaseX = -Infinity;
      this.pendingSeed = this.cloneBall(this.world.ball);
      this.wasGrounded = Boolean(this.world.ball.grounded);
      this.generateOne(true);
      this.scheduleMore();
    }

    cancelScheduled() {
      if (!this.idleHandle) return;
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(this.idleHandle);
      else clearTimeout(this.idleHandle);
      this.idleHandle = 0;
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
      const frame = this.terrain.frame(route.landing.x + 5, radius);
      const incomingTangent = Math.max(175, dot(route.landing.vx, route.landing.vy, frame.tx, frame.ty));
      const retained = incomingTangent * (this.world.config.goodRetention || 0.985);
      return {
        x: route.landing.x + 5,
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
        dt: 1 / 90,
        maxGroundSeconds: 7.5,
        maxAirSeconds: 7,
        minAirtime: 0.3,
        minDistance: 150,
        minAltitude: 16,
        groundSampleEvery: 14,
        airSampleEvery: 3
      });
    }

    routeOverlaps(route) {
      return this.routeQueue.some(existing => {
        const launchClose = Math.abs(existing.launch.x - route.launch.x) < 150;
        const landingClose = Math.abs(existing.landing.x - route.landing.x) < 240;
        const overlapStart = Math.max(existing.launch.x, route.launch.x);
        const overlapEnd = Math.min(existing.landing.x, route.landing.x);
        const overlap = Math.max(0, overlapEnd - overlapStart);
        const shortest = Math.max(1, Math.min(existing.distance, route.distance));
        return (launchClose && landingClose) || overlap / shortest > 0.72;
      });
    }

    coinTooClose(candidate) {
      const minSquared = this.minimumCoinSpacing * this.minimumCoinSpacing;
      for (const coin of this.items) {
        if (Math.abs(coin.x - candidate.x) > this.minimumCoinSpacing) continue;
        const dx = coin.x - candidate.x;
        const dy = coin.y - candidate.y;
        if (dx * dx + dy * dy < minSquared) return true;
      }
      return false;
    }

    addRoute(route) {
      if (!route || this.routeKeys.has(route.key) || this.routeOverlaps(route)) return false;
      const line = this.routes.buildCoinLine(route, this.terrain, this.world.ball.radius, {
        spacing: 125,
        minCount: 5,
        maxCount: 9,
        startFraction: 0.12,
        endFraction: 0.84,
        verticalEase: 1.5,
        minimumSpacing: this.minimumCoinSpacing
      });
      const unique = line.filter(coin => !this.coinTooClose(coin));
      if (unique.length < 4) return false;

      this.routeKeys.add(route.key);
      this.routeQueue.push(route);
      this.routeQueue.sort((a, b) => a.launch.x - b.launch.x);
      this.items.push(...unique.map((coin, index) => ({
        ...coin,
        taken: false,
        phase: index * 0.56 + route.launch.x * 0.0017
      })));
      this.items.sort((a, b) => a.x - b.x);
      if (this.items.length > this.maxItems) this.items.length = this.maxItems;
      return true;
    }

    needsMore() {
      if (this.routeQueue.length >= this.maxRoutes || this.items.length >= this.maxItems) return false;
      const furthest = this.routeQueue[this.routeQueue.length - 1];
      return !furthest || furthest.landing.x < this.world.ball.x + this.prefetchDistance;
    }

    generateOne(initial = false) {
      const seed = this.pendingSeed || this.cloneBall(this.world.ball);
      const route = this.predict(seed);
      if (!route || route.launch.x <= seed.x + 65) {
        if (!initial) this.pendingSeed = this.cloneBall(this.world.ball);
        return false;
      }

      this.pendingSeed = this.landingState(route, seed.radius);
      const added = this.addRoute(route);
      this.updateActiveRoute();
      return added;
    }

    scheduleMore() {
      if (this.idleHandle || !this.needsMore()) return;
      const token = this.token;
      const callback = deadline => {
        this.idleHandle = 0;
        if (token !== this.token) return;
        if (!this.world.ball.grounded) {
          this.idleHandle = setTimeout(() => {
            this.idleHandle = 0;
            if (token === this.token) this.scheduleMore();
          }, 180);
          return;
        }

        const remaining = typeof deadline?.timeRemaining === 'function' ? deadline.timeRemaining() : 4;
        if (remaining > 2 || !deadline) this.generateOne(false);
        if (this.needsMore()) this.scheduleMore();
      };

      if (typeof requestIdleCallback === 'function') {
        this.idleHandle = requestIdleCallback(callback, { timeout: 180 });
      } else {
        this.idleHandle = setTimeout(() => callback(null), 40);
      }
    }

    rebaseFromActualBall(ball) {
      const preserveUntil = ball.x + this.preserveDistance;
      const keptRoutes = this.routeQueue.filter(route => route.launch.x < preserveUntil);
      const keptKeys = new Set(keptRoutes.map(route => route.key));
      this.routeQueue = keptRoutes;
      this.routeKeys = keptKeys;
      this.items = this.items.filter(coin => coin.x < preserveUntil || keptKeys.has(coin.routeKey));
      this.pendingSeed = keptRoutes.length
        ? this.landingState(keptRoutes[keptRoutes.length - 1], ball.radius)
        : this.cloneBall(ball);
      this.lastRebaseX = ball.x;
      this.scheduleMore();
    }

    updateActiveRoute() {
      const x = this.world.ball.x;
      this.activeRoute = this.routeQueue.find(route => route.landing.x > x - 90) || null;
    }

    maintain() {
      const ball = this.world.ball;
      this.items = this.items.filter(coin => !coin.taken && coin.x > ball.x - 190);
      this.routeQueue = this.routeQueue.filter(route => route.landing.x > ball.x - 260);
      this.routeKeys = new Set(this.routeQueue.map(route => route.key));

      const landedNow = ball.grounded && !this.wasGrounded;
      if (landedNow && ball.x - this.lastRebaseX > 300) this.rebaseFromActualBall(ball);
      this.wasGrounded = Boolean(ball.grounded);

      if (ball.grounded) {
        const furthest = this.routeQueue[this.routeQueue.length - 1];
        if (!furthest) this.pendingSeed = this.cloneBall(ball);
        else if (!this.pendingSeed || this.pendingSeed.x < furthest.landing.x - 10) {
          this.pendingSeed = this.landingState(furthest, ball.radius);
        }
        this.scheduleMore();
      }
      this.updateActiveRoute();
    }

    update() {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - this.lastMaintenance < 80) {
        this.wasGrounded = Boolean(this.world.ball.grounded);
        return;
      }
      this.lastMaintenance = now;
      this.maintain();
    }

    collect() {
      const ball = this.world.ball;
      const radius = ball.radius + 13;
      const radiusSquared = radius * radius;
      for (const coin of this.items) {
        if (coin.taken) continue;
        const dx = coin.x - ball.x;
        if (dx < -90) continue;
        if (dx > 95) break;
        const dy = coin.y - ball.y;
        if (dx * dx + dy * dy <= radiusSquared) {
          coin.taken = true;
          this.onCollect(coin);
        }
      }
    }

    snapshot() {
      return {
        routes: this.routeQueue.length,
        coins: this.items.filter(coin => !coin.taken).length,
        maxRoutes: this.maxRoutes,
        maxItems: this.maxItems
      };
    }
  }

  return { SmartCoinField };
});
