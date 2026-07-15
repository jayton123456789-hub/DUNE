(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };

  const U = {
    hud: $('hud'),
    score: $('scoreValue'),
    runCoins: $('runCoins'),
    landingToast: $('landingToast'),
    pauseButton: $('pauseButton'),
    menuRoot: $('menuRoot'),
    mainMenu: $('mainMenu'),
    shopScreen: $('shopScreen'),
    settingsScreen: $('settingsScreen'),
    statsScreen: $('statsScreen'),
    helpScreen: $('helpScreen'),
    walletCoins: $('walletCoins'),
    shopWalletCoins: $('shopWalletCoins'),
    bestScore: $('bestScore'),
    selectedSkinName: $('selectedSkinName'),
    playButton: $('playButton'),
    shopGrid: $('shopGrid'),
    soundToggle: $('soundToggle'),
    vibrationToggle: $('vibrationToggle'),
    motionToggle: $('motionToggle'),
    resetDataButton: $('resetDataButton'),
    statsBest: $('statsBest'),
    statsRuns: $('statsRuns'),
    statsCoins: $('statsCoins'),
    statsPerfects: $('statsPerfects'),
    statsSkins: $('statsSkins'),
    gameOver: $('gameOverScreen'),
    gameOverTitle: $('gameOverTitle'),
    gameOverReason: $('gameOverReason'),
    finalScore: $('finalScore'),
    finalBest: $('finalBest'),
    finalCoins: $('finalCoins'),
    retryButton: $('retryButton'),
    resultShopButton: $('resultShopButton'),
    menuButton: $('menuButton'),
    pauseOverlay: $('pauseOverlay'),
    resumeButton: $('resumeButton'),
    restartButton: $('restartButton'),
    pauseSettingsButton: $('pauseSettingsButton'),
    pauseMenuButton: $('pauseMenuButton'),
    systemToast: $('toastMessage')
  };

  const SKINS = [
    { id: 'aqua', name: 'Aqua', price: 0, color: '#12cbd2', hue: 0, trail: '#c8ffff' },
    { id: 'coral', name: 'Coral', price: 25, color: '#ff6670', hue: 145, trail: '#ffd0d4' },
    { id: 'sunset', name: 'Sunset', price: 50, color: '#ff9d35', hue: 195, trail: '#ffe1a9' },
    { id: 'violet', name: 'Violet', price: 80, color: '#9068ff', hue: 75, trail: '#ddd1ff' },
    { id: 'lime', name: 'Lime', price: 120, color: '#8bdc38', hue: 260, trail: '#dffff0' },
    { id: 'midnight', name: 'Midnight', price: 180, color: '#173b67', hue: 35, trail: '#92c5ff' }
  ];

  const SAVE_KEY = 'driftline-save-v3';
  const OLD_SAVE_KEY = 'driftline-save-v2';
  const defaults = () => ({
    best: 0,
    wallet: 0,
    lifetimeCoins: 0,
    runs: 0,
    perfects: 0,
    owned: ['aqua'],
    skin: 'aqua',
    settings: { sound: true, vibration: true, motion: true }
  });

  function loadSave() {
    try {
      const current = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (current) {
        const base = defaults();
        return {
          ...base,
          ...current,
          owned: Array.isArray(current.owned) && current.owned.length ? current.owned : ['aqua'],
          settings: { ...base.settings, ...(current.settings || {}) }
        };
      }
      const old = JSON.parse(localStorage.getItem(OLD_SAVE_KEY) || 'null');
      if (old) {
        const migrated = defaults();
        migrated.best = Number(old.best) || 0;
        migrated.wallet = Number(old.coins) || 0;
        migrated.lifetimeCoins = Number(old.coins) || 0;
        return migrated;
      }
    } catch (_) {}
    return defaults();
  }

  let save = loadSave();
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {}
  }

  function selectedSkin() {
    return SKINS.find(s => s.id === save.skin) || SKINS[0];
  }

  let W = 1;
  let H = 1;
  let DPR = 1;
  function resize() {
    const viewport = window.visualViewport;
    W = Math.max(280, Math.round(viewport?.width || window.innerWidth));
    H = Math.max(320, Math.round(viewport?.height || window.innerHeight));
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (G.player.onGround) G.player.y = ground(G.player.x) - G.player.radius;
  }
  addEventListener('resize', resize, { passive: true });
  window.visualViewport?.addEventListener('resize', resize, { passive: true });
  resize();

  const assets = { ball: new Image(), coin: new Image(), bg: new Image() };
  assets.ball.src = 'assets/ball.svg';
  assets.coin.src = 'assets/coin.svg';
  assets.bg.src = 'assets/background.svg';

  class ArcadeAudio {
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
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(start, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, end), now + duration);
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(amp);
      amp.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }
    click() { this.tone(520, 0.06, 'triangle', 0.07, 700); }
    launch() { this.tone(210, 0.13, 'triangle', 0.1, 440); }
    coin() { this.tone(900, 0.09, 'sine', 0.11, 1320); }
    good() { this.tone(360, 0.08, 'triangle', 0.07, 480); }
    perfect() {
      this.tone(530, 0.12, 'triangle', 0.11, 780);
      setTimeout(() => this.tone(780, 0.08, 'sine', 0.07, 980), 40);
    }
    crash() { this.tone(115, 0.24, 'sawtooth', 0.14, 52); }
  }
  const audio = new ArcadeAudio();

  function haptic(pattern) {
    if (save.settings.vibration && navigator.vibrate) navigator.vibrate(pattern);
  }

  function endlessGround(px) {
    const difficulty = clamp((px - 1400) / 18000, 0, 1);
    const base = H * 0.69;
    const broad = Math.sin(px / 350) * (Math.min(74, H * 0.13) + 22 * difficulty);
    const medium = Math.sin(px / 165 + 1.2) * (Math.min(28, H * 0.055) + 13 * difficulty);
    const detail = Math.sin(px / 79 + 0.35) * (4 + 4 * difficulty);
    return base + broad + medium + detail;
  }

  function ground(px) {
    const top = H * 0.34;
    const valley = H * 0.83;
    const launch = H * 0.42;
    const settle = H * 0.64;

    if (px <= 140) return top;
    if (px < 520) return lerp(top, valley, smooth((px - 140) / 380));
    if (px < 910) return lerp(valley, launch, smooth((px - 520) / 390));
    if (px < 1190) return lerp(launch, settle, smooth((px - 910) / 280));
    if (px < 1620) return lerp(settle, endlessGround(px), smooth((px - 1190) / 430));
    return endlessGround(px);
  }

  function slope(px) {
    const epsilon = 1.6;
    return (ground(px + epsilon) - ground(px - epsilon)) / (epsilon * 2);
  }

  class CoinField {
    constructor() { this.items = []; this.next = 1320; }
    reset() {
      this.items = [];
      const firstStart = 735;
      const firstCount = 8;
      for (let i = 0; i < firstCount; i++) {
        const t = i / (firstCount - 1);
        const px = firstStart + i * 52;
        this.items.push({
          x: px,
          y: ground(px) - 62 - Math.sin(Math.PI * t) * Math.min(120, H * 0.18),
          taken: false,
          phase: i * 0.45
        });
      }
      this.next = 1320;
      this.ensure(2700);
    }
    ensure(target) {
      while (this.next < target) {
        const start = this.next;
        const count = 6 + Math.floor((start / 900) % 4);
        const spacing = 42;
        const arcHeight = 72 + 30 * Math.sin(start / 430);
        for (let i = 0; i < count; i++) {
          const t = i / (count - 1);
          const px = start + i * spacing;
          this.items.push({
            x: px,
            y: ground(px) - 48 - Math.sin(Math.PI * t) * arcHeight,
            taken: false,
            phase: Math.random() * TAU
          });
        }
        this.next += count * spacing + 290 + (Math.sin(start * 0.01) + 1) * 80;
      }
    }
  }

  class ParticleSystem {
    constructor() { this.items = []; }
    clear() { this.items.length = 0; }
    burst(px, py, color, count = 10, speed = 140) {
      if (!save.settings.motion) return;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * TAU;
        const velocity = speed * (0.45 + Math.random() * 0.75);
        this.items.push({
          x: px, y: py,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          life: 0.45 + Math.random() * 0.28,
          max: 0.7,
          size: 2 + Math.random() * 4,
          color
        });
      }
    }
    trail(px, py, vx, vy, color) {
      if (!save.settings.motion) return;
      this.items.push({
        x: px, y: py,
        vx: -vx * 0.04 + (Math.random() - 0.5) * 25,
        vy: -vy * 0.04 + (Math.random() - 0.5) * 25,
        life: 0.24,
        max: 0.24,
        size: 2 + Math.random() * 2,
        color
      });
    }
    update(dt) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const p = this.items[i];
        p.life -= dt;
        if (p.life <= 0) { this.items.splice(i, 1); continue; }
        p.vy += 280 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
  }

  const coins = new CoinField();
  const particles = new ParticleSystem();
  const START_X = 150;
  const G = {
    state: 'menu',
    menuReturn: 'main',
    held: false,
    score: 0,
    runCoins: 0,
    camera: 0,
    shake: 0,
    toastTimer: 0,
    stallTimer: 0,
    lastFrame: performance.now(),
    accumulator: 0,
    step: 1 / 120,
    player: {
      x: START_X,
      y: 0,
      vx: 310,
      vy: 0,
      radius: 20,
      drawRadius: 23,
      onGround: true,
      rotation: 0,
      airTime: 0
    }
  };

  function setGameplayVisible(visible) {
    U.hud.classList.toggle('active', visible);
    U.hud.setAttribute('aria-hidden', visible ? 'false' : 'true');
    U.pauseButton.style.display = visible && G.state === 'playing' ? 'block' : 'none';
    U.pauseButton.setAttribute('aria-hidden', visible && G.state === 'playing' ? 'false' : 'true');
  }

  function showSystemToast(message) {
    U.systemToast.textContent = message;
    U.systemToast.classList.add('show');
    clearTimeout(showSystemToast.timer);
    showSystemToast.timer = setTimeout(() => U.systemToast.classList.remove('show'), 1300);
  }

  function renderSettings() {
    U.soundToggle.classList.toggle('on', save.settings.sound);
    U.vibrationToggle.classList.toggle('on', save.settings.vibration);
    U.motionToggle.classList.toggle('on', save.settings.motion);
  }

  function renderStats() {
    U.statsBest.textContent = `${Math.floor(save.best)} m`;
    U.statsRuns.textContent = save.runs;
    U.statsCoins.textContent = save.lifetimeCoins;
    U.statsPerfects.textContent = save.perfects;
    U.statsSkins.textContent = `${save.owned.length} / ${SKINS.length}`;
  }

  function renderMenuData() {
    const skin = selectedSkin();
    U.walletCoins.textContent = save.wallet;
    U.shopWalletCoins.textContent = save.wallet;
    U.bestScore.textContent = `${Math.floor(save.best)} m`;
    U.selectedSkinName.textContent = skin.name;
    renderSettings();
    renderStats();
    renderShop();
  }

  function renderShop() {
    U.shopGrid.replaceChildren();
    for (const skin of SKINS) {
      const owned = save.owned.includes(skin.id);
      const equipped = save.skin === skin.id;
      const card = document.createElement('article');
      card.className = `shop-card${equipped ? ' selected' : ''}${owned ? '' : ' locked'}`;
      card.innerHTML = `
        <div class="skin-preview" style="--skin:${skin.color}"><span class="skin-ball"></span></div>
        <h3>${skin.name}</h3>
        <p>${skin.id === 'aqua' ? 'Original clean finish' : 'Cosmetic colorway'}</p>
        <button class="shop-action ${equipped ? 'equipped' : owned ? 'owned' : ''}" type="button" data-skin="${skin.id}">
          ${equipped ? 'EQUIPPED' : owned ? 'EQUIP' : `<img src="assets/coin.svg" alt="" />${skin.price}`}
        </button>`;
      U.shopGrid.append(card);
    }
  }

  function activateView(name) {
    document.querySelectorAll('.menu-view').forEach(view => {
      const active = view.dataset.view === name;
      view.classList.toggle('active', active);
      view.setAttribute('aria-hidden', active ? 'false' : 'true');
      if (active) view.querySelector('.menu-shell')?.scrollTo(0, 0);
    });
  }

  function openMenu(name = 'main', returnTo = 'main') {
    G.state = returnTo === 'pause' ? 'paused' : 'menu';
    G.menuReturn = returnTo;
    G.held = false;
    U.pauseOverlay.classList.remove('active');
    U.pauseOverlay.setAttribute('aria-hidden', 'true');
    U.gameOver.classList.remove('active');
    U.gameOver.setAttribute('aria-hidden', 'true');
    U.menuRoot.classList.add('active');
    activateView(name);
    setGameplayVisible(false);
    renderMenuData();
  }

  function closeMenusForPlay() {
    U.menuRoot.classList.remove('active');
    U.gameOver.classList.remove('active');
    U.pauseOverlay.classList.remove('active');
    U.gameOver.setAttribute('aria-hidden', 'true');
    U.pauseOverlay.setAttribute('aria-hidden', 'true');
  }

  function resetRun() {
    const p = G.player;
    p.x = START_X;
    p.y = ground(p.x) - p.radius;
    p.vx = 310;
    p.vy = slope(p.x) * p.vx;
    p.onGround = true;
    p.rotation = 0;
    p.airTime = 0;
    Object.assign(G, {
      score: 0,
      runCoins: 0,
      camera: 0,
      shake: 0,
      toastTimer: 0,
      stallTimer: 0,
      held: false,
      accumulator: 0
    });
    coins.reset();
    particles.clear();
    U.score.textContent = '0 m';
    U.runCoins.textContent = '0';
    U.landingToast.classList.remove('show');
  }

  function startRun() {
    audio.unlock();
    audio.click();
    resetRun();
    closeMenusForPlay();
    G.state = 'playing';
    G.lastFrame = performance.now();
    setGameplayVisible(true);
  }

  function bankRun() {
    save.wallet += G.runCoins;
    save.lifetimeCoins += G.runCoins;
    save.runs += 1;
    save.best = Math.max(save.best, Math.floor(G.score));
    persist();
  }

  function endRun(title, reason) {
    if (G.state !== 'playing') return;
    G.state = 'gameover';
    G.held = false;
    G.shake = save.settings.motion ? 10 : 0;
    particles.burst(G.player.x, G.player.y, '#ff5964', 18, 190);
    audio.crash();
    haptic([45, 35, 70]);
    bankRun();
    U.gameOverTitle.textContent = title;
    U.gameOverReason.textContent = reason;
    U.finalScore.textContent = `${Math.floor(G.score)} m`;
    U.finalBest.textContent = `${Math.floor(save.best)} m`;
    U.finalCoins.textContent = G.runCoins;
    setGameplayVisible(false);
    setTimeout(() => {
      U.gameOver.classList.add('active');
      U.gameOver.setAttribute('aria-hidden', 'false');
    }, 170);
  }

  function showLanding(text, color = '#fff') {
    U.landingToast.textContent = text;
    U.landingToast.style.color = color;
    U.landingToast.classList.add('show');
    G.toastTimer = 0.65;
  }

  function pauseGame() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    G.held = false;
    U.pauseOverlay.classList.add('active');
    U.pauseOverlay.setAttribute('aria-hidden', 'false');
    setGameplayVisible(false);
    audio.click();
  }

  function resumeGame() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    U.pauseOverlay.classList.remove('active');
    U.pauseOverlay.setAttribute('aria-hidden', 'true');
    U.menuRoot.classList.remove('active');
    G.lastFrame = performance.now();
    setGameplayVisible(true);
    audio.click();
  }

  function collectCoins() {
    const p = G.player;
    coins.ensure(p.x + W * 2.2);
    for (const coin of coins.items) {
      if (coin.taken) continue;
      const dx = coin.x - p.x;
      if (dx < -90) continue;
      if (dx > 95) break;
      const dy = coin.y - p.y;
      const hitRadius = p.radius + 12;
      if (dx * dx + dy * dy < hitRadius * hitRadius) {
        coin.taken = true;
        G.runCoins += 1;
        U.runCoins.textContent = G.runCoins;
        particles.burst(coin.x, coin.y, '#ffd33d', 9, 110);
        audio.coin();
        haptic(12);
      }
    }
  }

  function evaluateLanding(terrainAngle, tangentSpeed, impact) {
    const p = G.player;
    let difference = Math.abs(Math.atan2(p.vy, p.vx) - terrainAngle);
    while (difference > Math.PI) difference -= TAU;
    difference = Math.abs(difference);

    if (impact > 470 || difference > 0.86) {
      endRun('Hard landing', 'Match the direction of the dune before touching down.');
      return false;
    }
    if (difference < 0.2 && impact < 285) {
      p.vx = Math.max(260, tangentSpeed * (1.09 + clamp(p.airTime / 3.5, 0, 0.07)));
      save.perfects += 1;
      persist();
      showLanding('PERFECT', '#fff5a8');
      particles.burst(p.x, p.y + p.radius, '#fff', 12, 100);
      audio.perfect();
      haptic([10, 25, 10]);
    } else {
      p.vx = Math.max(225, tangentSpeed * 0.96);
      showLanding('GOOD');
      audio.good();
      haptic(10);
    }
    return true;
  }

  function update(dt) {
    const p = G.player;
    if (p.onGround) {
      const terrainSlope = slope(p.x);
      const angle = Math.atan2(terrainSlope, 1);
      const tx = Math.cos(angle);
      const ty = Math.sin(angle);
      let speed = Math.hypot(p.vx, p.vy);
      speed += (1020 * ty + (G.held ? Math.max(0, ty) * 560 : 0) - (8 + speed * 0.0025)) * dt;
      if (p.x < 1120) speed = Math.max(speed, 285);
      speed = clamp(speed, 0, 880);

      const releaseLaunch = !G.held && terrainSlope < -0.1 && speed > 220;
      const openingCrest = p.x > 820 && p.x < 990 && terrainSlope < -0.035 && slope(p.x + 24) > terrainSlope + 0.065;
      const naturalCrest = terrainSlope < -0.075 && slope(p.x + 20) > terrainSlope + 0.11;

      p.vx = tx * speed;
      p.vy = ty * speed;
      p.x += p.vx * dt;
      p.y = ground(p.x) - p.radius;
      p.rotation += speed / p.radius * dt;

      if ((releaseLaunch || openingCrest || naturalCrest) && ground(p.x + 10) - p.radius > p.y + p.vy * dt + 1.2) {
        p.onGround = false;
        p.airTime = 0;
        p.vy -= openingCrest ? 84 : releaseLaunch ? 48 : 22;
        audio.launch();
        haptic(8);
      }

      if (p.x > 1200 && terrainSlope < -0.08 && speed < 58) G.stallTimer += dt;
      else G.stallTimer = Math.max(0, G.stallTimer - dt * 2);

      if (speed <= 1 || p.vx <= 0) {
        endRun('Momentum lost', 'Carry more speed into the climb.');
        return;
      }
      if (G.stallTimer > 0.24) {
        endRun('Stalled', 'Dive deeper into the previous valley.');
        return;
      }
    } else {
      p.airTime += dt;
      p.vy += (G.held ? 1230 : 760) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.vx / p.radius * dt;

      const groundY = ground(p.x) - p.radius;
      if (p.y >= groundY) {
        const angle = Math.atan2(slope(p.x), 1);
        const tx = Math.cos(angle);
        const ty = Math.sin(angle);
        const tangentSpeed = Math.max(0, p.vx * tx + p.vy * ty);
        const impact = Math.abs(-p.vx * ty + p.vy * tx);
        p.y = groundY;
        p.onGround = true;
        if (!evaluateLanding(angle, tangentSpeed, impact)) return;
        p.vy = slope(p.x) * p.vx;
        p.airTime = 0;
      }

      if (p.vx <= 0) {
        endRun('Moving backward', 'Forward momentum is required.');
        return;
      }
    }

    const speedNow = Math.hypot(p.vx, p.vy);
    if (save.settings.motion && speedNow > 370 && Math.random() < 0.34) {
      particles.trail(p.x - p.radius * 0.8, p.y, p.vx, p.vy, selectedSkin().trail);
    }

    collectCoins();
    G.score = Math.max(G.score, (p.x - START_X) / 10);
    U.score.textContent = `${Math.floor(G.score)} m`;
    G.camera = lerp(G.camera, p.x - W * 0.27, 1 - Math.pow(0.001, dt));

    if (G.toastTimer > 0 && (G.toastTimer -= dt) <= 0) U.landingToast.classList.remove('show');
    particles.update(dt);
  }

  function drawSky() {
    if (assets.bg.complete && assets.bg.naturalWidth) {
      const ratio = assets.bg.naturalWidth / assets.bg.naturalHeight;
      const imageHeight = H;
      const imageWidth = imageHeight * ratio;
      const offset = -((G.camera * 0.08) % imageWidth);
      for (let px = offset - imageWidth; px < W + imageWidth; px += imageWidth) {
        ctx.drawImage(assets.bg, px, 0, imageWidth, imageHeight);
      }
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, '#00c8d1');
      gradient.addColorStop(0.58, '#bcefd9');
      gradient.addColorStop(1, '#f7efa3');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawTerrain(camera) {
    ctx.beginPath();
    ctx.moveTo(0, H + 40);
    for (let sx = -8; sx <= W + 8; sx += 7) ctx.lineTo(sx, ground(camera + sx));
    ctx.lineTo(W + 8, H + 40);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, H * 0.42, 0, H);
    gradient.addColorStop(0, '#58cbb7');
    gradient.addColorStop(1, '#109798');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    for (let sx = -8; sx <= W + 8; sx += 7) {
      const y = ground(camera + sx);
      if (sx === -8) ctx.moveTo(sx, y); else ctx.lineTo(sx, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.58)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function drawCoins(camera) {
    const time = performance.now() * 0.004;
    for (const coin of coins.items) {
      if (coin.taken) continue;
      const screenX = coin.x - camera;
      if (screenX < -34 || screenX > W + 34) continue;
      ctx.save();
      ctx.translate(screenX, coin.y + Math.sin(time + coin.phase) * 2.5);
      ctx.rotate(Math.sin(time * 0.7 + coin.phase) * 0.08);
      if (assets.coin.complete && assets.coin.naturalWidth) {
        const size = 30;
        ctx.shadowColor = 'rgba(255,190,0,.55)';
        ctx.shadowBlur = 12;
        ctx.drawImage(assets.coin, -size / 2, -size / 2, size, size);
      } else {
        ctx.fillStyle = '#ffd33d';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawParticles(camera) {
    for (const p of particles.items) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - camera, p.y, p.size * ctx.globalAlpha, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBall(camera) {
    const p = G.player;
    const skin = selectedSkin();
    ctx.save();
    ctx.translate(p.x - camera, p.y);
    ctx.rotate(p.rotation);
    ctx.shadowColor = skin.color;
    ctx.shadowBlur = save.settings.motion ? 13 : 6;
    if (assets.ball.complete && assets.ball.naturalWidth) {
      const size = p.drawRadius * 2;
      ctx.filter = `hue-rotate(${skin.hue}deg) saturate(1.12)`;
      ctx.drawImage(assets.ball, -size / 2, -size / 2, size, size);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, p.drawRadius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = skin.color;
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    drawSky();
    const shakeX = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    const shakeY = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    if (G.shake > 0) G.shake *= 0.88;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawTerrain(G.camera);
    drawCoins(G.camera);
    drawParticles(G.camera);
    drawBall(G.camera);
    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - G.lastFrame) / 1000));
    G.lastFrame = now;
    if (G.state === 'playing') {
      G.accumulator += dt;
      while (G.accumulator >= G.step) {
        update(G.step);
        G.accumulator -= G.step;
        if (G.state !== 'playing') break;
      }
    } else {
      particles.update(dt);
    }
    draw();
    requestAnimationFrame(loop);
  }

  function handleShopClick(event) {
    const button = event.target.closest('[data-skin]');
    if (!button) return;
    const skin = SKINS.find(item => item.id === button.dataset.skin);
    if (!skin) return;
    audio.click();
    if (save.owned.includes(skin.id)) {
      save.skin = skin.id;
      persist();
      renderMenuData();
      showSystemToast(`${skin.name} equipped`);
      return;
    }
    if (save.wallet < skin.price) {
      showSystemToast(`Need ${skin.price - save.wallet} more coins`);
      haptic(25);
      return;
    }
    save.wallet -= skin.price;
    save.owned.push(skin.id);
    save.skin = skin.id;
    persist();
    renderMenuData();
    showSystemToast(`${skin.name} unlocked`);
    haptic([12, 25, 12]);
  }

  document.querySelectorAll('[data-open-view]').forEach(button => {
    button.addEventListener('click', () => {
      audio.click();
      const target = button.dataset.openView;
      if (target === 'main' && G.menuReturn === 'pause') {
        U.menuRoot.classList.remove('active');
        U.pauseOverlay.classList.add('active');
        U.pauseOverlay.setAttribute('aria-hidden', 'false');
        G.menuReturn = 'main';
        return;
      }
      activateView(target);
      renderMenuData();
    });
  });

  document.querySelectorAll('[data-setting]').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.setting;
      save.settings[key] = !save.settings[key];
      persist();
      renderSettings();
      if (key !== 'sound' || save.settings.sound) audio.click();
      if (key === 'vibration' && save.settings.vibration) haptic(12);
    });
  });

  U.shopGrid.addEventListener('click', handleShopClick);
  U.resetDataButton.addEventListener('click', () => {
    if (!confirm('Reset all coins, records, skins, and settings?')) return;
    save = defaults();
    persist();
    renderMenuData();
    showSystemToast('Save data reset');
  });

  U.playButton.addEventListener('click', startRun);
  U.retryButton.addEventListener('click', startRun);
  U.resultShopButton.addEventListener('click', () => openMenu('shop', 'main'));
  U.menuButton.addEventListener('click', () => openMenu('main', 'main'));
  U.pauseButton.addEventListener('click', pauseGame);
  U.resumeButton.addEventListener('click', resumeGame);
  U.restartButton.addEventListener('click', startRun);
  U.pauseSettingsButton.addEventListener('click', () => openMenu('settings', 'pause'));
  U.pauseMenuButton.addEventListener('click', () => openMenu('main', 'main'));

  const pointerDown = event => {
    if (G.state !== 'playing') return;
    G.held = true;
    audio.unlock();
    event.preventDefault();
  };
  const pointerUp = event => {
    G.held = false;
    event?.preventDefault?.();
  };
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  addEventListener('pointerup', pointerUp, { passive: false });
  addEventListener('pointercancel', pointerUp, { passive: false });

  addEventListener('keydown', event => {
    if (event.code === 'Space') {
      event.preventDefault();
      if (G.state === 'menu' || G.state === 'gameover') startRun();
      else if (G.state === 'playing') G.held = true;
    }
    if (event.code === 'Escape') {
      if (G.state === 'playing') pauseGame();
      else if (G.state === 'paused') resumeGame();
    }
  });
  addEventListener('keyup', event => {
    if (event.code === 'Space') {
      event.preventDefault();
      G.held = false;
    }
  });

  renderMenuData();
  resetRun();
  openMenu('main', 'main');
  requestAnimationFrame(now => {
    G.lastFrame = now;
    requestAnimationFrame(loop);
  });

  window.__DRIFTLINE_DEBUG__ = {
    start: startRun,
    state: () => ({
      state: G.state,
      score: G.score,
      runCoins: G.runCoins,
      player: { ...G.player },
      save: JSON.parse(JSON.stringify(save))
    }),
    hold: value => { G.held = Boolean(value); }
  };
})();
