(() => {
  'use strict';

  if (!window.DriftPhysics) throw new Error('DriftPhysics core failed to load.');
  const { PhysicsWorld, SplineTerrain, math } = window.DriftPhysics;
  const { clamp, lerp } = math;
  const TAU = Math.PI * 2;
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  const U = {
    hud: $('hud'), score: $('scoreValue'), runCoins: $('runCoins'), landingToast: $('landingToast'),
    pauseButton: $('pauseButton'), menuRoot: $('menuRoot'), walletCoins: $('walletCoins'),
    shopWalletCoins: $('shopWalletCoins'), bestScore: $('bestScore'), selectedSkinName: $('selectedSkinName'),
    playButton: $('playButton'), shopGrid: $('shopGrid'), soundToggle: $('soundToggle'),
    vibrationToggle: $('vibrationToggle'), motionToggle: $('motionToggle'), resetDataButton: $('resetDataButton'),
    statsBest: $('statsBest'), statsRuns: $('statsRuns'), statsCoins: $('statsCoins'),
    statsPerfects: $('statsPerfects'), statsSkins: $('statsSkins'), gameOver: $('gameOverScreen'),
    gameOverTitle: $('gameOverTitle'), gameOverReason: $('gameOverReason'), finalScore: $('finalScore'),
    finalBest: $('finalBest'), finalCoins: $('finalCoins'), retryButton: $('retryButton'),
    resultShopButton: $('resultShopButton'), menuButton: $('menuButton'), pauseOverlay: $('pauseOverlay'),
    resumeButton: $('resumeButton'), restartButton: $('restartButton'), pauseSettingsButton: $('pauseSettingsButton'),
    pauseMenuButton: $('pauseMenuButton'), systemToast: $('toastMessage')
  };

  function installHud() {
    let center = document.querySelector('.hud-center');
    if (!center) {
      center = document.createElement('div');
      center.className = 'hud-center';
      U.landingToast.parentNode.insertBefore(center, U.landingToast);
      center.appendChild(U.landingToast);
    }
    let stunt = center.querySelector('.stunt-hud');
    if (!stunt) {
      stunt = document.createElement('div');
      stunt.className = 'stunt-hud';
      stunt.innerHTML = '<strong id="multiplierValue">×1.0</strong><span id="speedLabel">CRUISE</span><small id="altitudeLabel">GROUND</small>';
      center.appendChild(stunt);
    }
    U.multiplier = $('multiplierValue');
    U.speedLabel = $('speedLabel');
    U.altitudeLabel = $('altitudeLabel');

    const style = document.createElement('style');
    style.textContent = '.hud-center{justify-self:center;display:grid;justify-items:center;gap:5px;pointer-events:none}.stunt-hud{display:grid;grid-template-columns:auto auto;align-items:center;gap:0 8px;min-width:116px;padding:6px 11px;border:1px solid rgba(255,255,255,.56);border-radius:999px;background:rgba(7,42,55,.64);color:#fff;box-shadow:0 8px 22px rgba(0,37,50,.2);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:transform .16s,background .16s}.stunt-hud.hot{transform:scale(1.08);background:rgba(8,68,80,.78)}.stunt-hud strong{font-size:16px;line-height:1;color:#fff3a1}.stunt-hud span{font-size:8px;font-weight:1000;letter-spacing:.13em}.stunt-hud small{grid-column:1/-1;text-align:center;margin-top:1px;font-size:7px;font-weight:900;letter-spacing:.12em;color:rgba(255,255,255,.72)}@media (orientation:portrait){.hud-center{position:absolute;left:50%;top:max(69px,calc(env(safe-area-inset-top) + 54px));transform:translateX(-50%)}.hud-center .landing-toast{position:static;transform:translateY(-8px) scale(.96)}.hud-center .landing-toast.show{transform:none}}@media (max-height:570px) and (orientation:landscape){.stunt-hud{padding:4px 9px}.stunt-hud strong{font-size:14px}.stunt-hud small{display:none}}';
    document.head.appendChild(style);
  }
  installHud();

  const SKINS = [
    { id: 'aqua', name: 'Aqua', price: 0, color: '#12cbd2', hue: 0, trail: '#c8ffff' },
    { id: 'coral', name: 'Coral', price: 25, color: '#ff6670', hue: 145, trail: '#ffd0d4' },
    { id: 'sunset', name: 'Sunset', price: 50, color: '#ff9d35', hue: 195, trail: '#ffe1a9' },
    { id: 'violet', name: 'Violet', price: 80, color: '#9068ff', hue: 75, trail: '#ddd1ff' },
    { id: 'lime', name: 'Lime', price: 120, color: '#8bdc38', hue: 260, trail: '#dffff0' },
    { id: 'midnight', name: 'Midnight', price: 180, color: '#173b67', hue: 35, trail: '#92c5ff' }
  ];

  const SAVE_KEY = 'driftline-save-v3';
  const defaults = () => ({
    best: 0, wallet: 0, lifetimeCoins: 0, runs: 0, perfects: 0,
    owned: ['aqua'], skin: 'aqua', settings: { sound: true, vibration: true, motion: true }
  });

  function loadSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!raw) return defaults();
      const base = defaults();
      return {
        ...base, ...raw,
        owned: Array.isArray(raw.owned) && raw.owned.length ? raw.owned : ['aqua'],
        settings: { ...base.settings, ...(raw.settings || {}) }
      };
    } catch (_) { return defaults(); }
  }

  let save = loadSave();
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {} };
  const selectedSkin = () => SKINS.find(skin => skin.id === save.skin) || SKINS[0];

  const assets = { ball: new Image(), coin: new Image(), bg: new Image() };
  assets.ball.src = 'assets/ball.svg';
  assets.coin.src = 'assets/coin.svg';
  assets.bg.src = 'assets/background.svg';

  class AudioBus {
    unlock() {
      if (!save.settings.sound) return;
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.13;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    tone(start, duration, type = 'sine', gain = 0.1, end = start) {
      if (!save.settings.sound) return;
      this.unlock();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const oscillator = this.ctx.createOscillator();
      const amplifier = this.ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(start, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, end), now + duration);
      amplifier.gain.setValueAtTime(0.0001, now);
      amplifier.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      amplifier.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(amplifier);
      amplifier.connect(this.master);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.03);
    }
    click() { this.tone(520, 0.06, 'triangle', 0.07, 700); }
    launch() { this.tone(170, 0.18, 'triangle', 0.11, 510); }
    coin() { this.tone(880, 0.09, 'sine', 0.11, 1320); }
    good() { this.tone(370, 0.09, 'triangle', 0.07, 500); }
    perfect() { this.tone(520, 0.13, 'triangle', 0.11, 830); setTimeout(() => this.tone(850, 0.09, 'sine', 0.07, 1120), 40); }
    crash() { this.tone(115, 0.25, 'sawtooth', 0.14, 48); }
  }
  const audio = new AudioBus();
  const haptic = pattern => { if (save.settings.vibration && navigator.vibrate) navigator.vibrate(pattern); };

  class ParticleSystem {
    constructor() { this.items = []; }
    clear() { this.items.length = 0; }
    burst(x, y, color, count = 10, speed = 140) {
      if (!save.settings.motion) return;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * TAU;
        const velocity = speed * (0.45 + Math.random() * 0.75);
        this.items.push({
          x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
          life: 0.45 + Math.random() * 0.25, max: 0.7, size: 2 + Math.random() * 4, color
        });
      }
    }
    trail(x, y, vx, vy, color) {
      if (!save.settings.motion) return;
      this.items.push({ x, y, vx: -vx * 0.025 + (Math.random() - 0.5) * 24, vy: -vy * 0.025 + (Math.random() - 0.5) * 24, life: 0.32, max: 0.32, size: 2 + Math.random() * 3, color });
    }
    update(dt) {
      for (let index = this.items.length - 1; index >= 0; index--) {
        const particle = this.items[index];
        particle.life -= dt;
        if (particle.life <= 0) { this.items.splice(index, 1); continue; }
        particle.vy += 220 * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
      }
    }
  }

  class CoinField {
    constructor() { this.items = []; this.nextX = 720; }
    reset() { this.items.length = 0; this.nextX = 720; this.ensure(3800); }
    addArc(startX, count, spacing, arcHeight) {
      let roof = Infinity;
      for (let index = 0; index < count; index++) roof = Math.min(roof, world.terrain.height(startX + index * spacing));
      for (let index = 0; index < count; index++) {
        const t = count === 1 ? 0.5 : index / (count - 1);
        const x = startX + index * spacing;
        const terrainY = world.terrain.height(x);
        const y = Math.min(terrainY - 52, roof - 58 - Math.sin(Math.PI * t) * arcHeight);
        this.items.push({ x, y, taken: false, phase: index * 0.46 + startX * 0.002 });
      }
    }
    ensure(targetX) {
      world.terrain.ensure(targetX + 1500);
      while (this.nextX < targetX) {
        const start = this.nextX;
        const slope = Math.abs(world.terrain.slope(start + 160));
        const count = 6 + Math.floor((start / 770) % 5);
        const spacing = 44 + Math.floor((Math.sin(start * 0.01) + 1) * 5);
        const height = clamp(82 + slope * 80 + 42 * Math.sin(start / 490), 62, 185);
        this.addArc(start, count, spacing, height);
        this.nextX += count * spacing + 260 + (Math.sin(start * 0.006) + 1) * 90;
      }
    }
  }

  let W = 1, H = 1, DPR = 1, baseScale = 1;
  const terrain = new SplineTerrain({ seed: 0xD11F71 });
  const world = new PhysicsWorld({ terrain });
  const coins = new CoinField();
  const particles = new ParticleSystem();
  const stars = Array.from({ length: 130 }, (_, index) => ({
    x: ((Math.sin(index * 91.733) * 43758.5453) % 1 + 1) % 1,
    y: ((Math.sin(index * 37.119 + 2.4) * 24634.6345) % 1 + 1) % 1,
    size: 0.6 + (((Math.sin(index * 13.31) * 911.2) % 1 + 1) % 1) * 1.8,
    alpha: 0.35 + (((Math.sin(index * 71.9) * 333.8) % 1 + 1) % 1) * 0.65
  }));

  const G = {
    state: 'menu', held: false, score: 0, bonusScore: 0, runCoins: 0,
    chain: 0, multiplier: 1, toastTimer: 0, shake: 0, accumulator: 0,
    fixedStep: 1 / 120, lastFrame: performance.now(), menuReturn: 'main',
    camera: { x: 0, y: 0, zoom: 1, spaceBlend: 0 }, announced: new Set()
  };

  function resize() {
    W = Math.max(280, Math.round(window.innerWidth));
    H = Math.max(320, Math.round(window.innerHeight));
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    baseScale = clamp(H / 620, 0.58, 1.05);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener('resize', resize, { passive: true });
  addEventListener('orientationchange', () => setTimeout(resize, 160), { passive: true });
  resize();

  const expLerp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));
  const currentScale = () => baseScale * G.camera.zoom;
  const worldToScreenX = x => (x - G.camera.x) * currentScale();
  const worldToScreenY = y => (y - G.camera.y) * currentScale();

  function showGameplay(visible) {
    U.hud.classList.toggle('active', visible);
    U.hud.setAttribute('aria-hidden', visible ? 'false' : 'true');
    U.pauseButton.style.display = visible && G.state === 'playing' ? 'block' : 'none';
    U.pauseButton.setAttribute('aria-hidden', visible && G.state === 'playing' ? 'false' : 'true');
  }
  function showToast(message) {
    U.systemToast.textContent = message; U.systemToast.classList.add('show');
    clearTimeout(showToast.timer); showToast.timer = setTimeout(() => U.systemToast.classList.remove('show'), 1300);
  }
  function quip(message, color = '#fff', duration = 0.85) {
    U.landingToast.textContent = message; U.landingToast.style.color = color; U.landingToast.classList.add('show');
    G.toastTimer = duration; document.querySelector('.stunt-hud')?.classList.add('hot');
    clearTimeout(quip.hotTimer); quip.hotTimer = setTimeout(() => document.querySelector('.stunt-hud')?.classList.remove('hot'), 430);
  }
  function speedTier(speed) {
    if (speed > 1250) return 'MAX VELOCITY'; if (speed > 980) return 'HYPERSPEED';
    if (speed > 760) return 'BLAZING'; if (speed > 560) return 'FAST'; return 'CRUISE';
  }
  function updateHud() {
    const ball = world.ball;
    const speed = Math.hypot(ball.vx, ball.vy);
    const altitude = Math.max(0, world.terrain.frame(ball.x, ball.radius).centerY - ball.y);
    U.multiplier.textContent = `×${G.multiplier.toFixed(1)}`;
    U.speedLabel.textContent = speedTier(speed);
    U.altitudeLabel.textContent = ball.grounded ? `${Math.round(speed * 0.34)} KM/H` : `${Math.round(altitude)} ALT`;
    U.score.textContent = `${Math.floor(G.score)} m`; U.runCoins.textContent = G.runCoins;
  }

  function renderSettings() {
    U.soundToggle.classList.toggle('on', save.settings.sound);
    U.vibrationToggle.classList.toggle('on', save.settings.vibration);
    U.motionToggle.classList.toggle('on', save.settings.motion);
  }
  function renderShop() {
    U.shopGrid.replaceChildren();
    for (const skin of SKINS) {
      const owned = save.owned.includes(skin.id), equipped = save.skin === skin.id;
      const card = document.createElement('article');
      card.className = `shop-card${equipped ? ' selected' : ''}${owned ? '' : ' locked'}`;
      card.innerHTML = `<div class="skin-preview" style="--skin:${skin.color}"><span class="skin-ball"></span></div><h3>${skin.name}</h3><p>${skin.id === 'aqua' ? 'Original clean finish' : 'Cosmetic colorway'}</p><button class="shop-action ${equipped ? 'equipped' : owned ? 'owned' : ''}" type="button" data-skin="${skin.id}">${equipped ? 'EQUIPPED' : owned ? 'EQUIP' : `<img src="assets/coin.svg" alt="" />${skin.price}`}</button>`;
      U.shopGrid.append(card);
    }
  }
  function renderMenuData() {
    const skin = selectedSkin();
    U.walletCoins.textContent = save.wallet; U.shopWalletCoins.textContent = save.wallet;
    U.bestScore.textContent = `${Math.floor(save.best)} m`; U.selectedSkinName.textContent = skin.name;
    U.statsBest.textContent = `${Math.floor(save.best)} m`; U.statsRuns.textContent = save.runs;
    U.statsCoins.textContent = save.lifetimeCoins; U.statsPerfects.textContent = save.perfects;
    U.statsSkins.textContent = `${save.owned.length} / ${SKINS.length}`; renderSettings(); renderShop();
  }
  function activateView(name) {
    document.querySelectorAll('.menu-view').forEach(view => {
      const active = view.dataset.view === name; view.classList.toggle('active', active);
      view.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
  }
  function openMenu(name = 'main', returnTo = 'main') {
    G.state = returnTo === 'pause' ? 'paused' : 'menu'; G.menuReturn = returnTo; G.held = false;
    U.pauseOverlay.classList.remove('active'); U.gameOver.classList.remove('active'); U.menuRoot.classList.add('active');
    activateView(name); showGameplay(false); renderMenuData();
  }
  function closeOverlays() {
    U.menuRoot.classList.remove('active'); U.gameOver.classList.remove('active'); U.pauseOverlay.classList.remove('active');
    U.gameOver.setAttribute('aria-hidden', 'true'); U.pauseOverlay.setAttribute('aria-hidden', 'true');
  }
  function resetRun() {
    const seed = ((Date.now() & 0xffffffff) ^ Math.imul(save.runs + 1, 2654435761)) >>> 0;
    world.reset(seed); coins.reset(); particles.clear();
    Object.assign(G, { score: 0, bonusScore: 0, runCoins: 0, chain: 0, multiplier: 1, toastTimer: 0, shake: 0, accumulator: 0, held: false });
    G.announced = new Set(); G.camera.x = world.ball.x - W / baseScale * 0.28;
    G.camera.y = world.terrain.height(world.ball.x) - H / baseScale * 0.69; G.camera.zoom = 1; G.camera.spaceBlend = 0; updateHud();
  }
  function startRun() {
    audio.unlock(); audio.click(); resetRun(); closeOverlays(); G.state = 'playing'; G.lastFrame = performance.now(); showGameplay(true);
  }
  function bankRun() {
    save.wallet += G.runCoins; save.lifetimeCoins += G.runCoins; save.runs += 1;
    save.best = Math.max(save.best, Math.floor(G.score)); persist();
  }
  function endRun(title, reason) {
    if (G.state !== 'playing') return;
    G.state = 'gameover'; G.held = false; G.shake = save.settings.motion ? 12 : 0;
    particles.burst(world.ball.x, world.ball.y, '#ff5964', 20, 210); audio.crash(); haptic([45, 35, 70]); bankRun();
    U.gameOverTitle.textContent = title; U.gameOverReason.textContent = reason;
    U.finalScore.textContent = `${Math.floor(G.score)} m`; U.finalBest.textContent = `${Math.floor(save.best)} m`; U.finalCoins.textContent = G.runCoins;
    showGameplay(false); setTimeout(() => { U.gameOver.classList.add('active'); U.gameOver.setAttribute('aria-hidden', 'false'); }, 160);
  }
  function pauseGame() {
    if (G.state !== 'playing') return; G.state = 'paused'; G.held = false;
    U.pauseOverlay.classList.add('active'); U.pauseOverlay.setAttribute('aria-hidden', 'false'); showGameplay(false); audio.click();
  }
  function resumeGame() {
    if (G.state !== 'paused') return; G.state = 'playing'; U.pauseOverlay.classList.remove('active'); U.menuRoot.classList.remove('active');
    G.lastFrame = performance.now(); showGameplay(true); audio.click();
  }

  function handleMilestones() {
    if (world.ball.grounded) return;
    const flight = world.flight, speed = Math.hypot(world.ball.vx, world.ball.vy);
    const checks = [['air1', flight.airtime > 1.1, 'NICE AIR'], ['height1', flight.maxAltitude > 250, 'BIG AIR'], ['air2', flight.airtime > 2.4, 'SOARING'], ['height2', flight.maxAltitude > 520, 'SKY HIGH'], ['speed1', speed > 920, 'HYPERSPEED'], ['air3', flight.airtime > 4.2, 'ORBITAL'], ['height3', flight.maxAltitude > 950, 'TO THE STARS']];
    for (const [key, condition, message] of checks) if (condition && !G.announced.has(key)) {
      G.announced.add(key); G.multiplier = clamp(G.multiplier + 0.2, 1, 8);
      quip(message, key.startsWith('height') ? '#e2e8ff' : '#fff'); break;
    }
  }
  function handlePhysicsEvents(events) {
    for (const event of events) {
      if (event.type === 'launch') {
        G.announced = new Set(); audio.launch(); haptic(8);
        if (event.speed > 850) quip('CANNONBALL', '#d9ffff'); else if (event.speed > 580) quip('LAUNCH', '#d9ffff', 0.55);
      } else if (event.type === 'landing') {
        if (event.grade === 'perfect') {
          G.chain += 1; G.multiplier = clamp(1 + G.chain * 0.34 + Math.floor(event.flight.airtime / 2.2) * 0.18, 1, 8);
          G.bonusScore += Math.round((event.flight.airtime * 16 + event.flight.maxAltitude * 0.08 + event.bonus) * G.multiplier);
          save.perfects += 1; persist();
          let message = `PERFECT +${Math.round(event.bonus)}`;
          if (event.flight.maxAltitude > 900) message = 'COSMIC LANDING'; else if (event.flight.airtime > 3.6) message = 'BUTTER SMOOTH';
          quip(message, '#fff3a6', 1.05); particles.burst(world.ball.x, world.ball.y + world.ball.radius, '#fff', 16, 135); audio.perfect(); haptic([10, 25, 10]);
        } else {
          G.chain = Math.max(0, G.chain - 1); G.multiplier = clamp(1 + G.chain * 0.24, 1, 8); quip('GOOD', '#fff', 0.55); audio.good(); haptic(10);
        }
      } else if (event.type === 'crash') {
        const reason = event.reason === 'backward' ? 'The impact reversed your momentum.' : event.reason === 'alignment' ? 'Match your flight vector to the slope.' : 'The normal impact force was too high.';
        endRun('Hard landing', reason);
      } else if (event.type === 'stall') endRun('Momentum lost', 'Carry more speed into the incline.');
    }
  }
  function collectCoins() {
    const ball = world.ball; coins.ensure(ball.x + W / Math.max(currentScale(), 0.3) * 2.2);
    for (const coin of coins.items) {
      if (coin.taken) continue; const dx = coin.x - ball.x; if (dx < -110) continue; if (dx > 110) break;
      const dy = coin.y - ball.y, radius = ball.radius + 13;
      if (dx * dx + dy * dy <= radius * radius) {
        coin.taken = true; const value = Math.max(1, Math.floor(G.multiplier)); G.runCoins += value;
        particles.burst(coin.x, coin.y, '#ffd33d', 9 + value * 2, 125); audio.coin(); haptic(10);
      }
    }
  }
  function updateCamera(dt) {
    const ball = world.ball, speed = Math.hypot(ball.vx, ball.vy);
    const groundY = world.terrain.frame(ball.x, ball.radius).centerY, altitude = Math.max(0, groundY - ball.y);
    const speedPull = clamp((speed - 360) / 1050, 0, 1) * 0.2;
    const altitudePull = clamp(altitude / 1050, 0, 1) * 0.36;
    const airtimePull = clamp(world.flight.airtime / 5.5, 0, 1) * 0.08;
    G.camera.zoom = expLerp(G.camera.zoom, clamp(1 - speedPull - altitudePull - airtimePull, 0.42, 1), 2.35, dt);
    const scale = baseScale * G.camera.zoom;
    const targetX = ball.x - W / scale * 0.28, baseY = groundY - H / scale * 0.69, airborneY = ball.y - H / scale * 0.45;
    const airBlend = clamp(altitude / 390, 0, 1);
    G.camera.x = expLerp(G.camera.x, targetX, 5.1, dt);
    G.camera.y = expLerp(G.camera.y, lerp(baseY, airborneY, airBlend), ball.grounded ? 4.1 : 2.65, dt);
    G.camera.spaceBlend = expLerp(G.camera.spaceBlend, clamp((altitude - 500) / 900, 0, 1), 2, dt);
  }
  function update(dt) {
    const events = world.step(dt, G.held); handlePhysicsEvents(events); if (G.state !== 'playing') return;
    handleMilestones(); collectCoins(); particles.update(dt);
    const speed = Math.hypot(world.ball.vx, world.ball.vy);
    if (save.settings.motion && speed > 390 && Math.random() < clamp((speed - 280) / 1000, 0.18, 0.72)) particles.trail(world.ball.x - world.ball.radius, world.ball.y, world.ball.vx, world.ball.vy, selectedSkin().trail);
    G.score = Math.max(G.score, (world.ball.x - 120) / 10 + G.bonusScore / 100);
    if (G.toastTimer > 0 && (G.toastTimer -= dt) <= 0) U.landingToast.classList.remove('show');
    updateCamera(dt); updateHud();
  }

  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#03c6cf'); sky.addColorStop(0.55, '#b7efd9'); sky.addColorStop(1, '#f7efa3');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (assets.bg.complete && assets.bg.naturalWidth) {
      const imageHeight = H, imageWidth = imageHeight * (assets.bg.naturalWidth / assets.bg.naturalHeight);
      const offset = -((G.camera.x * 0.06) % imageWidth + imageWidth) % imageWidth; ctx.globalAlpha = 1 - G.camera.spaceBlend * 0.93;
      for (let x = offset - imageWidth; x < W + imageWidth; x += imageWidth) ctx.drawImage(assets.bg, x, 0, imageWidth, imageHeight); ctx.globalAlpha = 1;
    }
    if (G.camera.spaceBlend > 0.001) {
      const space = ctx.createLinearGradient(0, 0, 0, H); space.addColorStop(0, `rgba(2,5,24,${0.98 * G.camera.spaceBlend})`); space.addColorStop(0.7, `rgba(10,24,65,${0.84 * G.camera.spaceBlend})`); space.addColorStop(1, `rgba(19,65,88,${0.6 * G.camera.spaceBlend})`);
      ctx.fillStyle = space; ctx.fillRect(0, 0, W, H); const drift = G.camera.x * 0.014;
      for (const star of stars) {
        const x = ((star.x * W * 1.35 - drift) % (W + 80) + W + 80) % (W + 80) - 40;
        ctx.globalAlpha = G.camera.spaceBlend * star.alpha; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, star.y * H * 0.88, star.size, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawTerrain() {
    const scale = currentScale(), start = G.camera.x - 50 / scale, end = G.camera.x + (W + 50) / scale, step = clamp(7 / scale, 5, 17);
    ctx.beginPath(); ctx.moveTo(-20, H + 60); for (let x = start; x <= end; x += step) ctx.lineTo(worldToScreenX(x), worldToScreenY(world.terrain.height(x)));
    ctx.lineTo(W + 20, H + 60); ctx.closePath(); const groundGradient = ctx.createLinearGradient(0, H * 0.35, 0, H);
    groundGradient.addColorStop(0, G.camera.spaceBlend > 0.45 ? '#348f91' : '#58cbb7'); groundGradient.addColorStop(1, '#087f86'); ctx.fillStyle = groundGradient; ctx.fill();
    ctx.beginPath(); let first = true;
    for (let x = start; x <= end; x += step) { const sx = worldToScreenX(x), sy = worldToScreenY(world.terrain.height(x)); if (first) { ctx.moveTo(sx, sy); first = false; } else ctx.lineTo(sx, sy); }
    ctx.strokeStyle = 'rgba(255,255,255,.64)'; ctx.lineWidth = clamp(3 * scale, 1.2, 3.4); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  }
  function drawCoins() {
    const time = performance.now() * 0.004;
    for (const coin of coins.items) {
      if (coin.taken) continue; const sx = worldToScreenX(coin.x), sy = worldToScreenY(coin.y + Math.sin(time + coin.phase) * 2.5);
      if (sx < -45 || sx > W + 45 || sy < -55 || sy > H + 55) continue; const size = clamp(30 * currentScale(), 14, 32);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.sin(time * 0.7 + coin.phase) * 0.08); ctx.shadowColor = 'rgba(255,190,0,.55)'; ctx.shadowBlur = clamp(12 * currentScale(), 5, 12);
      if (assets.coin.complete && assets.coin.naturalWidth) ctx.drawImage(assets.coin, -size / 2, -size / 2, size, size); else { ctx.fillStyle = '#ffd33d'; ctx.beginPath(); ctx.arc(0, 0, size * 0.37, 0, TAU); ctx.fill(); } ctx.restore();
    }
  }
  function drawParticles() {
    for (const particle of particles.items) { const alpha = clamp(particle.life / particle.max, 0, 1); ctx.globalAlpha = alpha; ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(worldToScreenX(particle.x), worldToScreenY(particle.y), clamp(particle.size * currentScale() * alpha, 0.7, 6), 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
  }
  function drawBall() {
    const ball = world.ball, skin = selectedSkin(), sx = worldToScreenX(ball.x), sy = worldToScreenY(ball.y), size = clamp(ball.radius * 2.1 * currentScale(), 19, ball.radius * 2.2);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ball.rotation); ctx.shadowColor = skin.color; ctx.shadowBlur = save.settings.motion ? clamp(13 * currentScale(), 6, 15) : 5;
    if (assets.ball.complete && assets.ball.naturalWidth) { ctx.filter = `hue-rotate(${skin.hue}deg) saturate(1.12)`; ctx.drawImage(assets.ball, -size / 2, -size / 2, size, size); ctx.filter = 'none'; }
    else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, TAU); ctx.fill(); ctx.strokeStyle = skin.color; ctx.lineWidth = Math.max(2, size * 0.11); ctx.stroke(); } ctx.restore();
  }
  function draw() {
    drawSky(); const shakeX = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0, shakeY = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    if (G.shake > 0) G.shake *= 0.88; ctx.save(); ctx.translate(shakeX, shakeY); drawTerrain(); drawCoins(); drawParticles(); drawBall(); ctx.restore();
  }
  function loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - G.lastFrame) / 1000)); G.lastFrame = now;
    if (G.state === 'playing') { G.accumulator += dt; while (G.accumulator >= G.fixedStep) { update(G.fixedStep); G.accumulator -= G.fixedStep; if (G.state !== 'playing') break; } }
    else { particles.update(dt); updateCamera(dt); }
    draw(); requestAnimationFrame(loop);
  }

  document.querySelectorAll('[data-open-view]').forEach(button => button.addEventListener('click', () => {
    audio.click(); const target = button.dataset.openView;
    if (target === 'main' && G.menuReturn === 'pause') { U.menuRoot.classList.remove('active'); U.pauseOverlay.classList.add('active'); G.menuReturn = 'main'; return; }
    activateView(target); renderMenuData();
  }));
  document.querySelectorAll('[data-setting]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.setting; save.settings[key] = !save.settings[key]; persist(); renderSettings();
    if (key !== 'sound' || save.settings.sound) audio.click(); if (key === 'vibration' && save.settings.vibration) haptic(12);
  }));
  U.shopGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-skin]'); if (!button) return; const skin = SKINS.find(item => item.id === button.dataset.skin); if (!skin) return; audio.click();
    if (save.owned.includes(skin.id)) { save.skin = skin.id; persist(); renderMenuData(); showToast(`${skin.name} equipped`); }
    else if (save.wallet < skin.price) { showToast(`Need ${skin.price - save.wallet} more coins`); haptic(25); }
    else { save.wallet -= skin.price; save.owned.push(skin.id); save.skin = skin.id; persist(); renderMenuData(); showToast(`${skin.name} unlocked`); haptic([12, 25, 12]); }
  });
  U.resetDataButton.addEventListener('click', () => { if (!confirm('Reset all coins, records, skins, and settings?')) return; save = defaults(); persist(); renderMenuData(); showToast('Save data reset'); });
  U.playButton.addEventListener('click', startRun); U.retryButton.addEventListener('click', startRun); U.resultShopButton.addEventListener('click', () => openMenu('shop', 'main'));
  U.menuButton.addEventListener('click', () => openMenu('main', 'main')); U.pauseButton.addEventListener('click', pauseGame); U.resumeButton.addEventListener('click', resumeGame);
  U.restartButton.addEventListener('click', startRun); U.pauseSettingsButton.addEventListener('click', () => openMenu('settings', 'pause')); U.pauseMenuButton.addEventListener('click', () => openMenu('main', 'main'));
  canvas.addEventListener('pointerdown', event => { if (G.state !== 'playing') return; G.held = true; audio.unlock(); event.preventDefault(); }, { passive: false });
  const release = event => { G.held = false; event?.preventDefault?.(); }; addEventListener('pointerup', release, { passive: false }); addEventListener('pointercancel', release, { passive: false });
  addEventListener('keydown', event => { if (event.code === 'Space') { event.preventDefault(); if (G.state === 'menu' || G.state === 'gameover') startRun(); else if (G.state === 'playing') G.held = true; } if (event.code === 'Escape') { if (G.state === 'playing') pauseGame(); else if (G.state === 'paused') resumeGame(); } });
  addEventListener('keyup', event => { if (event.code === 'Space') { event.preventDefault(); G.held = false; } });

  renderMenuData(); resetRun(); openMenu('main', 'main'); requestAnimationFrame(now => { G.lastFrame = now; requestAnimationFrame(loop); });
  window.__DRIFTLINE_DEBUG__ = { start: startRun, hold: value => { G.held = Boolean(value); }, state: () => ({ state: G.state, score: G.score, multiplier: G.multiplier, camera: { ...G.camera }, ball: { ...world.ball }, flight: { ...world.flight } }), terrain: x => world.terrain.sample(x) };
})();