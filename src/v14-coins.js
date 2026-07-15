(function attachUltraCoins(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftSmartCoins = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createUltraCoins() {
  'use strict';

  const dot = (ax, ay, bx, by) => ax * bx + ay * by;

  class SmartCoinField {
    constructor({ world, terrain, routes, onCollect }) {
      this.world = world;
      this.terrain = terrain;
      this.routes = routes;
      this.onCollect = typeof onCollect === 'function' ? onCollect : () => {};
      this.prefetchDistance = 3600;
      this.preserveDistance = 1450;
      this.maxRoutes = 2;
      this.maxItems = 16;
      this.minimumCoinSpacing = 116;
      this.token = 0;
      this.idleHandle = 0;
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
      this.generateOne();
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
        dt: 1 / 75,
        maxGroundSeconds: 7,
        maxAirSeconds: 6.5,
        minAirtime: 0.32,
        minDistance: 175,
        minAltitude: 18,
        groundSampleEvery: 16,
        airSampleEvery: 4
      });
    }

    routeOverlaps(route) {
      for (let index = 0; index < this.routeQueue.length; index += 1) {
        const existing = this.routeQueue[index];
        const launchClose = Math.abs(existing.launch.x - route.launch.x) < 180;
        const landingClose = Math.abs(existing.landing.x - route.landing.x) < 280;
        const overlapStart = Math.max(existing.launch.x, route.launch.x);
        const overlapEnd = Math.min(existing.landing.x, route.landing.x);
        const overlap = Math.max(0, overlapEnd - overlapStart);
        const shortest = Math.max(1, Math.min(existing.distance, route.distance));
        if ((launchClose && landingClose) || overlap / shortest > 0.62) return true;
      }
      return false;
    }

    coinTooClose(candidate) {
      const minimumSquared = this.minimumCoinSpacing * this.minimumCoinSpacing;
      for (let index = 0; index < this.items.length; index += 1) {
        const coin = this.items[index];
        if (Math.abs(coin.x - candidate.x) > this.minimumCoinSpacing) continue;
        const dx = coin.x - candidate.x;
        const dy = coin.y - candidate.y;
        if (dx * dx + dy * dy < minimumSquared) return true;
      }
      return false;
    }

    addRoute(route) {
      if (!route || this.routeKeys.has(route.key) || this.routeOverlaps(route)) return false;
      const line = this.routes.buildCoinLine(route, this.terrain, this.world.ball.radius, {
        spacing: 160,
        minCount: 5,
        maxCount: 8,
        startFraction: 0.14,
        endFraction: 0.82,
        verticalEase: 1,
        minimumSpacing: this.minimumCoinSpacing
      });
      let added = 0;
      for (let index = 0; index < line.length && this.items.length < this.maxItems; index += 1) {
        const coin = line[index];
        if (this.coinTooClose(coin)) continue;
        this.items.push({ ...coin, taken: false, phase: index * 0.62 + route.launch.x * 0.0013 });
        added += 1;
      }
      if (added < 4) {
        this.items.length -= added;
        return false;
      }
      this.routeKeys.add(route.key);
      this.routeQueue.push(route);
      this.routeQueue.sort((a, b) => a.launch.x - b.launch.x);
      this.items.sort((a, b) => a.x - b.x);
      return true;
    }

    needsMore() {
      if (this.routeQueue.length >= this.maxRoutes || this.items.length >= this.maxItems) return false;
      const furthest = this.routeQueue[this.routeQueue.length - 1];
      return !furthest || furthest.landing.x < this.world.ball.x + this.prefetchDistance;
    }

    generateOne() {
      const seed = this.pendingSeed || this.cloneBall(this.world.ball);
      const route = this.predict(seed);
      if (!route || route.launch.x <= seed.x + 75) {
        this.pendingSeed = this.cloneBall(this.world.ball);
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
          }, 240);
          return;
        }
        const remaining = typeof deadline?.timeRemaining === 'function' ? deadline.timeRemaining() : 3;
        if (remaining > 2 || !deadline) this.generateOne();
        if (this.needsMore()) this.scheduleMore();
      };
      if (typeof requestIdleCallback === 'function') this.idleHandle = requestIdleCallback(callback, { timeout: 260 });
      else this.idleHandle = setTimeout(() => callback(null), 70);
    }

    compactItems(minX, preserveUntil, keptKeys) {
      let write = 0;
      for (let read = 0; read < this.items.length; read += 1) {
        const coin = this.items[read];
        if (coin.taken || coin.x <= minX) continue;
        if (preserveUntil !== undefined && coin.x >= preserveUntil && !keptKeys.has(coin.routeKey)) continue;
        this.items[write++] = coin;
      }
      this.items.length = write;
    }

    compactRoutes(minLandingX, preserveUntil) {
      let write = 0;
      this.routeKeys.clear();
      for (let read = 0; read < this.routeQueue.length; read += 1) {
        const route = this.routeQueue[read];
        if (route.landing.x <= minLandingX) continue;
        if (preserveUntil !== undefined && route.launch.x >= preserveUntil) continue;
        this.routeQueue[write++] = route;
        this.routeKeys.add(route.key);
      }
      this.routeQueue.length = write;
    }

    rebaseFromActualBall(ball) {
      const preserveUntil = ball.x + this.preserveDistance;
      this.compactRoutes(ball.x - 260, preserveUntil);
      this.compactItems(ball.x - 190, preserveUntil, this.routeKeys);
      this.pendingSeed = this.routeQueue.length
        ? this.landingState(this.routeQueue[this.routeQueue.length - 1], ball.radius)
        : this.cloneBall(ball);
      this.lastRebaseX = ball.x;
      this.scheduleMore();
    }

    updateActiveRoute() {
      const x = this.world.ball.x;
      this.activeRoute = null;
      for (let index = 0; index < this.routeQueue.length; index += 1) {
        if (this.routeQueue[index].landing.x > x - 90) {
          this.activeRoute = this.routeQueue[index];
          break;
        }
      }
    }

    update() {
      const ball = this.world.ball;
      this.compactItems(ball.x - 190, undefined, this.routeKeys);
      this.compactRoutes(ball.x - 260);
      const landedNow = ball.grounded && !this.wasGrounded;
      this.wasGrounded = Boolean(ball.grounded);
      if (landedNow && ball.x - this.lastRebaseX > 320) this.rebaseFromActualBall(ball);
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

    collect() {
      const ball = this.world.ball;
      const radius = ball.radius + 13;
      const radiusSquared = radius * radius;
      for (let index = 0; index < this.items.length; index += 1) {
        const coin = this.items[index];
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
      let activeCoins = 0;
      for (let index = 0; index < this.items.length; index += 1) if (!this.items[index].taken) activeCoins += 1;
      return { routes: this.routeQueue.length, coins: activeCoins, maxRoutes: this.maxRoutes, maxItems: this.maxItems };
    }
  }

  return { SmartCoinField };
});
