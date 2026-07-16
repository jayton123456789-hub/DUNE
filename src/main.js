(function startDriftline(root) {
  'use strict';

  const REQUIRED = ['DriftPhysics', 'DriftCoinRoutes', 'DriftSmartCoins', 'DriftScore', 'DriftAutopilot', 'DriftSand', 'DriftArt', 'DriftGameUI', 'DriftSandRenderer', 'DriftIntro'];
  const missing = REQUIRED.filter(name => !root[name]);
  if (missing.length) throw new Error(`Driftline could not start: missing ${missing.join(', ')}`);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const follow = (current, target, speed, dt) => lerp(current, target, 1 - Math.exp(-speed * dt));
  const START_X = 120;
  const METERS_PER_WORLD_UNIT = 0.1;
  const FIXED_STEP = 1 / 120;
  const MAX_FRAME = 0.05;

  const canvas = document.getElementById('game');
  const worldFade = document.getElementById('worldFade');
  const ui = root.DriftGameUI.create();
  const terrain = new root.DriftPhysics.SplineTerrain({ seed: 0x51f15e });
  const world = new root.DriftPhysics.PhysicsWorld({ terrain });
  const score = new root.DriftScore.ScoreSystem();
  const camera = { x: 0, y: 0, zoom: 0.94, spaceBlend: 0 };
  const sand = new root.DriftSand.SandSystem(terrain, world, () => ui.save.settings.motion);

  const game = {
    mode: 'boot',
    held: false,
    pointerId: null,
    accumulator: 0,
    lastTime: performance.now(),
    runCoins: 0,
    distance: 0,
    runSeed: 0x51f15e,
    endTimer: 0,
    audioClock: 0,
    tutorialStage: -1,
    demoResetClock: 0,
    metrics: null
  };

  function newMetrics() {
    return {
      maxAltitude: 0,
      longestAir: 0,
      maxSpeed: 0,
      bestMultiplier: 1,
      lineCrossings: 0,
      perfects: 0,
      smoothLandings: 0,
      bankedFlow: 0,
      bestBank: 0,
      recoveries: 0,
      launches: 0,
      landings: 0
    };
  }

  const coins = new root.DriftSmartCoins.SmartCoinField({
    world,
    terrain,
    routes: root.DriftCoinRoutes,
    onCollect: coin => {
      if (game.mode !== 'playing') return;
      game.runCoins += 1;
      sand.collect(coin, ui.selectedSkin().burst);
      ui.audio.coin();
      if (game.runCoins === 1) ui.quip('ROUTE FOUND  +1 COIN', '#fff1a3', 760);
      else if (game.runCoins % 5 === 0) ui.quip(`${game.runCoins} COINS IN PLAY`, '#fff1a3', 680);
      if (game.runCoins % 3 === 0) ui.haptic(7);
    }
  });

  const renderer = new root.DriftSandRenderer.SandRenderer({
    canvas,
    terrain,
    world,
    sand,
    coins,
    camera,
    selectedSkin: ui.selectedSkin,
    selectedWorld: ui.selectedWorld,
    score,
    presentation: () => ui.save.settings,
    bestDistance: () => ui.save.bestDistance,
    showBestMarker: () => game.mode === 'playing' || game.mode === 'paused' || game.mode === 'ending',
    showCoins: () => game.mode === 'playing' || game.mode === 'paused' || game.mode === 'ending'
  });
  const pilot = new root.DriftAutopilot.CurvePilot({ world, terrain });

  function nextSeed() {
    const time = Date.now() >>> 0;
    const runs = (ui.save.runs + 1) * 0x9e3779b1;
    return (time ^ runs ^ Math.floor(performance.now() * 1000)) >>> 0;
  }

  function distanceMeters() {
    return Math.max(0, (world.ball.x - START_X) * METERS_PER_WORLD_UNIT);
  }

  function altitude() {
    return Math.max(0, terrain.frame(world.ball.x, world.ball.radius).centerY - world.ball.y);
  }

  function resetCamera(immediate = true) {
    const scale = Math.max(0.1, renderer.baseScale * camera.zoom);
    const targetX = world.ball.x - renderer.W * 0.28 / scale;
    const targetY = world.ball.y - renderer.H * 0.57 / scale;
    if (immediate) {
      camera.x = targetX;
      camera.y = targetY;
      camera.spaceBlend = 0;
    }
  }

  function updateCamera(dt) {
    const ball = world.ball;
    const speed = Math.hypot(ball.vx, ball.vy);
    const airHeight = altitude();
    const targetZoom = clamp(1.015 - speed / 4900 - airHeight / 4300, 0.72, 0.98);
    camera.zoom = follow(camera.zoom, targetZoom, ball.grounded ? 2.2 : 1.55, dt);
    const scale = Math.max(0.1, renderer.baseScale * camera.zoom);
    const anchorX = renderer.W * (game.mode === 'menu' ? 0.34 : 0.285);
    const anchorY = renderer.H * (ball.grounded ? 0.57 : clamp(0.52 + ball.vy / 7000, 0.46, 0.58));
    const targetX = ball.x - anchorX / scale;
    const targetY = ball.y - anchorY / scale;
    const xDelta = targetX - camera.x;
    const yDelta = targetY - camera.y;
    const xDeadzone = 12 / scale;
    const yDeadzone = 8 / scale;
    if (Math.abs(xDelta) > xDeadzone) camera.x = follow(camera.x, targetX - Math.sign(xDelta) * xDeadzone, 3.7, dt);
    if (Math.abs(yDelta) > yDeadzone) camera.y = follow(camera.y, targetY - Math.sign(yDelta) * yDeadzone, ball.grounded ? 2.6 : 3.5, dt);
    camera.spaceBlend = follow(camera.spaceBlend, clamp((airHeight - 620) / 1050, 0, 0.82), 2.1, dt);
  }

  function setHeld(held) {
    if (game.mode !== 'playing') {
      game.held = false;
      return;
    }
    const next = Boolean(held);
    if (next === game.held) return;
    game.held = next;
    ui.audio.unlock();
    updateTutorialInput(next);
  }

  function beginTutorial() {
    if (ui.save.tutorialSeen) {
      game.tutorialStage = -1;
      ui.hideCoach(false);
      return;
    }
    game.tutorialStage = 0;
    ui.showCoach('HOLD TO DIVE', 'Press the world to build speed', false);
  }

  function updateTutorialInput(held) {
    if (game.tutorialStage < 0) return;
    if (game.tutorialStage === 0 && held) {
      game.tutorialStage = 1;
      ui.showCoach('POWER THROUGH THE BOWL', 'Keep holding on the downhill', true);
    } else if (game.tutorialStage === 2 && !held) {
      ui.showCoach('LET THE CURVE LIFT YOU', 'Stay released through the uphill', false);
    } else if (game.tutorialStage === 3 && held && !world.ball.grounded) {
      game.tutorialStage = 4;
      ui.showCoach('AIM FOR THE SLOPE', 'Release if your descent gets too steep', true);
    }
  }

  function updateTutorialWorld() {
    if (game.tutorialStage < 0) return;
    const frame = terrain.frame(world.ball.x, world.ball.radius);
    if (game.tutorialStage === 1 && world.ball.x > 780 && frame.slope < -0.09) {
      game.tutorialStage = 2;
      ui.showCoach('RELEASE TO FLY', 'Let go as the curve lifts you', game.held);
    } else if (game.tutorialStage === 3 && !world.ball.grounded && world.ball.vy > 40) {
      ui.showCoach('HOLD TO DIVE', 'Steepen your descent toward the downhill', game.held);
    }
  }

  function processScoreEvents(events) {
    for (const event of events) {
      if (event.type === 'line-cross') {
        game.metrics.lineCrossings += 1;
        ui.audio.line();
        ui.haptic(8);
        sand.lineCross(world.ball.x, world.ball.y, ui.selectedSkin().burst);
        renderer.kick(1.8);
        ui.quip(event.crossing === 1 ? 'FLOW LINE CROSSED' : `AIR LINK  ${event.crossing}`, '#fff5a8', 680);
      } else if (event.type === 'tier-up' && event.tier > 0) {
        ui.audio.tier(event.tier);
        ui.quip(event.label, '#d9ffff', 600);
      } else if (event.type === 'bank') {
        game.metrics.bankedFlow += event.banked;
        game.metrics.bestBank = Math.max(game.metrics.bestBank, event.banked);
        game.metrics.bestMultiplier = Math.max(game.metrics.bestMultiplier, event.multiplier);
        if (event.banked > 0) ui.audio.bank(event.banked);
        if (event.lost > 0) ui.audio.lost();
        const gradeLabel = event.grade === 'perfect' ? 'BUTTER LANDING' : event.grade === 'good' ? 'SMOOTH LANDING' : event.grade === 'recovery' ? 'RECOVERY SAVE' : event.grade === 'rough' ? 'ROUGH — HOLD THE LINE' : 'HEAVY LANDING';
        const bankCopy = event.banked > 0 ? `  +${event.banked} BANKED` : '';
        const color = event.grade === 'perfect' ? '#fff4a8' : event.grade === 'recovery' ? '#8ff7ec' : '#ffffff';
        ui.quip(`${gradeLabel}${bankCopy}`, color, 900);
      } else if (event.type === 'pending-lost' && event.lost > 0) {
        ui.quip(`${event.lost} FLOW LOST`, '#ffb0a0', 720);
        ui.audio.lost();
      } else if (event.type === 'distance-milestone') {
        ui.quip(`${Math.floor(event.distance)} m  •  KEEP THE FLOW`, '#d9ffff', 520);
      }
    }
  }

  function handleLanding(event) {
    game.metrics.landings += 1;
    game.metrics.longestAir = Math.max(game.metrics.longestAir, event.flight?.airtime || 0);
    game.metrics.maxAltitude = Math.max(game.metrics.maxAltitude, event.flight?.maxAltitude || 0);
    game.metrics.maxSpeed = Math.max(game.metrics.maxSpeed, event.flight?.maxSpeed || event.speed || 0);
    if (event.grade === 'perfect') game.metrics.perfects += 1;
    if (event.grade === 'perfect' || event.grade === 'good') game.metrics.smoothLandings += 1;
    if (event.grade === 'recovery') game.metrics.recoveries += 1;
    sand.landing(event);
    ui.audio.land(event.grade);
    ui.haptic(event.grade === 'perfect' ? [8, 18, 8] : event.grade === 'recovery' ? [22, 28, 12] : event.grade === 'hard' ? 28 : 11);
    renderer.kick(event.grade === 'perfect' ? 3.5 : event.grade === 'recovery' ? 6 : event.grade === 'hard' ? 7 : 2.4);
    processScoreEvents(score.land(event.grade));
    if (game.tutorialStage >= 0) {
      ui.hideCoach(true);
      game.tutorialStage = -1;
      window.setTimeout(() => ui.systemToast('Controls learned • chase the next objective', true), 650);
    }
  }

  function handlePhysicsEvents(events, demo = false) {
    for (const event of events) {
      if (event.type === 'launch') {
        sand.takeoff(event.x, event.speed);
        if (!demo) {
          game.metrics.launches += 1;
          score.beginFlight();
          ui.audio.launch();
          if (game.tutorialStage >= 1 && game.tutorialStage <= 2) {
            game.tutorialStage = 3;
            ui.showCoach('FLY THE ARC', 'Hold after the apex to match the landing', false);
          }
        }
      } else if (event.type === 'landing') {
        if (demo) {
          sand.landing(event);
        } else handleLanding(event);
      } else if (event.type === 'crash' || event.type === 'stall') {
        if (demo) resetDemo();
        else finishRun(event);
      }
      if (game.mode === 'ending') break;
    }
  }

  function finishRun(event) {
    if (game.mode !== 'playing') return;
    game.mode = 'ending';
    game.held = false;
    game.pointerId = null;
    ui.hideCoach(false);
    processScoreEvents(score.losePending(event.type));
    const impactY = event.type === 'stall' ? terrain.frame(world.ball.x, world.ball.radius).centerY : world.ball.y;
    sand.crash(world.ball.x, impactY);
    renderer.kick(event.type === 'stall' ? 4.5 : 10);
    ui.audio.crash();
    ui.haptic([34, 38, 48]);
    ui.gameplayVisible(true, 'ending');

    const copy = event.type === 'stall'
      ? { title: 'Momentum faded', reason: 'Dive deeper through the bowls, then release as the curve lifts you.' }
      : event.reason === 'backward'
        ? { title: 'Curve missed', reason: 'Meet the dune while moving forward and match its downhill angle.' }
        : { title: 'Hard landing', reason: 'Hold after the apex to steepen your descent into the next slope.' };

    clearTimeout(game.endTimer);
    game.endTimer = window.setTimeout(() => {
      const snapshot = score.snapshot();
      const result = ui.bankRun({
        score: snapshot.score,
        distance: game.distance,
        coins: game.runCoins,
        metrics: game.metrics
      });
      game.mode = 'gameover';
      ui.gameplayVisible(false, 'gameover');
      ui.showGameOver({
        ...copy,
        score: snapshot.score,
        distance: game.distance,
        coins: game.runCoins,
        metrics: game.metrics,
        result
      });
    }, 390);
  }

  function resetDemo() {
    clearTimeout(game.endTimer);
    game.runSeed = 0x51f15e;
    world.reset(game.runSeed);
    score.resetRun();
    sand.clear();
    coins.reset();
    pilot.reset('demo');
    game.held = false;
    game.accumulator = 0;
    game.demoResetClock = 0;
    camera.zoom = 0.94;
    resetCamera(true);
  }

  function startRun() {
    clearTimeout(game.endTimer);
    ui.audio.unlock();
    game.runSeed = nextSeed();
    world.reset(game.runSeed);
    score.resetRun();
    sand.clear();
    coins.reset();
    pilot.reset('run');
    game.mode = 'playing';
    game.held = false;
    game.pointerId = null;
    game.accumulator = 0;
    game.runCoins = 0;
    game.distance = 0;
    game.metrics = newMetrics();
    camera.zoom = 0.94;
    resetCamera(true);
    ui.closeOverlays();
    ui.gameplayVisible(true, 'playing');
    ui.audio.setMode('playing');
    ui.audio.click();
    beginTutorial();
    refreshHud();
  }

  function showMenu(view = 'main') {
    clearTimeout(game.endTimer);
    game.mode = 'menu';
    game.held = false;
    game.pointerId = null;
    ui.hideCoach(false);
    ui.gameplayVisible(false, 'menu');
    ui.openMenu(view);
    resetDemo();
    game.mode = 'menu';
    window.dispatchEvent(new Event('driftline:safe-update'));
  }

  function pauseRun() {
    if (game.mode !== 'playing') return;
    game.mode = 'paused';
    game.held = false;
    game.pointerId = null;
    ui.showPause({ score: score.snapshot().score, distance: game.distance });
    ui.gameplayVisible(true, 'paused');
  }

  function resumeRun() {
    if (game.mode !== 'paused') return;
    game.mode = 'playing';
    game.held = false;
    game.accumulator = 0;
    game.lastTime = performance.now();
    ui.hidePause();
    ui.gameplayVisible(true, 'playing');
  }

  function confirmRestart() {
    if (game.mode !== 'paused') return;
    ui.confirm({
      title: 'Restart this run?',
      copy: 'Current distance, flow, and run coins will be discarded.',
      accept: 'RESTART RUN',
      onAccept: startRun
    });
  }

  function confirmLeaveRun() {
    if (game.mode !== 'paused') return;
    ui.confirm({
      title: 'Return to the menu?',
      copy: 'This unfinished run will not be added to your records.',
      accept: 'LEAVE RUN',
      onAccept: () => showMenu('main')
    });
  }

  function presentationChanged() {
    worldFade?.classList.add('active');
    window.setTimeout(() => {
      renderer.themeChanged();
      document.documentElement.style.setProperty('--world-accent', ui.selectedWorld().accent);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ui.selectedWorld().skyTop);
      worldFade?.classList.remove('active');
    }, ui.save.settings.motion ? 150 : 0);
  }

  ui.bind({
    start: startRun,
    restart: confirmRestart,
    menu: () => showMenu('main'),
    garage: () => showMenu('garage'),
    pause: pauseRun,
    resume: resumeRun,
    leaveRun: confirmLeaveRun,
    skipIntro: () => intro.skip(),
    presentationChanged
  });

  const intro = new root.DriftIntro.IntroCinematic({
    canvas: document.getElementById('introCanvas'),
    splash: ui.U.splash,
    logo: ui.U.splashLogo,
    selectedSkin: ui.selectedSkin,
    selectedWorld: ui.selectedWorld,
    motionEnabled: () => ui.save.settings.motion,
    onImpact: () => {
      ui.audio.unlock();
      ui.audio.land('perfect');
      ui.haptic([7, 18, 7]);
    },
    onComplete: () => {
      try { sessionStorage.setItem('driftline-intro-seen-v22', '1'); } catch (_) {}
      ui.finishSplash();
      showMenu('main');
    }
  });

  function updatePlaying(dt) {
    const events = world.step(dt, game.held);
    handlePhysicsEvents(events, false);
    if (game.mode !== 'playing') return;
    game.distance = distanceMeters();
    const speed = Math.hypot(world.ball.vx, world.ball.vy);
    const height = altitude();
    game.metrics.maxSpeed = Math.max(game.metrics.maxSpeed, speed);
    game.metrics.maxAltitude = Math.max(game.metrics.maxAltitude, height);
    processScoreEvents(score.updateDistance(game.distance));
    processScoreEvents(score.update(world.ball, dt, world.flight.airtime));
    coins.update();
    coins.collect();
    sand.update(dt, ui.selectedSkin());
    updateCamera(dt);
    updateTutorialWorld();
    game.audioClock -= dt;
    if (game.audioClock <= 0) {
      game.audioClock = 0.09;
      ui.audio.updateMotion(speed, world.ball.grounded, game.held);
    }
  }

  function updateDemo(dt) {
    game.demoResetClock += dt;
    const held = pilot.update(dt);
    const events = world.step(dt, held);
    handlePhysicsEvents(events, true);
    if (game.mode !== 'menu') return;
    coins.update();
    sand.update(dt, ui.selectedSkin());
    updateCamera(dt);
    if (world.ball.x > 28000 || game.demoResetClock > 64) resetDemo();
    game.audioClock -= dt;
    if (game.audioClock <= 0) {
      game.audioClock = 0.14;
      ui.audio.updateMotion(Math.hypot(world.ball.vx, world.ball.vy), world.ball.grounded, held);
    }
  }

  function refreshHud() {
    if (game.mode !== 'playing' && game.mode !== 'ending' && game.mode !== 'paused') return;
    const snapshot = score.snapshot();
    const speed = Math.hypot(world.ball.vx, world.ball.vy);
    const height = altitude();
    ui.updateHud({
      score: snapshot.score,
      distance: game.distance,
      pending: snapshot.pending,
      multiplier: snapshot.multiplier,
      coins: game.runCoins,
      speed,
      altitude: height / 5,
      aboveLine: snapshot.aboveLine
    });
  }

  function frame(time) {
    const dt = Math.min(MAX_FRAME, Math.max(0, (time - game.lastTime) / 1000));
    game.lastTime = time;
    if (game.mode === 'playing' || game.mode === 'menu') {
      game.accumulator = Math.min(game.accumulator + dt, FIXED_STEP * 8);
      while (game.accumulator >= FIXED_STEP) {
        if (game.mode === 'playing') updatePlaying(FIXED_STEP);
        else if (game.mode === 'menu') updateDemo(FIXED_STEP);
        game.accumulator -= FIXED_STEP;
        if (game.mode !== 'playing' && game.mode !== 'menu') break;
      }
    } else if (game.mode === 'ending') {
      sand.update(dt, ui.selectedSkin());
      updateCamera(dt);
    }
    refreshHud();
    renderer.draw(time);
    requestAnimationFrame(frame);
  }

  function activePointerDown(event) {
    if (game.mode !== 'playing' || game.pointerId !== null) return;
    game.pointerId = event.pointerId;
    try { canvas.setPointerCapture?.(event.pointerId); } catch (_) {}
    setHeld(true);
    event.preventDefault();
  }

  function activePointerUp(event) {
    if (game.pointerId === null || (event.pointerId !== undefined && event.pointerId !== game.pointerId)) return;
    try { canvas.releasePointerCapture?.(game.pointerId); } catch (_) {}
    game.pointerId = null;
    setHeld(false);
    event.preventDefault?.();
  }

  canvas.addEventListener('pointerdown', activePointerDown, { passive: false });
  canvas.addEventListener('pointerup', activePointerUp, { passive: false });
  canvas.addEventListener('pointercancel', activePointerUp, { passive: false });
  window.addEventListener('pointerup', activePointerUp, { passive: false });
  window.addEventListener('pointercancel', activePointerUp, { passive: false });
  canvas.addEventListener('lostpointercapture', event => {
    if (event.pointerId === game.pointerId) {
      game.pointerId = null;
      setHeld(false);
    }
  });

  document.addEventListener('keydown', event => {
    if ((event.code === 'Space' || event.code === 'ArrowDown') && !event.repeat && game.mode === 'playing') {
      setHeld(true);
      event.preventDefault();
    } else if (event.code === 'Escape' && game.mode === 'playing') {
      pauseRun();
      event.preventDefault();
    }
  });
  document.addEventListener('keyup', event => {
    if ((event.code === 'Space' || event.code === 'ArrowDown') && game.mode === 'playing') {
      setHeld(false);
      event.preventDefault();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing') pauseRun();
    game.lastTime = performance.now();
    game.accumulator = 0;
  });
  window.addEventListener('blur', () => {
    if (game.mode === 'playing' && !document.hasFocus()) pauseRun();
  });

  let resizeTimer = 0;
  function handleResize() {
    renderer.resize(true);
    intro.resize();
    if (game.mode !== 'playing' && game.mode !== 'ending') resetCamera(true);
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      renderer.resize(true);
      intro.resize();
    }, 180);
  }
  window.addEventListener('resize', handleResize, { passive: true });
  window.visualViewport?.addEventListener('resize', handleResize, { passive: true });

  root.__DRIFTLINE__ = {
    version: 22,
    get mode() { return game.mode; },
    snapshot() {
      return {
        mode: game.mode,
        seed: game.runSeed,
        distance: game.distance,
        runCoins: game.runCoins,
        score: score.snapshot(),
        ball: { ...world.ball },
        camera: { ...camera },
        coins: coins.snapshot(),
        metrics: game.metrics ? { ...game.metrics } : null
      };
    }
  };

  ui.render();
  presentationChanged();
  resetDemo();
  renderer.draw(performance.now());
  requestAnimationFrame(frame);

  let introSeen = false;
  try { introSeen = sessionStorage.getItem('driftline-intro-seen-v22') === '1'; } catch (_) {}
  if (introSeen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    showMenu('main');
  } else {
    game.mode = 'intro';
    ui.closeOverlays();
    ui.showSplash();
    intro.start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
