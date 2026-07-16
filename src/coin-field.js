(function attachCoinField(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftSmartCoins = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCoinField() {
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
      this.retryProgressDistance = 180;
      this.retryBaseDelay = 120;
      this.retryMaxDelay = 1200;
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
      this.blockedSeedX = null;
      this.blockedBallX = null;
      this.blockedSynthetic = false;
      this.retryFailures = 0;
      this.retryNotBefore = 0;
      this.addOpeningWarmup();
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

    now() {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
      }
      return Date.now();
    }

    addOpeningWarmup() {
      const ball = this.world.ball;
      const offsets = [400, 760, 1120, 1480, 1830];
      const hover = Math.max(8, Math.min(10, ball.radius * 0.38));
      for (let index = 0; index < offsets.length; index += 1) {
        const x = ball.x + offsets[index];
        const frame = this.terrain.frame(x, ball.radius);
        const coin = {
          x,
          // The path is deliberately just above the rolling ball's center:
          // easy to collect while grounded, but still at least one full ball
          // radius clear of the visible sand surface.
          y: frame.centerY - hover,
          routeKey: 'opening-ground',
          fraction: index / (offsets.length - 1),
          phase: 0.35 + index * 0.79,
          taken: false,
          warmup: true
        };
        if (!this.coinTooClose(coin) && this.items.length < this.maxItems) this.items.push(coin);
      }
      this.items.sort((a, b) => a.x - b.x);
    }

    clearGenerationBlock(resetBackoff = false) {
      this.blockedSeedX = null;
      this.blockedBallX = null;
      this.blockedSynthetic = false;
      if (resetBackoff) {
        this.retryFailures = 0;
        this.retryNotBefore = 0;
      }
    }

    blockGeneration(seed) {
      const ballX = this.world.ball.x;
      this.blockedSeedX = seed.x;
      this.blockedBallX = ballX;
      // A predicted landing seed cannot improve while the real ball is still
      // approaching that flight. Wait for the actual landing before trying it
      // again; retrying it every idle callback is deterministic busy-work.
      this.blockedSynthetic = seed.x > ballX + this.retryProgressDistance;
      this.retryFailures = Math.min(5, this.retryFailures + 1);
      const delay = Math.min(
        this.retryMaxDelay,
        this.retryBaseDelay * Math.pow(2, this.retryFailures - 1)
      );
      this.retryNotBefore = this.now() + delay;
    }

    releaseBlockForProgress(ball) {
      if (this.blockedSeedX === null || this.blockedSynthetic) return false;
      if (Math.abs(ball.x - this.blockedBallX) < this.retryProgressDistance) return false;
      this.pendingSeed = this.cloneBall(ball);
      this.clearGenerationBlock(false);
      return true;
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
        dt: 1 / 120,
        maxGroundSeconds: 7,
        maxAirSeconds: 6.5,
        minAirtime: 0.32,
        minDistance: 175,
        minAltitude: 18,
        groundSampleEvery: 26,
        airSampleEvery: 6
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
      if (this.blockedSeedX !== null || this.now() < this.retryNotBefore) return false;
      if (this.routeQueue.length >= this.maxRoutes || this.items.length >= this.maxItems) return false;
      const furthest = this.routeQueue[this.routeQueue.length - 1];
      return !furthest || furthest.landing.x < this.world.ball.x + this.prefetchDistance;
    }

    generateOne() {
      if (this.blockedSeedX !== null || this.now() < this.retryNotBefore) return false;
      const seed = this.pendingSeed || this.cloneBall(this.world.ball);
      const route = this.predict(seed);
      if (!route || route.launch.x <= seed.x + 75) {
        this.blockGeneration(seed);
        return false;
      }
      this.pendingSeed = this.landingState(route, seed.radius);
      const added = this.addRoute(route);
      if (added) this.clearGenerationBlock(true);
      else this.blockGeneration(seed);
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
      // A real landing invalidates any blocked synthetic prediction and gives
      // the planner a materially new, measured velocity to work from.
      this.clearGenerationBlock(true);
      const preserveUntil = ball.x + this.preserveDistance;
      this.compactRoutes(ball.x - 260, preserveUntil);
      this.compactItems(ball.x - 190, preserveUntil, this.routeKeys);
      const furthest = this.routeQueue[this.routeQueue.length - 1];
      // The just-completed route remains briefly for rendering/compaction, but
      // it must not replace the measured landing velocity with its forecast.
      // Only a genuinely future preserved route should seed another prefetch.
      this.pendingSeed = furthest && furthest.landing.x > ball.x + 90
        ? this.landingState(furthest, ball.radius)
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
      if (landedNow) {
        if (ball.x - this.lastRebaseX > 320) this.rebaseFromActualBall(ball);
        else this.clearGenerationBlock(true);
      } else {
        this.releaseBlockForProgress(ball);
      }
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
      // Casual mobile steering needs a forgiving pickup envelope. The route is
      // still visible and meaningful, but a late landing correction no longer
      // turns a near-touch into a frustrating miss.
      const radius = ball.radius + 28;
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
