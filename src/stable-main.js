(() => {
  'use strict';

  const physics = window.DriftPhysics;
  if (!physics || !window.DriftGameUI || !window.DriftSandRenderer) return;
  const { PhysicsWorld, SplineTerrain, math } = physics;
  const { clamp, lerp } = math;
  const ui = window.DriftGameUI.create();
  const canvas = document.getElementById('game');
  const terrain = new SplineTerrain({ seed: 0xD13F00 });
  const world = new PhysicsWorld({ terrain });
  const score = new window.DriftScore.ScoreSystem({ lineY: 110 });
  const pilot = new window.DriftAutopilot.CurvePilot({ world, terrain });
  const camera = { x: 0, y: 0, zoom: 1, spaceBlend: 0 };
  const presentation = { mode: 'menu', introLaunched: false, introLanded: false };
  const sand = new window.DriftSand.SandSystem(terrain, world, () => ui.save.settings.motion);

  const state = {
    mode: 'intro', held: false, distance: 0, runCoins: 0, accumulator: 0,
    step: 1 / 120, last: performance.now(), demoResetDelay: 0, metrics: null,
    metricTick: 0, resizing: false, resizeTimer: 0, recovering: false,
    errorCount: 0, lastError: null, hudTimer: 0, coinTimer: 0, cameraTimer: 0,
    predicted: null, airBounds: null, predictionHeld: false, predictionX: -Infinity,
    frameEma: 8.3, frameCount: 0, droppedSteps: 0, physicsSteps: 0
  };

  const coins = new window.DriftSmartCoins.SmartCoinField({
    world, terrain, routes: window.DriftCoinRoutes,
    onCollect: () => {
      if (state.mode !== 'playing') return;
      state.runCoins += 1;
      try { ui.audio.coin(); } catch (_) {}
      ui.haptic(8);
    }
  });

  const renderer = new window.DriftSandRenderer.SandRenderer({
    canvas, terrain, world, sand, coins, camera,
    selectedSkin: ui.selectedSkin, score, presentation
  });

  const intro = new window.DriftIntro.IntroCinematic({
    canvas: document.getElementById('introCanvas'), splash: ui.U.splash, logo: ui.U.splashLogo,
    onImpact: () => {
      try { ui.audio.land('perfect'); } catch (_) {}
      ui.haptic([8, 22, 8]);
    },
    onComplete: finishIntro
  });

  const expLerp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));
  const freshMetrics = () => ({ maxAltitude: 0, longestAir: 0, maxSpeed: 0, bestMultiplier: 1, lineCrossings: 0 });

  function resetTransientCaches() {
    state.hudTimer = 0; state.coinTimer = 0; state.cameraTimer = 0;
    state.predicted = null; state.airBounds = null; state.predictionX = -Infinity; state.metricTick = 0;
  }

  function resetWorld(seed, mode) {
    world.reset(seed >>> 0); score.resetRun(); sand.clear(); coins.reset();
    pilot.reset(mode === 'demo' ? 'demo' : 'play');
    Object.assign(state, { held: false, distance: 0, runCoins: 0, accumulator: 0, metrics: freshMetrics() });
    resetTransientCaches();
    const scale = renderer.baseScale || 1;
    camera.x = world.ball.x - renderer.W / scale * 0.28;
    camera.y = terrain.height(world.ball.x) - renderer.H / scale * 0.7;
    camera.zoom = 1; camera.spaceBlend = 0;
  }

  function startIntro() {
    state.mode = 'intro'; state.accumulator = 0; presentation.mode = 'intro';
    ui.gameplayVisible(false, state.mode); ui.showSplash(); intro.start();
  }

  function finishIntro() {
    if (state.mode !== 'intro') return;
    intro.stop(false);
    try { sessionStorage.setItem('driftline-intro-seen-v14-ultra', '1'); } catch (_) {}
    ui.finishSplash(); beginMenuDemo(true);
  }

  function beginMenuDemo(fresh = false) {
    state.mode = 'menu'; state.held = false; presentation.mode = 'menu';
    ui.gameplayVisible(false, state.mode); ui.openMenu('main');
    if (fresh || world.ball.x > 12000 || !world.ball.grounded || !Number.isFinite(world.ball.x)) {
      resetWorld(((Date.now() & 0xffffffff) ^ 0x51A1D) >>> 0, 'demo');
    }
    state.last = performance.now();
  }

  function smoothDemoReset() {
    if (state.demoResetDelay > 0) return;
    document.getElementById('worldFade')?.classList.add('active');
    state.demoResetDelay = 0.24;
  }

  function completeDemoReset() {
    resetWorld(((Date.now() & 0xffffffff) ^ 0xA170) >>> 0, 'demo');
    requestAnimationFrame(() => document.getElementById('worldFade')?.classList.remove('active'));
  }

  function startRun() {
    try { ui.audio.unlock(); ui.audio.click(); } catch (_) {}
    resetWorld(((Date.now() & 0xffffffff) ^ Math.imul(ui.save.runs + 1, 2654435761)) >>> 0, 'play');
    state.mode = 'playing'; presentation.mode = 'playing'; state.last = performance.now();
    ui.closeOverlays(); ui.gameplayVisible(true, state.mode); updateHud(true);
  }

  function menu(name = 'main') {
    const previousMode = state.mode;
    state.mode = 'menu'; state.held = false; state.accumulator = 0; presentation.mode = 'menu';
    ui.openMenu(name); ui.gameplayVisible(false, state.mode);
    if (previousMode !== 'menu' || world.ball.x > 15000 || !Number.isFinite(world.ball.x)) smoothDemoReset();
  }

  function pause() {
    if (state.mode !== 'playing') return;
    state.mode = 'paused'; state.held = false; state.accumulator = 0;
    ui.U.pauseOverlay.classList.add('active'); ui.gameplayVisible(false, state.mode);
    try { ui.audio.click(); } catch (_) {}
  }

  function resume() {
    if (state.mode !== 'paused') return;
    state.mode = 'playing'; ui.U.pauseOverlay.classList.remove('active');
    state.last = performance.now(); state.accumulator = 0; ui.gameplayVisible(true, state.mode);
    try { ui.audio.click(); } catch (_) {}
  }

  function endRun(title, reason) {
    if (state.mode !== 'playing') return;
    processScoreEvents(score.losePending('run-end'));
    state.mode = 'gameover'; state.held = false; state.accumulator = 0;
    try { ui.audio.crash(); } catch (_) {}
    ui.haptic([45, 35, 70]);
    ui.bankRun({ score: score.score, distance: state.distance, coins: state.runCoins, metrics: state.metrics });
    ui.gameplayVisible(false, state.mode);
    ui.showGameOver({ title, reason, score: score.score, distance: state.distance, coins: state.runCoins });
  }

  function processScoreEvents(events) {
    for (const event of events) {
      if (event.type === 'line-cross') {
        try { ui.audio.line(); } catch (_) {}
        ui.haptic([8, 18, 8]); ui.quip('ABOVE THE LINE', '#fff3a5', 620); state.metrics.lineCrossings += 1;
      } else if (event.type === 'tier-up' && event.tier > 0) {
        try { ui.audio.tier(event.tier); } catch (_) {}
        ui.quip(event.label, event.tier >= 3 ? '#e7e8ff' : '#fff7c2', 620);
      } else if (event.type === 'bank' && event.attempted > 0) {
        try { ui.audio.bank(event.banked); } catch (_) {}
        state.metrics.bestMultiplier = Math.max(state.metrics.bestMultiplier, event.multiplier);
        if (event.grade === 'perfect') {
          ui.quip(`SMOOTH BANK +${event.banked} · ×${event.multiplier.toFixed(1)}`, '#fff3a5', 950);
          ui.haptic([10, 24, 10]);
        } else if (event.lost > 0) ui.quip(`BANKED +${event.banked} · LOST ${event.lost}`, '#ffe0b4', 900);
        else ui.quip(`BANKED +${event.banked}`, '#fff', 760);
      } else if (event.type === 'pending-lost') {
        try { ui.audio.lost(); } catch (_) {}
        ui.quip(`LOST ${event.lost} RISK`, '#ffc3c7', 820);
      }
    }
  }

  function processPhysicsEvents(events, mode) {
    for (const event of events) {
      if (event.type === 'launch') {
        score.beginFlight(); sand.takeoff(event.x, event.speed); state.predicted = null; state.airBounds = null;
        if (mode === 'playing') try { ui.audio.launch(); } catch (_) {}
      } else if (event.type === 'landing') {
        if (event.flight.airtime >= 0.1 || event.flight.maxAltitude >= 5) sand.landing(event);
        state.predicted = null; state.airBounds = null;
        if (mode === 'playing') {
          try { ui.audio.land(event.grade); } catch (_) {}
          if (event.grade === 'perfect') { ui.save.perfects += 1; ui.persist(); }
          processScoreEvents(score.land(event.grade));
        } else score.land(event.grade);
      } else if (event.type === 'crash' || event.type === 'stall') {
        if (mode === 'playing') {
          const rolledBack = event.type === 'stall' || event.reason === 'backward';
          endRun(rolledBack ? 'Rolled backward' : 'Crushed landing', rolledBack ? 'The ball lost forward momentum.' : 'That landing was nearly vertical.');
        } else smoothDemoReset();
      }
    }
  }

  function estimateLanding(force = false) {
    const ball = world.ball;
    if (ball.grounded) {
      const x = ball.x + clamp(Math.abs(ball.vx) * 1.05, 320, 820);
      return { x, y: terrain.frame(x, ball.radius).centerY };
    }
    const now = performance.now();
    const stale = !state.predicted || now >= state.cameraTimer || Math.abs(ball.x - state.predictionX) > 90 || state.predictionHeld !== state.held;
    if (!force && !stale) return state.predicted;
    let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
    const dt = 0.08;
    const gravity = world.config.gravity + (state.held ? world.config.airDiveExtraGravity : 0);
    let landing = null;
    for (let step = 0; step < 78; step += 1) {
      const speed = Math.hypot(vx, vy);
      if (speed > 0) {
        const drag = world.config.airDrag * speed * speed;
        vx -= vx / speed * drag * dt; vy -= vy / speed * drag * dt;
      }
      vy += gravity * dt; x += vx * dt; y += vy * dt;
      const ground = terrain.frame(x, ball.radius).centerY;
      if (y >= ground) { landing = { x, y: ground }; break; }
    }
    if (!landing) landing = { x, y: terrain.frame(x, ball.radius).centerY };
    state.predicted = landing; state.predictionX = ball.x; state.predictionHeld = state.held; state.cameraTimer = now + 120;
    return landing;
  }

  function updateAirBounds(predicted) {
    const ball = world.ball; const now = performance.now();
    if (state.airBounds && now < state.airBounds.expires && Math.abs(ball.x - state.airBounds.ballX) < 100) return state.airBounds;
    const left = ball.x - 130; const right = Math.max(ball.x + 480, predicted.x + 160);
    let top = Math.min(ball.y - 80, score.config.lineY - 40); let bottom = predicted.y + 80;
    for (let index = 0; index <= 12; index += 1) {
      const x = lerp(left, right, index / 12); const y = terrain.height(x);
      top = Math.min(top, y - 60); bottom = Math.max(bottom, y + 60);
    }
    state.airBounds = { left, right, top, bottom, ballX: ball.x, expires: now + 140 };
    return state.airBounds;
  }

  function cameraGameplay(dt) {
    const ball = world.ball; const speed = Math.hypot(ball.vx, ball.vy);
    const ground = terrain.frame(ball.x, ball.radius).centerY; const altitude = Math.max(0, ground - ball.y);
    if (ball.grounded) {
      const targetZoom = clamp(1 - 0.13 * clamp((speed - 520) / 1100, 0, 1), 0.79, 1);
      const scale = renderer.baseScale * targetZoom;
      camera.zoom = expLerp(camera.zoom, targetZoom, 2.8, dt);
      camera.x = expLerp(camera.x, ball.x - renderer.W / scale * 0.27, 5, dt);
      camera.y = expLerp(camera.y, ground - renderer.H / scale * 0.7, 4, dt);
    } else {
      const predicted = estimateLanding(); const bounds = updateAirBounds(predicted);
      const targetZoom = clamp(Math.min(
        renderer.W / (renderer.baseScale * (bounds.right - bounds.left + 150)),
        renderer.H / (renderer.baseScale * (bounds.bottom - bounds.top + 110)),
        1 - 0.1 * clamp((altitude - 650) / 1700, 0, 1)
      ), 0.4, 0.98);
      const scale = renderer.baseScale * targetZoom;
      camera.zoom = expLerp(camera.zoom, targetZoom, 2.2, dt);
      camera.x = expLerp(camera.x, bounds.left - 65 / scale, 3.2, dt);
      camera.y = expLerp(camera.y, bounds.top - 55 / scale, 3, dt);
    }
    camera.spaceBlend = expLerp(camera.spaceBlend, clamp((altitude - 1900) / 1450, 0, 1), 1.6, dt);
  }

  function cameraMenu(dt) {
    const ball = world.ball; const ground = terrain.frame(ball.x, ball.radius).centerY;
    const speed = Math.hypot(ball.vx, ball.vy);
    const targetZoom = ball.grounded ? clamp(0.9 - (speed - 400) / 5000, 0.72, 0.92) : 0.72;
    const scale = renderer.baseScale * targetZoom;
    camera.zoom = expLerp(camera.zoom, targetZoom, 2.1, dt);
    camera.x = expLerp(camera.x, ball.x - renderer.W / scale * 0.38, 2.8, dt);
    camera.y = expLerp(camera.y, (ball.grounded ? ground : ball.y) - renderer.H / scale * 0.62, 2.4, dt);
    const altitude = Math.max(0, ground - ball.y);
    camera.spaceBlend = expLerp(camera.spaceBlend, clamp((altitude - 2100) / 1500, 0, 1), 1.4, dt);
  }

  function updateMetrics() {
    const ball = world.ball; const speed = Math.hypot(ball.vx, ball.vy);
    const altitude = Math.max(0, terrain.frame(ball.x, ball.radius).centerY - ball.y);
    state.metrics.maxAltitude = Math.max(state.metrics.maxAltitude, altitude);
    state.metrics.longestAir = Math.max(state.metrics.longestAir, world.flight.airtime || 0);
    state.metrics.maxSpeed = Math.max(state.metrics.maxSpeed, speed);
    state.metrics.bestMultiplier = Math.max(state.metrics.bestMultiplier, score.multiplier);
  }

  function updateHud(force = false) {
    if (!force && state.hudTimer > 0) return;
    state.hudTimer = 1 / 20;
    const ball = world.ball; const speed = Math.hypot(ball.vx, ball.vy); const snapshot = score.snapshot();
    ui.updateHud({ score: snapshot.score, distance: state.distance, pending: snapshot.pending,
      multiplier: snapshot.multiplier, coins: state.runCoins, speed,
      altitude: Math.max(0, score.config.lineY - ball.y), aboveLine: snapshot.aboveLine });
  }

  function playerPhysicsStep(dt) {
    processPhysicsEvents(world.step(dt, state.held), 'playing'); state.physicsSteps += 1;
    if (state.mode !== 'playing') return;
    if (!world.ball.grounded) processScoreEvents(score.update(world.ball, dt, world.flight.airtime));
    coins.collect(); state.distance = Math.max(state.distance, (world.ball.x - 120) / 10);
    state.metricTick = (state.metricTick + 1) & 3; if (state.metricTick === 0) updateMetrics();
  }

  function menuPhysicsStep(dt) {
    if (state.demoResetDelay > 0) { state.demoResetDelay -= dt; if (state.demoResetDelay <= 0) completeDemoReset(); return; }
    state.held = pilot.update(dt); processPhysicsEvents(world.step(dt, state.held), 'menu'); state.physicsSteps += 1;
    if (!world.ball.grounded) score.update(world.ball, dt, world.flight.airtime);
    if (world.ball.x > 18000 || !Number.isFinite(world.ball.x) || !Number.isFinite(world.ball.y)) smoothDemoReset();
  }

  function recoverRuntime(error) {
    console.error('Driftline runtime recovered:', error); state.errorCount += 1;
    state.lastError = String(error?.stack || error?.message || error);
    if (state.recovering) return;
    state.recovering = true; state.held = false; state.accumulator = 0; state.resizing = false;
    try {
      resetWorld(((Date.now() & 0xffffffff) ^ 0xBADF00D) >>> 0, 'demo');
      state.mode = 'menu'; presentation.mode = 'menu'; ui.gameplayVisible(false, state.mode); ui.openMenu('main'); renderer.resize();
    } catch (recoveryError) { console.error('Driftline recovery failed:', recoveryError); }
    state.last = performance.now(); setTimeout(() => { state.recovering = false; }, 500);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    try {
      const rawDt = Math.max(0, (now - state.last) / 1000); const dt = Math.min(0.05, rawDt); state.last = now;
      state.frameEma = state.frameEma * 0.95 + rawDt * 1000 * 0.05; state.frameCount += 1;
      state.hudTimer -= dt; state.coinTimer -= dt;
      if (state.mode === 'intro') return;
      if (state.resizing || document.hidden) { renderer.draw(); return; }
      if (state.mode === 'playing' || state.mode === 'menu') {
        state.accumulator = Math.min(0.075, state.accumulator + dt);
        let steps = 0; const maxSteps = 9;
        while (state.accumulator >= state.step && steps < maxSteps) {
          if (state.mode === 'playing') playerPhysicsStep(state.step); else menuPhysicsStep(state.step);
          state.accumulator -= state.step; steps += 1;
          if (state.mode !== 'playing' && state.mode !== 'menu') break;
        }
        if (steps >= maxSteps && state.accumulator >= state.step) { state.accumulator = 0; state.droppedSteps += 1; }
      }
      if (state.coinTimer <= 0 && (state.mode === 'playing' || state.mode === 'menu')) { coins.update(); state.coinTimer = 0.1; }
      sand.update(dt);
      if (state.mode === 'playing') { cameraGameplay(dt); updateHud(); }
      else if (state.mode === 'menu') cameraMenu(dt);
      renderer.draw();
    } catch (error) { recoverRuntime(error); }
  }

  function requestViewportSettle() {
    state.resizing = true; state.held = false; state.accumulator = 0;
    document.getElementById('worldFade')?.classList.add('active'); clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(applyViewportResize, 220);
  }

  function applyViewportResize() {
    const screenX = Number.isFinite(renderer.sx(world.ball.x)) ? renderer.sx(world.ball.x) : renderer.W * 0.38;
    const screenY = Number.isFinite(renderer.sy(world.ball.y)) ? renderer.sy(world.ball.y) : renderer.H * 0.55;
    renderer.resize(); intro.resize(); const scale = Math.max(0.001, renderer.baseScale * camera.zoom);
    camera.x = world.ball.x - screenX / scale; camera.y = world.ball.y - screenY / scale;
    state.accumulator = 0; state.last = performance.now(); resetTransientCaches(); state.resizing = false;
    requestAnimationFrame(() => document.getElementById('worldFade')?.classList.remove('active'));
  }

  ui.bind({ start: startRun, menu: () => menu('main'), garage: () => menu('garage'), settings: () => menu('settings'), pause, resume, skipIntro: () => intro.skip() });

  canvas.addEventListener('pointerdown', event => {
    if (state.mode !== 'playing' || state.resizing) return;
    state.held = true; try { ui.audio.unlock(); } catch (_) {} event.preventDefault();
  }, { passive: false });
  const release = event => { if (state.mode === 'playing') state.held = false; event?.preventDefault?.(); };
  addEventListener('pointerup', release, { passive: false }); addEventListener('pointercancel', release, { passive: false });
  addEventListener('resize', requestViewportSettle, { passive: true }); addEventListener('orientationchange', requestViewportSettle, { passive: true });
  window.visualViewport?.addEventListener('resize', requestViewportSettle, { passive: true });
  document.addEventListener('visibilitychange', () => {
    state.held = false; state.accumulator = 0; state.last = performance.now(); if (!document.hidden) requestViewportSettle();
  });
  addEventListener('pageshow', () => requestViewportSettle(), { passive: true });

  ui.render(); resetWorld(0xD13F00, 'demo'); startIntro();
  requestAnimationFrame(now => { state.last = now; requestAnimationFrame(frame); });

  window.__DRIFTLINE_DEBUG__ = {
    start: startRun, skipIntro: () => intro.skip(), hold: value => { state.held = Boolean(value); }, forceResize: requestViewportSettle,
    state: () => ({
      mode: state.mode, resizing: state.resizing, errors: state.errorCount, lastError: state.lastError,
      score: score.snapshot(), distance: state.distance, ball: { ...world.ball }, flight: { ...world.flight },
      coinField: coins.snapshot?.() || { routes: coins.routeQueue?.length || 0, coins: coins.items?.length || 0 },
      renderer: renderer.performanceInfo?.(), frameMs: Number(state.frameEma.toFixed(2)),
      estimatedFps: Number((1000 / Math.max(1, state.frameEma)).toFixed(1)), droppedSteps: state.droppedSteps,
      physicsSteps: state.physicsSteps, metrics: { ...state.metrics }
    })
  };
})();
