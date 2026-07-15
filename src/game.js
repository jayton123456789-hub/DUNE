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
    multiplier: $('multiplierValue'),
    speedLabel: $('speedLabel'),
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
  let G = null;
  let terrainField = null;
  function resize() {
    W = Math.max(280, Math.round(window.innerWidth));
    H = Math.max(320, Math.round(window.innerHeight));
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (terrainField) terrainField.reset();
    if (G?.player?.onGround) G.player.y = ground(G.player.x) - G.player.radius;
  }
  addEventListener('resize', resize, { passive: true });
  addEventListener('orientationchange', () => setTimeout(resize, 150), { passive: true });
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

  class TerrainField {
    constructor() {
      this.points = [];
      this.seed = 0x5f3759df;
      this.reset();
    }
    random() {
      this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
      return this.seed / 4294967296;
    }
    reset() {
      this.seed = 0x5f3759df;
      const high = H * 0.30;
      const low = H * 0.86;
      this.points = [
        { x: -300, y: high },
        { x: 140, y: high },
        { x: 560, y: low },
        { x: 980, y: H * 0.36 },
        { x: 1280, y: H * 0.68 },
        { x: 1560, y: H * 0.50 }
      ];
      this.generateTo(6000);
    }
    generateTo(targetX) {
      while (this.points[this.points.length - 1].x < targetX) {
        const last = this.points[this.points.length - 1];
        const previous = this.points[this.points.length - 2];
        const isValley = last.y > previous.y;
        const difficulty = clamp((last.x - 1500) / 22000, 0, 1);
        let width = lerp(220, 390, this.random());
        if (this.random() < 0.16) width += 150 + this.random() * 130;
        if (this.random() < 0.18) width -= 45;
        width = clamp(width, 185, 590);
        const high = H * lerp(0.43, 0.31, difficulty) + this.random() * H * 0.08;
        const low = H * lerp(0.77, 0.88, difficulty) - this.random() * H * 0.05;
        let y = isValley ? high : low;
        if (this.random() < 0.15) y = lerp(y, H * 0.62, 0.45);
        this.points.push({ x: last.x + width, y });
      }
    }
    segment(px) {
      this.generateTo(px + 2400);
      let lo = 0, hi = this.points.length - 2;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (px < this.points[mid].x) hi = mid - 1;
        else if (px > this.points[mid + 1].x) lo = mid + 1;
        else return mid;
      }
      return clamp(lo, 0, this.points.length - 2);
    }
    height(px) {
      const i = this.segment(px);
      const a = this.points[i], b = this.points[i + 1];
      const t = clamp((px - a.x) / (b.x - a.x), 0, 1);
      const eased = t * t * (3 - 2 * t);
      return lerp(a.y, b.y, eased);
    }
    slope(px) {
      const i = this.segment(px);
      const a = this.points[i], b = this.points[i + 1];
      const width = b.x - a.x;
      const t = clamp((px - a.x) / width, 0, 1);
      return (b.y - a.y) * (6 * t * (1 - t)) / width;
    }
  }

  terrainField = new TerrainField();
  const ground = px => terrainField.height(px);
  const slope = px => terrainField.slope(px);

  class CoinField {
    constructor() { this.items = []; this.next = 700; }
    reset() {
      this.items = [];
      this.next = 690;
      this.ensure(3200);
    }
    ensure(target) {
      while (this.next < target) {
        const start = this.next;
        const localSlope = slope(start);
        const count = 6 + Math.floor((start / 1000) % 4);
        const spacing = 46;
        const arcHeight = 84 + Math.min(120, Math.abs(localSlope) * 150) + 24 * Math.sin(start / 510);
        for (let i = 0; i < count; i++) {
          const t = i / Math.max(1, count - 1);
          const px = start + i * spacing;
          this.items.push({
            x: px,
            y: ground(px) - 56 - Math.sin(Math.PI * t) * arcHeight,
            taken: false,
            phase: (i * 0.73 + start * 0.001) % TAU
          });
        }
        this.next += count * spacing + 260 + ((Math.sin(start * 0.007) + 1) * 85);
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
  G = {
    state: 'menu',
    menuReturn: 'main',
    held: false,
    score: 0,
    runCoins: 0,
    cameraX: 0,
    cameraY: H * 0.62,
    zoom: 1,
    shake: 0,
    toastTimer: 0,
    stallTimer: 0,
    multiplier: 1,
    combo: 0,
    bonusScore: 0,
    speedBonus: 0,
    highestAltitude: 0,
    jumpStartY: 0,
    quipTier: 0,
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
    p.vx = 360;
    p.vy = slope(p.x) * p.vx;
    p.onGround = true;
    p.rotation = 0;
    p.airTime = 0;
    Object.assign(G, {
      score: 0,
      runCoins: 0,
      cameraX: 0,
      cameraY: H * 0.62,
      zoom: 1,
      shake: 0,
      toastTimer: 0,
      stallTimer: 0,
      multiplier: 1,
      combo: 0,
      bonusScore: 0,
      speedBonus: 0,
      highestAltitude: 0,
      jumpStartY: p.y,
      quipTier: 0,
      held: false,
      accumulator: 0
    });
    coins.reset();
    particles.clear();
    U.score.textContent = '0 m';
    U.runCoins.textContent = '0';
    U.landingToast.classList.remove('show');
    U.multiplier.textContent = '×1.0';
    U.speedLabel.textContent = 'CRUISE';
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

  function showLanding(text, color = '#fff', duration = 0.8) {
    U.landingToast.textContent = text;
    U.landingToast.style.color = color;
    U.landingToast.classList.add('show');
    G.toastTimer = duration;
  }

  function announceAirTier(altitude, speed) {
    let tier = 0;
    let text = '';
    if (altitude > H * 1.5) { tier = 5; text = 'TO THE STARS'; }
    else if (altitude > H * 0.9) { tier = 4; text = 'ORBITAL'; }
    else if (altitude > H * 0.55) { tier = 3; text = 'SKY HIGH'; }
    else if (altitude > H * 0.30) { tier = 2; text = 'BIG AIR'; }
    else if (altitude > H * 0.16) { tier = 1; text = 'NICE FLIGHT'; }
    if (speed > 780 && tier < 4) { tier = Math.max(tier, 3); text = 'HYPERSPEED'; }
    if (tier > G.quipTier) {
      G.quipTier = tier;
      showLanding(text, tier >= 4 ? '#d8e8ff' : '#fff5a8', 1.05);
      G.multiplier = clamp(G.multiplier + tier * 0.18, 1, 8);
      U.multiplier.textContent = `×${G.multiplier.toFixed(1)}`;
      audio.launch();
    }
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

    const altitudeTier = clamp(G.highestAltitude / Math.max(1, H * 0.25), 0, 5);
    const airTier = clamp(p.airTime / 1.2, 0, 4);
    if (impact > 640 || difference > 1.02) {
      endRun('Hard landing', 'Line up with the dune before impact.');
      return false;
    }

    if (difference < 0.23 && impact < 360) {
      G.combo += 1;
      G.multiplier = clamp(G.multiplier + 0.35 + airTier * 0.16 + altitudeTier * 0.12, 1, 8);
      const boost = 1.07 + clamp(p.airTime * 0.025, 0, 0.13) + clamp(G.highestAltitude / 3000, 0, 0.08);
      p.vx = Math.max(320, tangentSpeed * boost + 22 * G.combo);
      G.speedBonus += Math.round((p.airTime * 18 + G.highestAltitude * 0.025) * G.multiplier);
      save.perfects += 1;
      persist();
      showLanding(G.combo > 2 ? `PERFECT ×${G.combo}` : 'PERFECT', '#fff5a8', 0.9);
      particles.burst(p.x, p.y + p.radius, '#fff', 16, 125);
      audio.perfect();
      haptic([10, 22, 10]);
    } else if (difference < 0.55 && impact < 500) {
      G.combo = Math.max(0, G.combo - 1);
      G.multiplier = Math.max(1, G.multiplier * 0.88);
      p.vx = Math.max(270, tangentSpeed * 0.98);
      showLanding('SMOOTH', '#ffffff', 0.65);
      audio.good();
      haptic(10);
    } else {
      G.combo = 0;
      G.multiplier = 1;
      p.vx = Math.max(230, tangentSpeed * 0.82);
      showLanding('ROUGH', '#ffd7d7', 0.65);
      G.shake = save.settings.motion ? 5 : 0;
    }
    U.multiplier.textContent = `×${G.multiplier.toFixed(1)}`;
    return true;
  }

  function update(dt) {
    const p = G.player;
    const releaseGravity = 390;
    const diveGravity = 1160;

    if (p.onGround) {
      const terrainSlope = slope(p.x);
      const angle = Math.atan2(terrainSlope, 1);
      const tx = Math.cos(angle);
      const ty = Math.sin(angle);
      let speed = Math.max(0, p.vx * tx + p.vy * ty);
      const gravityAlong = 1080 * ty;
      const diveDrive = G.held ? Math.max(0, ty) * 620 : 0;
      const rollingDrag = 6 + speed * 0.0018;
      speed += (gravityAlong + diveDrive - rollingDrag) * dt;
      if (p.x < 1150) speed = Math.max(speed, 330);
      speed = clamp(speed, 0, 1220);

      p.vx = tx * speed;
      p.vy = ty * speed;
      const nextX = p.x + p.vx * dt;
      const freeY = p.y + p.vy * dt + 0.5 * releaseGravity * dt * dt;
      const nextSurface = ground(nextX) - p.radius;
      const separating = freeY < nextSurface - 0.7 && speed > 170;

      if (separating) {
        p.onGround = false;
        p.x = nextX;
        p.y = freeY;
        p.airTime = 0;
        G.jumpStartY = ground(p.x);
        G.highestAltitude = 0;
        G.quipTier = 0;
        p.vy -= clamp(speed * 0.045, 12, 62);
        audio.launch();
        haptic(8);
      } else {
        p.x = nextX;
        p.y = nextSurface;
        p.vx = Math.cos(Math.atan2(slope(p.x), 1)) * speed;
        p.vy = Math.sin(Math.atan2(slope(p.x), 1)) * speed;
      }
      p.rotation += speed / p.radius * dt;

      if (p.x > 1400 && terrainSlope < -0.10 && speed < 72) G.stallTimer += dt;
      else G.stallTimer = Math.max(0, G.stallTimer - dt * 2.4);
      if (speed <= 2 || p.vx <= 0) { endRun('Momentum lost', 'Dive deeper and carry speed into the climb.'); return; }
      if (G.stallTimer > 0.34) { endRun('Stalled', 'The previous valley did not give enough speed.'); return; }
    } else {
      p.airTime += dt;
      const gravity = G.held ? diveGravity : releaseGravity;
      p.vy += gravity * dt;
      p.vx *= Math.pow(G.held ? 0.9992 : 0.99975, dt * 120);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.vx / p.radius * dt;

      const altitude = Math.max(0, ground(p.x) - p.radius - p.y);
      G.highestAltitude = Math.max(G.highestAltitude, altitude);
      announceAirTier(altitude, Math.hypot(p.vx, p.vy));

      const groundY = ground(p.x) - p.radius;
      if (p.y >= groundY && p.vy > slope(p.x) * p.vx - 30) {
        const terrainAngle = Math.atan2(slope(p.x), 1);
        const tx = Math.cos(terrainAngle);
        const ty = Math.sin(terrainAngle);
        const tangentSpeed = Math.max(0, p.vx * tx + p.vy * ty);
        const impact = Math.abs(-p.vx * ty + p.vy * tx);
        p.y = groundY;
        p.onGround = true;
        if (!evaluateLanding(terrainAngle, tangentSpeed, impact)) return;
        const landedAngle = Math.atan2(slope(p.x), 1);
        const landedSpeed = Math.max(0, p.vx);
        p.vx = Math.cos(landedAngle) * landedSpeed;
        p.vy = Math.sin(landedAngle) * landedSpeed;
        p.airTime = 0;
        G.highestAltitude = 0;
        G.quipTier = 0;
      }
      if (p.vx <= 0) { endRun('Moving backward', 'Keep forward momentum at all times.'); return; }
    }

    const speedNow = Math.hypot(p.vx, p.vy);
    if (speedNow > 850) U.speedLabel.textContent = 'MAX VELOCITY';
    else if (speedNow > 650) U.speedLabel.textContent = 'BLAZING';
    else if (speedNow > 480) U.speedLabel.textContent = 'FAST';
    else if (speedNow > 330) U.speedLabel.textContent = 'CRUISE';
    else U.speedLabel.textContent = 'BUILD SPEED';

    if (save.settings.motion && speedNow > 390 && Math.random() < Math.min(0.72, speedNow / 1200)) {
      particles.trail(p.x - p.radius * 0.8, p.y, p.vx, p.vy, selectedSkin().trail);
    }

    collectCoins();
    G.bonusScore += Math.max(0, speedNow - 360) * dt * 0.004 * G.multiplier;
    G.score = Math.max(G.score, (p.x - START_X) / 10 + G.bonusScore);
    U.score.textContent = `${Math.floor(G.score)} m`;

    const altitude = Math.max(0, ground(p.x) - p.radius - p.y);
    const targetZoom = clamp(1 - Math.max(0, speedNow - 360) / 1800 - altitude / Math.max(900, H * 3.2), 0.42, 1);
    G.zoom = lerp(G.zoom, targetZoom, 1 - Math.pow(0.002, dt));
    const lookAhead = W * (0.25 + (1 - G.zoom) * 0.11) / G.zoom;
    G.cameraX = lerp(G.cameraX, p.x - lookAhead, 1 - Math.pow(0.0015, dt));
    const targetCameraY = lerp(ground(p.x), p.y, clamp(altitude / Math.max(1, H * 0.42), 0.18, 0.84));
    G.cameraY = lerp(G.cameraY, targetCameraY, 1 - Math.pow(0.004, dt));

    if (G.toastTimer > 0 && (G.toastTimer -= dt) <= 0) U.landingToast.classList.remove('show');
    particles.update(dt);
  }

  function drawSky() {
    const p = G.player;
    const altitude = Math.max(0, ground(p.x) - p.radius - p.y);
    const spaceMix = clamp((altitude - H * 0.55) / Math.max(1, H * 0.95), 0, 1);
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, spaceMix > 0 ? `rgb(${Math.round(lerp(0, 5, 1-spaceMix))},${Math.round(lerp(8, 200, 1-spaceMix))},${Math.round(lerp(25, 210, 1-spaceMix))})` : '#00c8d1');
    gradient.addColorStop(0.62, spaceMix > 0 ? '#12365c' : '#bcefd9');
    gradient.addColorStop(1, spaceMix > 0 ? '#2b6f80' : '#f7efa3');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    if (assets.bg.complete && assets.bg.naturalWidth && spaceMix < 0.92) {
      ctx.save();
      ctx.globalAlpha = 1 - spaceMix;
      const ratio = assets.bg.naturalWidth / assets.bg.naturalHeight;
      const imageHeight = H;
      const imageWidth = imageHeight * ratio;
      const offset = -((G.cameraX * 0.08) % imageWidth);
      for (let px = offset - imageWidth; px < W + imageWidth; px += imageWidth) ctx.drawImage(assets.bg, px, 0, imageWidth, imageHeight);
      ctx.restore();
    }

    if (spaceMix > 0.02) {
      ctx.save();
      ctx.globalAlpha = clamp(spaceMix * 1.3, 0, 1);
      for (let i = 0; i < 90; i++) {
        const sx = ((i * 193.7 - G.cameraX * (0.01 + (i % 4) * 0.004)) % (W + 80) + W + 80) % (W + 80) - 40;
        const sy = ((i * 83.3 + 27) % Math.max(120, H * 0.76));
        const r = 0.7 + (i % 5) * 0.28;
        ctx.fillStyle = i % 9 === 0 ? '#bde5ff' : '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawTerrain() {
    const left = G.cameraX - W * 0.35 / G.zoom;
    const right = G.cameraX + W * 1.15 / G.zoom;
    const bottom = G.cameraY + H * 0.85 / G.zoom;
    ctx.beginPath();
    ctx.moveTo(left, bottom + 200);
    for (let wx = left - 20; wx <= right + 20; wx += Math.max(5, 8 / G.zoom)) ctx.lineTo(wx, ground(wx));
    ctx.lineTo(right + 20, bottom + 200);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, G.cameraY - H / G.zoom, 0, bottom);
    gradient.addColorStop(0, '#58cbb7');
    gradient.addColorStop(1, '#109798');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    for (let wx = left - 20; wx <= right + 20; wx += Math.max(5, 8 / G.zoom)) {
      const y = ground(wx);
      if (wx <= left - 19) ctx.moveTo(wx, y); else ctx.lineTo(wx, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.62)';
    ctx.lineWidth = 3 / G.zoom;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function drawCoins() {
    const time = performance.now() * 0.004;
    const left = G.cameraX - W * 0.4 / G.zoom;
    const right = G.cameraX + W * 1.2 / G.zoom;
    for (const coin of coins.items) {
      if (coin.taken || coin.x < left || coin.x > right) continue;
      ctx.save();
      ctx.translate(coin.x, coin.y + Math.sin(time + coin.phase) * 2.5);
      ctx.rotate(Math.sin(time * 0.7 + coin.phase) * 0.08);
      const size = 30;
      ctx.shadowColor = 'rgba(255,190,0,.55)';
      ctx.shadowBlur = 12 / G.zoom;
      if (assets.coin.complete && assets.coin.naturalWidth) ctx.drawImage(assets.coin, -size / 2, -size / 2, size, size);
      else { ctx.fillStyle = '#ffd33d'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles.items) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * ctx.globalAlpha, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBall() {
    const p = G.player;
    const skin = selectedSkin();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.shadowColor = skin.color;
    ctx.shadowBlur = (save.settings.motion ? 13 : 6) / G.zoom;
    if (assets.ball.complete && assets.ball.naturalWidth) {
      const size = p.drawRadius * 2;
      ctx.filter = `hue-rotate(${skin.hue}deg) saturate(1.12)`;
      ctx.drawImage(assets.ball, -size / 2, -size / 2, size, size);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, p.drawRadius, 0, TAU); ctx.fill();
      ctx.strokeStyle = skin.color; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    drawSky();
    const shakeX = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    const shakeY = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    if (G.shake > 0) G.shake *= 0.88;
    ctx.save();
    ctx.translate(W * 0.28 + shakeX, H * 0.58 + shakeY);
    ctx.scale(G.zoom, G.zoom);
    ctx.translate(-G.cameraX, -G.cameraY);
    drawTerrain();
    drawCoins();
    drawParticles();
    drawBall();
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
