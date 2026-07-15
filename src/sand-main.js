(() => {
  'use strict';

  const { PhysicsWorld, SplineTerrain, math } = window.DriftPhysics;
  const { clamp, lerp } = math;
  const ui = window.DriftGameUI.create();
  const canvas = document.getElementById('game');
  const terrain = new SplineTerrain({ seed: 0xD13F00 });
  const world = new PhysicsWorld({ terrain });
  const score = new window.DriftScore.ScoreSystem({ lineY: 110 });
  const pilot = new window.DriftAutopilot.CurvePilot({ world, terrain });
  const camera = { x: 0, y: 0, zoom: 1, spaceBlend: 0 };
  const presentation = { mode: 'intro', introLaunched: false, introLanded: false };
  const sand = new window.DriftSand.SandSystem(terrain, world, () => ui.save.settings.motion);

  const state = {
    mode: 'intro',
    held: false,
    distance: 0,
    runCoins: 0,
    accumulator: 0,
    step: 1 / 120,
    last: performance.now(),
    introTime: 0,
    introFinishDelay: 0,
    demoResetDelay: 0,
    metrics: null
  };

  const coins = new window.DriftSmartCoins.SmartCoinField({
    world,
    terrain,
    routes: window.DriftCoinRoutes,
    onCollect: () => {
      if (state.mode !== 'playing') return;
      state.runCoins += 1;
      ui.audio.coin();
      ui.haptic(8);
    }
  });

  const renderer = new window.DriftSandRenderer.SandRenderer({
    canvas,
    terrain,
    world,
    sand,
    coins,
    camera,
    selectedSkin: ui.selectedSkin,
    score,
    presentation
  });

  const expLerp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));

  function freshMetrics() {
    return { maxAltitude: 0, longestAir: 0, maxSpeed: 0, bestMultiplier: 1, lineCrossings: 0 };
  }

  function resetWorld(seed, mode) {
    world.reset(seed >>> 0);
    score.resetRun();
    sand.clear();
    coins.reset();
    pilot.reset(mode === 'intro' ? 'intro' : 'demo');
    Object.assign(state, {
      held: false,
      distance: 0,
      runCoins: 0,
      accumulator: 0,
      metrics: freshMetrics()
    });
    const scale = renderer.baseScale;
    camera.x = world.ball.x - renderer.W / scale * 0.28;
    camera.y = terrain.height(world.ball.x) - renderer.H / scale * 0.7;
    camera.zoom = 1;
    camera.spaceBlend = 0;
  }

  function startIntro() {
    state.mode = 'intro';
    state.introTime = 0;
    state.introFinishDelay = 0;
    presentation.mode = 'intro';
    presentation.introLaunched = false;
    presentation.introLanded = false;
    ui.showSplash();
    ui.audio.unlock();
    ui.audio.intro();
    resetWorld(0xD13F00, 'intro');
  }

  function finishIntro() {
    if (state.mode !== 'intro') return;
    try { sessionStorage.setItem('driftline-intro-seen-v13', '1'); } catch (_) {}
    ui.finishSplash();
    beginMenuDemo(true);
  }

  function beginMenuDemo(fresh = false) {
    state.mode = 'menu';
    presentation.mode = 'menu';
    ui.gameplayVisible(false, state.mode);
    ui.openMenu('main');
    if (fresh || world.ball.x > 12000 || !world.ball.grounded) {
      resetWorld(((Date.now() & 0xffffffff) ^ 0x51A1D) >>> 0, 'demo');
    }
  }

  function smoothDemoReset() {
    if (state.demoResetDelay > 0) return;
    const fade = document.getElementById('worldFade');
    fade?.classList.add('active');
    state.demoResetDelay = 0.34;
  }

  function completeDemoReset() {
    resetWorld(((Date.now() & 0xffffffff) ^ 0xA170) >>> 0, 'demo');
    const fade = document.getElementById('worldFade');
    requestAnimationFrame(() => fade?.classList.remove('active'));
  }

  function startRun() {
    ui.audio.unlock();
    ui.audio.click();
    resetWorld(((Date.now() & 0xffffffff) ^ Math.imul(ui.save.runs + 1, 2654435761)) >>> 0, 'play');
    state.mode = 'playing';
    presentation.mode = 'playing';
    state.last = performance.now();
    ui.closeOverlays();
    ui.gameplayVisible(true, state.mode);
    updateHud();
  }

  function menu(name = 'main') {
    const previousMode = state.mode;
    state.mode = 'menu';
    state.held = false;
    presentation.mode = 'menu';
    ui.openMenu(name);
    ui.gameplayVisible(false, state.mode);
    if (previousMode !== 'menu' || world.ball.x > 15000 || !Number.isFinite(world.ball.x)) smoothDemoReset();
  }

  function pause() {
    if (state.mode !== 'playing') return;
    state.mode = 'paused';
    state.held = false;
    ui.U.pauseOverlay.classList.add('active');
    ui.gameplayVisible(false, state.mode);
    ui.audio.click();
  }

  function resume() {
    if (state.mode !== 'paused') return;
    state.mode = 'playing';
    ui.U.pauseOverlay.classList.remove('active');
    state.last = performance.now();
    ui.gameplayVisible(true, state.mode);
    ui.audio.click();
  }

  function endRun(title, reason) {
    if (state.mode !== 'playing') return;
    const lostEvents = score.losePending('run-end');
    for (const event of lostEvents) {
      if (event.type === 'pending-lost') ui.audio.lost();
    }
    state.mode = 'gameover';
    state.held = false;
    ui.audio.crash();
    ui.haptic([45, 35, 70]);
    ui.bankRun({
      score: score.score,
      distance: state.distance,
      coins: state.runCoins,
      metrics: state.metrics
    });
    ui.gameplayVisible(false, state.mode);
    ui.showGameOver({ title, reason, score: score.score, distance: state.distance, coins: state.runCoins });
  }

  function processScoreEvents(events) {
    for (const event of events) {
      if (event.type === 'line-cross') {
        ui.audio.line();
        ui.haptic([8, 18, 8]);
        ui.quip('ABOVE THE LINE', '#fff3a5', 620);
        state.metrics.lineCrossings += 1;
      } else if (event.type === 'tier-up' && event.tier > 0) {
        ui.audio.tier(event.tier);
        ui.quip(event.label, event.tier >= 3 ? '#e7e8ff' : '#fff7c2', 620);
      } else if (event.type === 'bank' && event.attempted > 0) {
        ui.audio.bank(event.banked);
        state.metrics.bestMultiplier = Math.max(state.metrics.bestMultiplier, event.multiplier);
        if (event.grade === 'perfect') {
          ui.quip(`SMOOTH BANK +${event.banked} · ×${event.multiplier.toFixed(1)}`, '#fff3a5', 950);
          ui.haptic([10, 24, 10]);
        } else if (event.lost > 0) {
          ui.quip(`BANKED +${event.banked} · LOST ${event.lost}`, '#ffe0b4', 900);
        } else ui.quip(`BANKED +${event.banked}`, '#fff', 760);
      } else if (event.type === 'pending-lost') {
        ui.audio.lost();
        ui.quip(`LOST ${event.lost} RISK`, '#ffc3c7', 820);
      }
    }
  }

  function processPhysicsEvents(events, mode) {
    for (const event of events) {
      if (event.type === 'launch') {
        score.beginFlight();
        sand.takeoff(event.x, event.speed);
        if (mode === 'playing') ui.audio.launch();
        if (mode === 'intro') {
          presentation.introLaunched = true;
          ui.U.splash?.classList.add('launched');
          ui.audio.launch();
        }
      } else if (event.type === 'landing') {
        if (event.flight.airtime >= 0.1 || event.flight.maxAltitude >= 5) sand.landing(event);
        if (mode === 'playing') {
          ui.audio.land(event.grade);
          if (event.grade === 'perfect') {
            ui.save.perfects += 1;
            ui.persist();
          }
          processScoreEvents(score.land(event.grade));
        } else if (mode === 'intro' && presentation.introLaunched) {
          presentation.introLanded = true;
          ui.U.splash?.classList.add('landed');
          ui.U.splashLogo?.classList.add('landed');
          ui.audio.land('perfect');
          ui.haptic([10, 28, 10]);
          state.introFinishDelay = 0.85;
        } else if (mode === 'menu') {
          score.land(event.grade);
        }
      } else if (event.type === 'crash' || event.type === 'stall') {
        if (mode === 'playing') {
          const reason = event.type === 'stall' || event.reason === 'backward'
            ? 'The ball lost forward momentum.'
            : 'That landing was nearly vertical.';
          endRun(event.type === 'stall' || event.reason === 'backward' ? 'Rolled backward' : 'Crushed landing', reason);
        } else if (mode === 'intro') {
          state.introFinishDelay = 0.2;
        } else smoothDemoReset();
      }
    }
  }

  function predictedLanding() {
    const ball = world.ball;
    if (ball.grounded) {
      const x = ball.x + clamp(Math.abs(ball.vx) * 1.1, 320, 850);
      return { x, y: terrain.frame(x, ball.radius).centerY };
    }
    let x = ball.x;
    let y = ball.y;
    let vx = ball.vx;
    let vy = ball.vy;
    const gravity = world.config.gravity + (state.held ? world.config.airDiveExtraGravity : 0);
    for (let time = 0; time < 8; time += 0.05) {
      vy += gravity * 0.05;
      x += vx * 0.05;
      y += vy * 0.05;
      const ground = terrain.frame(x, ball.radius).centerY;
      if (y >= ground) return { x, y: ground };
    }
    return { x, y: terrain.frame(x, ball.radius).centerY };
  }

  function cameraGameplay(dt) {
    const ball = world.ball;
    const speed = Math.hypot(ball.vx, ball.vy);
    const ground = terrain.frame(ball.x, ball.radius).centerY;
    const altitude = Math.max(0, ground - ball.y);
    const predicted = predictedLanding();

    if (ball.grounded) {
      const targetZoom = clamp(1 - 0.13 * clamp((speed - 520) / 1100, 0, 1), 0.79, 1);
      const scale = renderer.baseScale * targetZoom;
      camera.zoom = expLerp(camera.zoom, targetZoom, 2.8, dt);
      camera.x = expLerp(camera.x, ball.x - renderer.W / scale * 0.27, 5, dt);
      camera.y = expLerp(camera.y, ground - renderer.H / scale * 0.7, 4, dt);
    } else {
      const left = ball.x - 140;
      const right = Math.max(ball.x + 520, predicted.x + 180);
      let top = Math.min(ball.y - 90, score.config.lineY - 45);
      let bottom = predicted.y + 90;
      for (let index = 0; index <= 24; index++) {
        const x = lerp(left, right, index / 24);
        const y = terrain.height(x);
        top = Math.min(top, y - 70);
        bottom = Math.max(bottom, y + 70);
      }
      const targetZoom = clamp(Math.min(
        renderer.W / (renderer.baseScale * (right - left + 170)),
        renderer.H / (renderer.baseScale * (bottom - top + 130)),
        1 - 0.12 * clamp((altitude - 600) / 1600, 0, 1)
      ), 0.38, 0.98);
      const scale = renderer.baseScale * targetZoom;
      camera.zoom = expLerp(camera.zoom, targetZoom, 2.2, dt);
      camera.x = expLerp(camera.x, left - 75 / scale, 3.3, dt);
      camera.y = expLerp(camera.y, top - 65 / scale, 3.1, dt);
    }
    camera.spaceBlend = expLerp(camera.spaceBlend, clamp((altitude - 1900) / 1450, 0, 1), 1.6, dt);
  }

  function cameraIntro(dt) {
    const ball = world.ball;
    const ground = terrain.frame(ball.x, ball.radius).centerY;
    let targetZoom;
    if (!presentation.introLaunched) targetZoom = clamp(1.28 + Math.min(0.22, ball.x / 5000), 1.28, 1.5);
    else if (!presentation.introLanded) targetZoom = 1.12;
    else targetZoom = 1.58;
    const scale = renderer.baseScale * targetZoom;
    camera.zoom = expLerp(camera.zoom, targetZoom, presentation.introLanded ? 5.8 : 3.5, dt);
    camera.x = expLerp(camera.x, ball.x - renderer.W / scale * 0.5, 6.2, dt);
    camera.y = expLerp(camera.y, (presentation.introLanded ? ground : ball.y) - renderer.H / scale * 0.56, 5.2, dt);
    camera.spaceBlend = 0;
  }

  function cameraMenu(dt) {
    const ball = world.ball;
    const ground = terrain.frame(ball.x, ball.radius).centerY;
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
    const ball = world.ball;
    const speed = Math.hypot(ball.vx, ball.vy);
    const altitude = Math.max(0, terrain.frame(ball.x, ball.radius).centerY - ball.y);
    state.metrics.maxAltitude = Math.max(state.metrics.maxAltitude, altitude);
    state.metrics.longestAir = Math.max(state.metrics.longestAir, world.flight.airtime || 0);
    state.metrics.maxSpeed = Math.max(state.metrics.maxSpeed, speed);
    state.metrics.bestMultiplier = Math.max(state.metrics.bestMultiplier, score.multiplier);
  }

  function updateHud() {
    const ball = world.ball;
    const speed = Math.hypot(ball.vx, ball.vy);
    const ground = terrain.frame(ball.x, ball.radius).centerY;
    const altitude = Math.max(0, ground - ball.y);
    const snapshot = score.snapshot();
    ui.updateHud({
      score: snapshot.score,
      distance: state.distance,
      pending: snapshot.pending,
      multiplier: snapshot.multiplier,
      coins: state.runCoins,
      speed,
      altitude: Math.max(0, score.config.lineY - ball.y),
      aboveLine: snapshot.aboveLine
    });
  }

  function updatePlayer(dt) {
    const physicsEvents = world.step(dt, state.held);
    processPhysicsEvents(physicsEvents, 'playing');
    if (state.mode !== 'playing') return;
    if (!world.ball.grounded) processScoreEvents(score.update(world.ball, dt, world.flight.airtime));
    coins.update();
    coins.collect();
    sand.update(dt);
    state.distance = Math.max(state.distance, (world.ball.x - 120) / 10);
    updateMetrics();
    cameraGameplay(dt);
    updateHud();
  }

  function updateIntro(dt) {
    state.introTime += dt;
    state.held = pilot.update(dt);
    processPhysicsEvents(world.step(dt, state.held), 'intro');
    sand.update(dt);
    score.update(world.ball, dt, world.flight.airtime);
    cameraIntro(dt);
    if (state.introFinishDelay > 0) {
      state.introFinishDelay -= dt;
      if (state.introFinishDelay <= 0) finishIntro();
    } else if (state.introTime > 5.2) finishIntro();
  }

  function updateMenu(dt) {
    if (state.demoResetDelay > 0) {
      state.demoResetDelay -= dt;
      sand.update(dt);
      if (state.demoResetDelay <= 0) completeDemoReset();
      return;
    }
    state.held = pilot.update(dt);
    processPhysicsEvents(world.step(dt, state.held), 'menu');
    if (!world.ball.grounded) score.update(world.ball, dt, world.flight.airtime);
    coins.update();
    coins.collect();
    sand.update(dt);
    cameraMenu(dt);
    if (world.ball.x > 18000) smoothDemoReset();
  }

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - state.last) / 1000));
    state.last = now;

    if (state.mode === 'playing') {
      state.accumulator += dt;
      while (state.accumulator >= state.step) {
        updatePlayer(state.step);
        state.accumulator -= state.step;
        if (state.mode !== 'playing') break;
      }
    } else if (state.mode === 'intro') {
      state.accumulator += dt;
      while (state.accumulator >= state.step) {
        updateIntro(state.step);
        state.accumulator -= state.step;
        if (state.mode !== 'intro') break;
      }
    } else if (state.mode === 'menu') {
      state.accumulator += dt;
      while (state.accumulator >= state.step) {
        updateMenu(state.step);
        state.accumulator -= state.step;
      }
    } else sand.update(dt);

    renderer.draw();
    requestAnimationFrame(frame);
  }

  ui.bind({
    start: startRun,
    menu: () => menu('main'),
    garage: () => menu('garage'),
    settings: () => menu('settings'),
    pause,
    resume,
    skipIntro: finishIntro
  });

  canvas.addEventListener('pointerdown', event => {
    if (state.mode !== 'playing') return;
    state.held = true;
    ui.audio.unlock();
    event.preventDefault();
  }, { passive: false });

  const release = event => {
    if (state.mode === 'playing') state.held = false;
    event?.preventDefault?.();
  };
  addEventListener('pointerup', release, { passive: false });
  addEventListener('pointercancel', release, { passive: false });
  addEventListener('resize', () => renderer.resize(), { passive: true });
  addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 150), { passive: true });

  ui.render();
  startIntro();
  requestAnimationFrame(now => {
    state.last = now;
    requestAnimationFrame(frame);
  });

  window.__DRIFTLINE_DEBUG__ = {
    start: startRun,
    skipIntro: finishIntro,
    hold: value => { state.held = Boolean(value); },
    state: () => ({
      mode: state.mode,
      score: score.snapshot(),
      distance: state.distance,
      ball: { ...world.ball },
      flight: { ...world.flight },
      pilotHeld: pilot.held,
      coinRoutes: coins.routeQueue?.length || 0,
      metrics: { ...state.metrics }
    })
  };
})();
