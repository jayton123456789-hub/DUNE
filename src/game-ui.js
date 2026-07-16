(function attachGameUI(root, factory) {
  root.DriftGameUI = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  'use strict';

  const $ = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const SAVE_KEY = 'driftline-save-v9';

  const SKINS = [
    { id: 'aqua', name: 'Aqua', price: 0, rarity: 'Starter', description: 'Balanced turquoise swoosh with a clean sea-glass trail.', primary: '#24cbd2', secondary: '#087c91', trail: '#76f3ef', burst: '#d9ffff', shell: '#f7ffff', pattern: 'aqua' },
    { id: 'coral', name: 'Coral Twin', price: 60, rarity: 'Common', description: 'Paired coral ribbons and a warm ember trail.', primary: '#ff6f77', secondary: '#ffae71', trail: '#ff9b78', burst: '#ffd2b8', shell: '#fff9f4', pattern: 'coral' },
    { id: 'sunset', name: 'Solar', price: 150, rarity: 'Common', description: 'A radiant sun core with a golden flare trail.', primary: '#ffc53d', secondary: '#ff7c52', trail: '#ffe27a', burst: '#fff0a9', shell: '#fffaf0', pattern: 'sunset' },
    { id: 'violet', name: 'Orbit', price: 350, rarity: 'Rare', description: 'Violet orbital rings with twin comet sparks.', primary: '#8c76ff', secondary: '#54d9ff', trail: '#aa9dff', burst: '#e4dfff', shell: '#f8f7ff', pattern: 'violet' },
    { id: 'lime', name: 'Volt', price: 700, rarity: 'Rare', description: 'Electric split-bolt decal and a sharp neon trail.', primary: '#9df45d', secondary: '#16a88d', trail: '#a9ff7a', burst: '#dfffc4', shell: '#f7fff2', pattern: 'lime' },
    { id: 'midnight', name: 'Eclipse', price: 1100, rarity: 'Epic', description: 'Midnight crescent with a cold starlight wake.', primary: '#17365e', secondary: '#69c9ff', trail: '#5eb8ff', burst: '#badfff', shell: '#eef7ff', pattern: 'midnight', glow: 'rgba(64,148,255,.5)' },
    { id: 'prism', name: 'Prism', price: 1800, rarity: 'Legendary', description: 'Five spectral lobes, rainbow wake, and prismatic landings.', primary: '#ff5d87', secondary: '#5bc8ff', trail: 'rainbow', burst: '#ffffff', shell: '#fffaff', pattern: 'prism', animated: true, glow: 'rgba(176,112,255,.68)' }
  ];

  const WORLDS = [
    {
      id: 'sunwake', name: 'Sunwake', level: 1, tagline: 'Bright horizons and honey-gold dunes.',
      skyTop: '#0abecb', skyBottom: '#9ce9d7', horizon: '#fff0b1', sun: '#fff2a2', sunX: 0.78, sunY: 0.22,
      far: '#65cdbc', mid: '#2eada7', sandTop: '#f8cf72', sandMid: '#efb654', sandDeep: '#c97a36', crest: '#fff4c8', ui: '#073441', accent: '#ff626d', star: '#ffffff'
    },
    {
      id: 'ember', name: 'Emberfall', level: 4, tagline: 'Rose skies, molten light, and copper sand.',
      skyTop: '#4e315f', skyBottom: '#e66c78', horizon: '#ffd095', sun: '#fff0b5', sunX: 0.73, sunY: 0.27,
      far: '#a34f69', mid: '#713c5d', sandTop: '#f1a45d', sandMid: '#d77646', sandDeep: '#8d3d3c', crest: '#ffe0a7', ui: '#351c37', accent: '#ffd05e', star: '#ffe9cd'
    },
    {
      id: 'midnight', name: 'Mooncurrent', level: 7, tagline: 'An indigo night lit by silver dunes.',
      skyTop: '#050b26', skyBottom: '#243c68', horizon: '#607ca0', sun: '#d8f3ff', sunX: 0.77, sunY: 0.2,
      far: '#263e67', mid: '#192d50', sandTop: '#91b9c5', sandMid: '#5d879a', sandDeep: '#294b64', crest: '#dffbff', ui: '#071426', accent: '#65e4e0', star: '#ffffff'
    }
  ];

  const MISSIONS = [
    { id: 'first-flight', title: 'First Flight', copy: 'Cross the score line once', metric: 'lineCrossings', target: 1, reward: 30 },
    { id: 'find-flow', title: 'Find Your Flow', copy: 'Bank 25 airborne flow points', metric: 'banked', target: 25, reward: 40 },
    { id: 'dune-runner', title: 'Dune Runner', copy: 'Travel 250 m in one run', metric: 'bestDistance', target: 250, reward: 50 },
    { id: 'pocket-change', title: 'Pocket Change', copy: 'Bank 20 coins', metric: 'lifetimeCoins', target: 20, reward: 60 },
    { id: 'butter-touch', title: 'Butter Touch', copy: 'Land smoothly 5 times', metric: 'smoothLandings', target: 5, reward: 75 },
    { id: 'repeat-flyer', title: 'Repeat Flyer', copy: 'Cross the score line 12 times', metric: 'lineCrossings', target: 12, reward: 100 },
    { id: 'long-haul', title: 'Long Haul', copy: 'Travel 1,000 m in one run', metric: 'bestDistance', target: 1000, reward: 140 },
    { id: 'career-flow', title: 'Career Flow', copy: 'Travel 10,000 m total', metric: 'careerDistance', target: 10000, reward: 220 }
  ];

  const ENDLESS_MISSION = Object.freeze({
    id: 'master-circuit',
    title: 'Master Circuit',
    copy: 'Bank 125 airborne flow points',
    metric: 'endlessFlow',
    target: 125,
    reward: 90,
    repeatable: true
  });

  const CHALLENGES = [
    { id: 'airborne', title: 'Airborne', copy: 'Cross the score line for the first time.', metric: 'lineCrossings', target: 1, reward: 20 },
    { id: 'distance-500', title: 'Beyond the Bend', copy: 'Reach 500 m in a single run.', metric: 'bestDistance', target: 500, reward: 55 },
    { id: 'smooth-10', title: 'Sand Whisperer', copy: 'Land smoothly 10 times across your career.', metric: 'smoothLandings', target: 10, reward: 90 },
    { id: 'chain-3', title: 'Butter Chain', copy: 'Reach a x3.0 landing multiplier.', metric: 'bestChain', target: 3, reward: 120 },
    { id: 'collector-100', title: 'Gilded Route', copy: 'Bank 100 coins.', metric: 'lifetimeCoins', target: 100, reward: 150 },
    { id: 'sky-500', title: 'Thin Air', copy: 'Climb 135 m above the ground.', metric: 'maxAltitudeMeters', target: 135, reward: 180 },
    { id: 'veteran-25', title: 'Curve Veteran', copy: 'Complete 25 runs.', metric: 'runs', target: 25, reward: 220 }
  ];

  function defaults() {
    return {
      version: 9,
      bestScore: 0,
      bestDistance: 0,
      wallet: 0,
      xp: 0,
      lifetimeCoins: 0,
      lifetimeBanked: 0,
      endlessFlow: 0,
      totalScore: 0,
      careerDistance: 0,
      runs: 0,
      perfects: 0,
      smoothLandings: 0,
      owned: ['aqua'],
      skin: 'aqua',
      world: 'sunwake',
      missionIndex: 0,
      achievements: {},
      tutorialSeen: false,
      settings: { sound: true, vibration: true, motion: true },
      records: {
        maxAltitude: 0,
        longestAir: 0,
        maxSpeed: 0,
        bestChain: 1,
        lineCrossings: 0,
        bestBank: 0,
        recoveries: 0
      },
      history: []
    };
  }

  function finite(value, fallback = 0, max = 1e9) {
    const number = Number(value);
    return Number.isFinite(number) ? clamp(number, 0, max) : fallback;
  }

  function normalizeHistory(history) {
    if (!Array.isArray(history)) return [];
    return history.slice(0, 10).map(entry => ({
      score: Math.floor(finite(entry?.score)),
      distance: Math.floor(finite(entry?.distance)),
      coins: Math.floor(finite(entry?.coins, 0, 100000)),
      perfects: Math.floor(finite(entry?.perfects, 0, 100000)),
      endedAt: typeof entry?.endedAt === 'string' ? entry.endedAt : ''
    }));
  }

  function normalizeSave(raw) {
    const base = defaults();
    const source = raw && typeof raw === 'object' ? raw : {};
    const owned = Array.isArray(source.owned) ? source.owned.filter(id => SKINS.some(skin => skin.id === id)) : [];
    const skin = SKINS.some(item => item.id === source.skin) && owned.includes(source.skin) ? source.skin : 'aqua';
    const world = WORLDS.some(item => item.id === source.world) ? source.world : 'sunwake';
    const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
    const records = source.records && typeof source.records === 'object' ? source.records : {};
    const achievements = source.achievements && typeof source.achievements === 'object' ? source.achievements : {};
    return {
      ...base,
      version: 9,
      bestScore: Math.floor(finite(source.bestScore ?? source.best)),
      bestDistance: finite(source.bestDistance ?? source.best),
      wallet: Math.floor(finite(source.wallet ?? source.coins)),
      xp: Math.floor(finite(source.xp ?? source.totalScore)),
      lifetimeCoins: Math.floor(finite(source.lifetimeCoins)),
      lifetimeBanked: Math.floor(finite(source.lifetimeBanked)),
      endlessFlow: Math.floor(finite(source.endlessFlow, 0, 1000000)),
      totalScore: Math.floor(finite(source.totalScore)),
      careerDistance: finite(source.careerDistance),
      runs: Math.floor(finite(source.runs, 0, 10000000)),
      perfects: Math.floor(finite(source.perfects, 0, 10000000)),
      smoothLandings: Math.floor(finite(source.smoothLandings ?? source.perfects, 0, 10000000)),
      owned: [...new Set(['aqua', ...owned])],
      skin,
      world,
      missionIndex: Math.floor(finite(source.missionIndex, 0, MISSIONS.length)),
      achievements: Object.fromEntries(CHALLENGES.map(item => [item.id, Boolean(achievements[item.id])])),
      tutorialSeen: Boolean(source.tutorialSeen),
      settings: {
        sound: settings.sound !== false,
        vibration: settings.vibration !== false,
        motion: settings.motion !== false
      },
      records: {
        maxAltitude: finite(records.maxAltitude),
        longestAir: finite(records.longestAir, 0, 100000),
        maxSpeed: finite(records.maxSpeed),
        bestChain: Math.max(1, finite(records.bestChain, 1, 10)),
        lineCrossings: Math.floor(finite(records.lineCrossings, 0, 10000000)),
        bestBank: Math.floor(finite(records.bestBank)),
        recoveries: Math.floor(finite(records.recoveries, 0, 10000000))
      },
      history: normalizeHistory(source.history)
    };
  }

  function loadSave() {
    const keys = [SAVE_KEY, 'driftline-save-v8', 'driftline-save-v7', 'driftline-save-v6', 'driftline-save-v5'];
    for (const key of keys) {
      try {
        const text = localStorage.getItem(key);
        if (text) return normalizeSave(JSON.parse(text));
      } catch (_) {}
    }
    return defaults();
  }

  function xpForLevel(level) {
    return level <= 1 ? 0 : Math.round(120 * Math.pow(level - 1, 1.45));
  }

  function levelForXp(xp) {
    let level = 1;
    while (level < 100 && xp >= xpForLevel(level + 1)) level += 1;
    return level;
  }

  function metricValue(save, metric) {
    if (metric === 'lineCrossings') return save.records.lineCrossings;
    if (metric === 'banked') return save.lifetimeBanked;
    if (metric === 'bestDistance') return save.bestDistance;
    if (metric === 'lifetimeCoins') return save.lifetimeCoins;
    if (metric === 'perfects') return save.perfects;
    if (metric === 'smoothLandings') return save.smoothLandings;
    if (metric === 'endlessFlow') return save.endlessFlow;
    if (metric === 'careerDistance') return save.careerDistance;
    if (metric === 'bestChain') return save.records.bestChain;
    if (metric === 'maxAltitudeMeters') return save.records.maxAltitude / 5;
    if (metric === 'runs') return save.runs;
    return 0;
  }

  class AudioBus {
    constructor(settings) {
      this.settings = settings;
      this.mode = 'menu';
      this.motion = { speed: 0, grounded: true, held: false };
    }

    unlock() {
      if (!this.settings().sound) return;
      try {
        if (!this.context) {
          const Context = window.AudioContext || window.webkitAudioContext;
          if (!Context) return;
          this.context = new Context();
          this.master = this.context.createGain();
          this.effects = this.context.createGain();
          this.ambience = this.context.createGain();
          this.master.gain.value = 0.72;
          this.effects.gain.value = 0.22;
          this.ambience.gain.value = 0;
          this.effects.connect(this.master);
          this.ambience.connect(this.master);
          this.master.connect(this.context.destination);
          this.startAmbience();
        }
        if (this.context.state === 'suspended') this.context.resume();
      } catch (_) {}
    }

    startAmbience() {
      const length = this.context.sampleRate * 2;
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      let previous = 0;
      for (let index = 0; index < length; index += 1) {
        const white = Math.random() * 2 - 1;
        previous = previous * 0.985 + white * 0.015;
        data[index] = previous * 2.4;
      }
      this.wind = this.context.createBufferSource();
      this.wind.buffer = buffer;
      this.wind.loop = true;
      this.windFilter = this.context.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 420;
      this.windFilter.Q.value = 0.45;
      this.wind.connect(this.windFilter);
      this.windFilter.connect(this.ambience);
      this.wind.start();
    }

    sync() {
      if (!this.context || !this.master) return;
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(this.settings().sound ? 0.72 : 0.0001, now + 0.08);
    }

    setMode(mode) {
      this.mode = mode;
      this.updateMotion(this.motion.speed, this.motion.grounded, this.motion.held);
    }

    updateMotion(speed = 0, grounded = true, held = false) {
      this.motion = { speed, grounded, held };
      if (!this.context || !this.ambience || !this.settings().sound) return;
      const now = this.context.currentTime;
      const playing = this.mode === 'playing';
      const normalized = clamp((speed - 180) / 1250, 0, 1);
      const gain = playing ? 0.018 + normalized * 0.085 + (held ? 0.01 : 0) : this.mode === 'menu' ? 0.012 : 0;
      this.ambience.gain.cancelScheduledValues(now);
      this.ambience.gain.linearRampToValueAtTime(gain, now + 0.12);
      this.windFilter.frequency.cancelScheduledValues(now);
      this.windFilter.frequency.linearRampToValueAtTime(260 + normalized * 1750 + (grounded ? 0 : 300), now + 0.12);
    }

    tone(start, end, duration = 0.1, type = 'sine', gain = 0.2, delay = 0) {
      if (!this.settings().sound) return;
      this.unlock();
      if (!this.context) return;
      const now = this.context.currentTime + delay;
      const oscillator = this.context.createOscillator();
      const amplifier = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(start, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, end), now + duration);
      amplifier.gain.setValueAtTime(0.0001, now);
      amplifier.gain.exponentialRampToValueAtTime(gain, now + Math.min(0.018, duration * 0.2));
      amplifier.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(amplifier);
      amplifier.connect(this.effects);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.04);
    }

    noise(duration = 0.08, gain = 0.12, cutoff = 900, delay = 0) {
      if (!this.settings().sound) return;
      this.unlock();
      if (!this.context) return;
      const samples = Math.max(1, Math.floor(this.context.sampleRate * duration));
      const buffer = this.context.createBuffer(1, samples, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < samples; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / samples);
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const amplifier = this.context.createGain();
      const now = this.context.currentTime + delay;
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      amplifier.gain.setValueAtTime(gain, now);
      amplifier.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(amplifier);
      amplifier.connect(this.effects);
      source.start(now);
    }

    click() { this.tone(520, 760, 0.045, 'triangle', 0.14); }
    launch() { this.noise(0.11, 0.08, 1200); this.tone(170, 470, 0.16, 'triangle', 0.19); }
    line() { this.tone(640, 940, 0.09, 'triangle', 0.18); this.tone(940, 1260, 0.12, 'sine', 0.12, 0.045); }
    tier(tier) { this.tone(760 + tier * 120, 1020 + tier * 150, 0.1, 'sine', 0.13); }
    bank(amount) { const strength = clamp(0.12 + amount / 500, 0.12, 0.24); this.tone(410, 630, 0.12, 'triangle', strength); this.tone(630, 890, 0.15, 'triangle', strength * 0.72, 0.05); }
    land(grade) {
      if (grade === 'perfect') {
        this.noise(0.08, 0.08, 1600);
        this.tone(490, 790, 0.11, 'triangle', 0.2);
        this.tone(790, 1080, 0.13, 'sine', 0.13, 0.045);
      } else if (grade === 'recovery') {
        this.noise(0.14, 0.16, 520);
        this.tone(155, 105, 0.13, 'triangle', 0.14);
      } else {
        this.noise(grade === 'good' ? 0.07 : 0.12, grade === 'good' ? 0.07 : 0.13, grade === 'good' ? 1100 : 620);
        this.tone(grade === 'good' ? 340 : 145, grade === 'good' ? 490 : 82, 0.1, 'triangle', 0.13);
      }
    }
    lost() { this.tone(220, 88, 0.17, 'sawtooth', 0.12); }
    crash() { this.noise(0.24, 0.2, 430); this.tone(105, 42, 0.28, 'sawtooth', 0.2); }
    coin() { this.tone(840, 1320, 0.075, 'sine', 0.17); this.tone(1260, 1680, 0.06, 'triangle', 0.08, 0.025); }
    reward() { this.tone(520, 760, 0.11, 'triangle', 0.16); this.tone(760, 1050, 0.13, 'triangle', 0.15, 0.07); this.tone(1050, 1420, 0.16, 'sine', 0.12, 0.14); }
    newBest() { this.reward(); this.tone(720, 1540, 0.28, 'sine', 0.08, 0.24); }
  }

  function create() {
    const U = {
      gameCanvas: $('game'), hud: $('hud'), score: $('scoreValue'), distance: $('distanceValue'), pending: $('pendingScore'), runCoins: $('runCoins'),
      toast: $('landingToast'), multiplier: $('multiplierValue'), speed: $('speedLabel'), altitude: $('altitudeLabel'), pause: $('pauseButton'),
      coach: $('coachHint'), coachTitle: $('coachTitle'), coachCopy: $('coachCopy'), bestMarker: $('bestMarkerLabel'),
      menu: $('menuRoot'), splash: $('splashIntro'), splashSkip: $('skipIntro'), splashLogo: $('splashLogo'),
      wallet: $('walletCoins'), garageWallet: $('garageWalletCoins'), bestScore: $('bestScore'), bestDistance: $('bestDistance'),
      selectedSkinName: $('selectedSkinName'), play: $('playButton'), level: $('levelValue'), levelBar: $('levelProgressBar'), goalKicker: $('goalKicker'),
      currentGoal: $('currentGoal'), currentGoalCopy: $('currentGoalCopy'), currentGoalReward: $('currentGoalReward'), goalBar: $('goalProgressBar'),
      garage: $('garageGrid'), equippedCanvas: $('equippedBallCanvas'), equippedName: $('equippedSkinName'), equippedCopy: $('equippedSkinCopy'),
      worlds: $('worldGrid'), challenges: $('challengeList'), recentRuns: $('recentRunsList'),
      sound: $('soundToggle'), vibration: $('vibrationToggle'), motion: $('motionToggle'), reset: $('resetDataButton'),
      recordScore: $('recordScore'), recordDistance: $('recordDistance'), recordAltitude: $('recordAltitude'), recordAir: $('recordAir'),
      recordSpeed: $('recordSpeed'), recordChain: $('recordChain'), recordRuns: $('recordRuns'), recordCoins: $('recordCoins'),
      recordPerfects: $('recordPerfects'), recordCrossings: $('recordCrossings'),
      over: $('gameOverScreen'), overTitle: $('gameOverTitle'), overReason: $('gameOverReason'), newBest: $('newBestBadge'),
      finalScore: $('finalScore'), finalDistance: $('finalDistance'), finalBest: $('finalBest'), finalCoins: $('finalCoins'),
      finalPerfects: $('finalPerfects'), finalDelta: $('finalDelta'), resultLevel: $('resultLevelLabel'), resultXp: $('resultXpLabel'),
      resultXpBar: $('resultXpBar'), resultMissionTitle: $('resultMissionTitle'), resultMissionProgress: $('resultMissionProgress'), resultUnlock: $('resultUnlockText'),
      retry: $('retryButton'), resultGarage: $('resultGarageButton'), main: $('menuButton'),
      pauseOverlay: $('pauseOverlay'), pauseSummary: $('pauseRunSummary'), resume: $('resumeButton'), restart: $('restartButton'), pauseMenu: $('pauseMenuButton'),
      confirm: $('confirmOverlay'), confirmTitle: $('confirmTitle'), confirmCopy: $('confirmCopy'), confirmCancel: $('confirmCancel'), confirmAccept: $('confirmAccept'),
      system: $('toastMessage')
    };

    let save = loadSave();
    let previousFocus = null;
    let pausePreviousFocus = null;
    let confirmAction = null;
    let confirmSource = null;
    const audio = new AudioBus(() => save.settings);

    const persist = () => {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {}
    };
    const selectedSkin = () => SKINS.find(skin => skin.id === save.skin) || SKINS[0];
    const selectedWorld = () => WORLDS.find(world => world.id === save.world) || WORLDS[0];
    const playerLevel = () => levelForXp(save.xp);
    const currentMission = () => save.missionIndex >= MISSIONS.length ? ENDLESS_MISSION : MISSIONS[save.missionIndex];
    const missionProgress = mission => Math.min(metricValue(save, mission.metric), mission.target);
    const haptic = pattern => { if (save.settings.vibration && navigator.vibrate) navigator.vibrate(pattern); };

    function sizePreviewCanvas(canvas, logicalWidth, logicalHeight) {
      const rect = canvas.getBoundingClientRect();
      const cssWidth = rect.width > 1 ? rect.width : logicalWidth;
      const cssHeight = rect.height > 1 ? rect.height : cssWidth * logicalHeight / logicalWidth;
      const dpr = clamp(Number(globalThis.devicePixelRatio) || 1, 1, 3);
      const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
      const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      return canvas.getContext('2d');
    }

    function setOverlay(element, visible) {
      element.classList.toggle('active', visible);
      element.setAttribute('aria-hidden', visible ? 'false' : 'true');
      if ('inert' in element) element.inert = !visible;
    }

    function blockLayer(element, blocked) {
      if (!element) return;
      element.setAttribute('aria-hidden', blocked ? 'true' : 'false');
      if ('inert' in element) element.inert = blocked;
    }

    function trapFocus(event, overlay) {
      if (event.key !== 'Tab' || !overlay?.classList.contains('active')) return false;
      const focusable = [...overlay.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && element.getClientRects().length > 0);
      if (!focusable.length) return false;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
        return true;
      }
      if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
        return true;
      }
      if (!overlay.contains(document.activeElement)) {
        (event.shiftKey ? last : first).focus();
        event.preventDefault();
        return true;
      }
      return false;
    }

    function quip(message, color = '#fff', duration = 850) {
      U.toast.textContent = message;
      U.toast.style.color = color;
      U.toast.classList.add('show');
      clearTimeout(quip.timer);
      quip.timer = setTimeout(() => U.toast.classList.remove('show'), duration);
    }

    function systemToast(message, reward = false) {
      U.system.textContent = message;
      U.system.classList.toggle('reward', reward);
      U.system.classList.add('show');
      clearTimeout(systemToast.timer);
      systemToast.timer = setTimeout(() => U.system.classList.remove('show'), 1750);
    }

    function gameplayVisible(visible, mode) {
      U.hud.classList.toggle('active', visible);
      const gameplayAccessible = visible && mode === 'playing';
      U.hud.setAttribute('aria-hidden', gameplayAccessible ? 'false' : 'true');
      if ('inert' in U.hud) U.hud.inert = !gameplayAccessible;
      U.gameCanvas?.setAttribute('aria-hidden', gameplayAccessible ? 'false' : 'true');
      const pauseVisible = visible && mode === 'playing';
      U.pause.style.display = pauseVisible ? 'grid' : 'none';
      U.pause.setAttribute('aria-hidden', pauseVisible ? 'false' : 'true');
    }

    function showCoach(title, copy, pressed = false) {
      U.coachTitle.textContent = title;
      U.coachCopy.textContent = copy;
      U.coach.classList.toggle('pressed', pressed);
      U.coach.classList.add('show');
      U.coach.setAttribute('aria-hidden', 'false');
    }

    function hideCoach(permanent = false) {
      U.coach.classList.remove('show', 'pressed');
      U.coach.setAttribute('aria-hidden', 'true');
      if (permanent && !save.tutorialSeen) {
        save.tutorialSeen = true;
        persist();
      }
    }

    function renderSettings() {
      for (const [key, element] of [['sound', U.sound], ['vibration', U.vibration], ['motion', U.motion]]) {
        element.classList.toggle('on', save.settings[key]);
        const button = element.closest('[data-setting]');
        button?.setAttribute('aria-checked', save.settings[key] ? 'true' : 'false');
      }
      document.documentElement.classList.toggle('effects-off', !save.settings.motion);
      audio.sync();
    }

    function drawEquippedPreview() {
      const canvas = U.equippedCanvas;
      if (!canvas || !globalThis.DriftArt) return;
      sizePreviewCanvas(canvas, 420, 130);
      globalThis.DriftArt.drawWorldPreview(canvas, selectedWorld());
      const context = canvas.getContext('2d');
      const skin = selectedSkin();
      context.save();
      context.setTransform(canvas.width / 420, 0, 0, canvas.height / 130, 0, 0);
      context.strokeStyle = skin.trail === 'rainbow' ? '#ffffff' : skin.trail;
      context.globalAlpha = 0.7;
      context.lineWidth = 8;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(36, 106);
      context.bezierCurveTo(108, 96, 148, 60, 208, 64);
      context.stroke();
      globalThis.DriftArt.drawBall(context, { x: 237, y: 64, radius: 32, rotation: -0.42, skin, time: performance.now() });
      context.restore();
      U.equippedName.textContent = skin.name;
      U.equippedCopy.textContent = skin.description;
    }

    function renderGarage() {
      U.garage.replaceChildren();
      for (const skin of SKINS) {
        const owned = save.owned.includes(skin.id);
        const equipped = save.skin === skin.id;
        const card = document.createElement('article');
        card.className = `garage-card${equipped ? ' selected' : ''}${owned ? '' : ' locked'}${skin.animated ? ' legendary' : ''}`;
        const actionLabel = equipped ? `${skin.name}, equipped` : owned ? `Equip ${skin.name}` : `Buy ${skin.name} for ${skin.price.toLocaleString()} coins`;
        card.innerHTML = `<canvas class="garage-preview" width="340" height="110" aria-label="${skin.name} preview"></canvas>
          <div class="garage-copy"><small>${skin.rarity}</small><h3>${skin.name}</h3><p>${skin.description}</p></div>
          <button class="garage-action" type="button" data-skin="${skin.id}" aria-label="${actionLabel}" aria-pressed="${equipped}">${equipped ? '<svg><use href="#i-check"></use></svg>EQUIPPED' : owned ? 'EQUIP' : `<img src="assets/coin.svg" alt="">${skin.price.toLocaleString()}`}</button>`;
        U.garage.append(card);
        const canvas = card.querySelector('canvas');
        const context = sizePreviewCanvas(canvas, 340, 110);
        context.setTransform(canvas.width / 340, 0, 0, canvas.height / 110, 0, 0);
        const gradient = context.createLinearGradient(0, 0, 340, 110);
        gradient.addColorStop(0, 'rgba(37,207,213,.34)');
        gradient.addColorStop(1, 'rgba(255,216,126,.22)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 340, 110);
        context.strokeStyle = skin.trail === 'rainbow' ? '#d8ecff' : skin.trail;
        context.globalAlpha = 0.55;
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(25, 76);
        context.quadraticCurveTo(108, 27, 192, 58);
        context.stroke();
        context.globalAlpha = 1;
        globalThis.DriftArt?.drawBall(context, { x: 214, y: 55, radius: 30, rotation: -0.35, skin, time: performance.now() });
      }
      drawEquippedPreview();
    }

    function renderWorlds() {
      U.worlds.replaceChildren();
      const level = playerLevel();
      for (const world of WORLDS) {
        const unlocked = level >= world.level;
        const equipped = save.world === world.id;
        const card = document.createElement('article');
        card.className = `world-card${equipped ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
        const actionLabel = equipped ? `${world.name}, equipped` : unlocked ? `Equip ${world.name}` : `${world.name}, unlocks at level ${world.level}`;
        card.innerHTML = `<canvas width="360" height="160" aria-label="${world.name} world preview"></canvas>
          <div><small>${equipped ? 'EQUIPPED' : unlocked ? 'AVAILABLE' : `UNLOCKS AT LEVEL ${world.level}`}</small><h3>${world.name}</h3><p>${world.tagline}</p></div>
          <button type="button" data-world="${world.id}" aria-label="${actionLabel}" aria-pressed="${equipped}" ${unlocked ? '' : 'disabled'}>${equipped ? '<svg><use href="#i-check"></use></svg>EQUIPPED' : unlocked ? 'EQUIP WORLD' : '<svg><use href="#i-lock"></use></svg>LOCKED'}</button>`;
        U.worlds.append(card);
        const canvas = card.querySelector('canvas');
        sizePreviewCanvas(canvas, 360, 160);
        globalThis.DriftArt?.drawWorldPreview(canvas, world);
      }
    }

    function renderChallenges() {
      U.challenges.replaceChildren();
      CHALLENGES.forEach((challenge, index) => {
        const progress = Math.min(metricValue(save, challenge.metric), challenge.target);
        const complete = Boolean(save.achievements[challenge.id]);
        const ratio = clamp(progress / challenge.target, 0, 1);
        const article = document.createElement('article');
        article.className = `challenge-card${complete ? ' complete' : ''}`;
        article.innerHTML = `<span>${String(index + 1).padStart(2, '0')}</span><div><small>${complete ? 'COMPLETED' : 'CAREER CHALLENGE'}</small><h3>${challenge.title}</h3><p>${challenge.copy}</p><i><b style="width:${ratio * 100}%"></b></i></div><div class="challenge-reward"><strong>${Math.floor(progress)} / ${challenge.target}</strong><em><img src="assets/coin.svg" alt="">${challenge.reward}</em>${complete ? '<svg><use href="#i-check"></use></svg>' : ''}</div>`;
        U.challenges.append(article);
      });
    }

    function renderRecentRuns() {
      U.recentRuns.replaceChildren();
      if (!save.history.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-runs';
        empty.textContent = 'Your last ten runs will appear here.';
        U.recentRuns.append(empty);
        return;
      }
      save.history.forEach((entry, index) => {
        const item = document.createElement('article');
        item.innerHTML = `<span>#${index + 1}</span><div><strong>${entry.distance.toLocaleString()} m</strong><small>${entry.score.toLocaleString()} flow</small></div><b><img src="assets/coin.svg" alt="">${entry.coins}</b>`;
        U.recentRuns.append(item);
      });
    }

    function render() {
      const skin = selectedSkin();
      const level = playerLevel();
      const nextXp = xpForLevel(level + 1);
      const currentXp = xpForLevel(level);
      const levelRatio = clamp((save.xp - currentXp) / Math.max(1, nextXp - currentXp), 0, 1);
      const mission = currentMission();
      const progress = missionProgress(mission);
      U.wallet.textContent = U.garageWallet.textContent = save.wallet.toLocaleString();
      U.wallet.parentElement?.setAttribute('aria-label', `${save.wallet.toLocaleString()} coins`);
      U.garageWallet.parentElement?.setAttribute('aria-label', `${save.wallet.toLocaleString()} coins`);
      U.bestScore.textContent = save.bestScore.toLocaleString();
      U.bestDistance.textContent = `${Math.floor(save.bestDistance).toLocaleString()} m`;
      U.selectedSkinName.textContent = skin.name;
      U.level.textContent = level;
      U.levelBar.style.width = `${levelRatio * 100}%`;
      U.levelBar.parentElement?.setAttribute('aria-valuenow', String(Math.round(levelRatio * 100)));
      U.goalKicker.textContent = mission.repeatable ? 'REPEATABLE OBJECTIVE' : 'NEXT OBJECTIVE';
      U.currentGoal.textContent = mission.title;
      U.currentGoalCopy.textContent = `${mission.copy} (${Math.floor(progress)} / ${mission.target})`;
      U.currentGoalReward.innerHTML = `<img src="assets/coin.svg" alt="">${mission.reward}`;
      U.currentGoalReward.setAttribute('aria-label', `${mission.reward} coin reward`);
      U.goalBar.style.width = `${clamp(progress / mission.target, 0, 1) * 100}%`;
      U.goalBar.parentElement?.setAttribute('aria-valuenow', String(Math.round(clamp(progress / mission.target, 0, 1) * 100)));
      U.recordScore.textContent = save.bestScore.toLocaleString();
      U.recordDistance.textContent = `${Math.floor(save.bestDistance).toLocaleString()} m`;
      U.recordAltitude.textContent = `${Math.floor(save.records.maxAltitude / 5).toLocaleString()} m`;
      U.recordAir.textContent = `${save.records.longestAir.toFixed(2)} s`;
      U.recordSpeed.textContent = `${Math.floor(save.records.maxSpeed * 0.34).toLocaleString()} km/h`;
      U.recordChain.textContent = `\u00d7${Math.max(1, save.records.bestChain).toFixed(1)}`;
      U.recordRuns.textContent = save.runs.toLocaleString();
      U.recordCoins.textContent = save.lifetimeCoins.toLocaleString();
      U.recordPerfects.textContent = save.perfects.toLocaleString();
      U.recordCrossings.textContent = save.records.lineCrossings.toLocaleString();
      renderSettings();
      renderGarage();
      renderWorlds();
      renderChallenges();
      renderRecentRuns();
    }

    function activateView(name) {
      document.querySelectorAll('.menu-view').forEach(view => {
        const active = view.dataset.view === name;
        view.classList.toggle('active', active);
        view.hidden = !active;
        view.setAttribute('aria-hidden', active ? 'false' : 'true');
        if ('inert' in view) view.inert = !active;
      });
      document.querySelectorAll('[data-nav-view]').forEach(button => button.classList.toggle('active', button.dataset.navView === name));
      const activeView = document.querySelector(`.menu-view[data-view="${name}"]`);
      requestAnimationFrame(() => activeView?.querySelector('button')?.focus({ preventScroll: true }));
    }

    function openMenu(name = 'main') {
      setOverlay(U.pauseOverlay, false);
      setOverlay(U.over, false);
      setOverlay(U.confirm, false);
      setOverlay(U.menu, true);
      activateView(name);
      render();
      audio.setMode('menu');
    }

    function closeOverlays() {
      setOverlay(U.menu, false);
      setOverlay(U.over, false);
      setOverlay(U.pauseOverlay, false);
      setOverlay(U.confirm, false);
    }

    function updateHud({ score, distance, pending, multiplier, coins, speed, altitude, aboveLine }) {
      U.score.textContent = Math.floor(score).toLocaleString();
      U.distance.textContent = `${Math.floor(distance).toLocaleString()} m`;
      U.pending.textContent = pending > 0 ? `+${pending}` : '0';
      U.pending.classList.toggle('hot', pending > 0);
      U.multiplier.textContent = `\u00d7${multiplier.toFixed(1)}`;
      U.speed.textContent = speed > 1350 ? 'MAX VELOCITY' : speed > 1050 ? 'HYPERSPEED' : speed > 780 ? 'BLAZING' : speed > 560 ? 'FAST' : 'CRUISE';
      U.altitude.textContent = aboveLine ? `${Math.round(altitude)} ABOVE LINE` : altitude > 6 ? `${Math.round(altitude)} ALTITUDE` : `${Math.round(speed * 0.34)} KM/H`;
      U.runCoins.textContent = coins;
    }

    function unlockChallenges() {
      const unlocked = [];
      for (const challenge of CHALLENGES) {
        if (save.achievements[challenge.id]) continue;
        if (metricValue(save, challenge.metric) >= challenge.target) {
          save.achievements[challenge.id] = true;
          save.wallet += challenge.reward;
          unlocked.push(challenge);
        }
      }
      return unlocked;
    }

    function claimMission() {
      if (save.missionIndex >= MISSIONS.length) {
        if (save.endlessFlow < ENDLESS_MISSION.target) return null;
        save.endlessFlow -= ENDLESS_MISSION.target;
        save.wallet += ENDLESS_MISSION.reward;
        return ENDLESS_MISSION;
      }
      const mission = MISSIONS[save.missionIndex];
      if (metricValue(save, mission.metric) < mission.target) return null;
      save.wallet += mission.reward;
      save.missionIndex = Math.min(MISSIONS.length, save.missionIndex + 1);
      return mission;
    }

    function bankRun({ score, distance, coins, metrics }) {
      const previousBestScore = save.bestScore;
      const previousBestDistance = save.bestDistance;
      const levelBefore = playerLevel();
      const bankedFlow = Math.max(0, metrics.bankedFlow || 0);
      const smoothLandings = Math.max(0, metrics.smoothLandings || metrics.perfects || 0);
      const xpGained = Math.max(1, Math.floor(
        distance * 0.05
        + bankedFlow * 1.1
        + coins * 4
        + smoothLandings * 8
        + (metrics.perfects || 0) * 5
        + (metrics.lineCrossings || 0) * 10
      ));
      save.wallet += coins;
      save.lifetimeCoins += coins;
      save.lifetimeBanked += bankedFlow;
      // Repeatable progress starts only after the authored mission track is
      // complete; otherwise a lifetime stockpile could be cashed repeatedly
      // by ending empty runs after the finale.
      if (save.missionIndex >= MISSIONS.length) save.endlessFlow += bankedFlow;
      save.totalScore += Math.floor(score);
      save.careerDistance += Math.floor(distance);
      save.runs += 1;
      save.perfects += metrics.perfects || 0;
      save.smoothLandings += smoothLandings;
      save.xp += xpGained;
      save.bestScore = Math.max(save.bestScore, Math.floor(score));
      save.bestDistance = Math.max(save.bestDistance, Math.floor(distance));
      save.records.maxAltitude = Math.max(save.records.maxAltitude, metrics.maxAltitude || 0);
      save.records.longestAir = Math.max(save.records.longestAir, metrics.longestAir || 0);
      save.records.maxSpeed = Math.max(save.records.maxSpeed, metrics.maxSpeed || 0);
      save.records.bestChain = Math.max(save.records.bestChain, metrics.bestMultiplier || 1);
      save.records.lineCrossings += metrics.lineCrossings || 0;
      save.records.bestBank = Math.max(save.records.bestBank, metrics.bestBank || 0);
      save.records.recoveries += metrics.recoveries || 0;
      save.history.unshift({ score: Math.floor(score), distance: Math.floor(distance), coins, perfects: smoothLandings, endedAt: new Date().toISOString() });
      save.history = save.history.slice(0, 10);
      const mission = claimMission();
      const achievements = unlockChallenges();
      const levelAfter = playerLevel();
      const worldsUnlocked = WORLDS.filter(world => world.level > levelBefore && world.level <= levelAfter);
      persist();
      render();
      return {
        previousBestScore,
        previousBestDistance,
        newBestScore: save.bestScore > previousBestScore,
        newBestDistance: save.bestDistance > previousBestDistance,
        xpGained,
        levelBefore,
        levelAfter,
        mission,
        achievements,
        worldsUnlocked
      };
    }

    function showGameOver({ title, reason, score, distance, coins, metrics, result }) {
      U.overTitle.textContent = title;
      U.overReason.textContent = reason;
      U.finalScore.textContent = Math.floor(score).toLocaleString();
      U.finalDistance.textContent = `${Math.floor(distance).toLocaleString()} m`;
      U.finalBest.textContent = save.bestScore.toLocaleString();
      U.finalCoins.textContent = coins;
      U.finalPerfects.textContent = metrics.smoothLandings || metrics.perfects || 0;
      const isBest = result.newBestScore || result.newBestDistance;
      U.newBest.hidden = !isBest;
      U.finalDelta.textContent = result.newBestScore && result.previousBestScore > 0 ? `+${Math.floor(score - result.previousBestScore).toLocaleString()} over your previous best` : result.newBestDistance ? 'Longest run yet' : '';
      U.resultLevel.textContent = `LEVEL ${result.levelAfter}`;
      U.resultXp.textContent = `+${result.xpGained.toLocaleString()} XP`;
      const start = xpForLevel(result.levelAfter);
      const end = xpForLevel(result.levelAfter + 1);
      const levelRatio = clamp((save.xp - start) / Math.max(1, end - start), 0, 1);
      U.resultXpBar.style.width = `${levelRatio * 100}%`;
      U.resultXpBar.parentElement?.setAttribute('aria-valuenow', String(Math.round(levelRatio * 100)));
      const mission = currentMission();
      U.resultMissionTitle.textContent = result.mission ? `OBJECTIVE COMPLETE: ${result.mission.title}` : mission.repeatable ? `REPEATABLE: ${mission.title}` : mission.title;
      U.resultMissionProgress.textContent = result.mission ? `+${result.mission.reward} COINS` : `${Math.floor(missionProgress(mission))} / ${mission.target}`;
      const unlocks = [];
      if (result.levelAfter > result.levelBefore) unlocks.push(`Level ${result.levelAfter} reached`);
      if (result.worldsUnlocked.length) unlocks.push(`${result.worldsUnlocked.map(world => world.name).join(', ')} unlocked`);
      if (result.achievements.length) unlocks.push(`${result.achievements.length} challenge${result.achievements.length > 1 ? 's' : ''} completed`);
      U.resultUnlock.textContent = unlocks.join('  •  ');
      setOverlay(U.over, true);
      setOverlay(U.menu, false);
      audio.setMode('gameover');
      if (isBest) setTimeout(() => audio.newBest(), 260);
      else if (result.mission || result.achievements.length) setTimeout(() => audio.reward(), 260);
      requestAnimationFrame(() => U.retry.focus({ preventScroll: true }));
    }

    function showPause({ score = 0, distance = 0 } = {}) {
      U.pauseSummary.textContent = `${Math.floor(distance).toLocaleString()} m  \u2022  ${Math.floor(score).toLocaleString()} flow`;
      pausePreviousFocus = document.activeElement;
      setOverlay(U.pauseOverlay, true);
      audio.setMode('paused');
      requestAnimationFrame(() => U.resume.focus({ preventScroll: true }));
    }

    function hidePause() {
      setOverlay(U.pauseOverlay, false);
      pausePreviousFocus?.focus?.({ preventScroll: true });
      pausePreviousFocus = null;
      audio.setMode('playing');
    }

    function showSplash() {
      setOverlay(U.splash, true);
    }

    function finishSplash() {
      U.splash.classList.add('complete');
      setTimeout(() => {
        setOverlay(U.splash, false);
        U.splash.classList.remove('complete');
      }, 420);
    }

    function confirm({ title, copy, accept = 'CONFIRM', onAccept }) {
      previousFocus = document.activeElement;
      confirmSource = [U.pauseOverlay, U.over, U.menu].find(element => element.classList.contains('active')) || null;
      blockLayer(confirmSource, true);
      U.confirmTitle.textContent = title;
      U.confirmCopy.textContent = copy;
      U.confirmAccept.textContent = accept;
      confirmAction = onAccept;
      setOverlay(U.confirm, true);
      requestAnimationFrame(() => U.confirmCancel.focus({ preventScroll: true }));
    }

    function closeConfirm(accepted = false) {
      const action = confirmAction;
      confirmAction = null;
      setOverlay(U.confirm, false);
      blockLayer(confirmSource, false);
      confirmSource = null;
      if (accepted) action?.();
      else previousFocus?.focus?.({ preventScroll: true });
    }

    function bind(callbacks) {
      document.querySelectorAll('[data-open-view], [data-nav-view]').forEach(button => {
        button.addEventListener('click', () => {
          audio.click();
          activateView(button.dataset.openView || button.dataset.navView);
          render();
        });
      });
      document.querySelectorAll('[data-setting]').forEach(button => {
        button.addEventListener('click', () => {
          const key = button.dataset.setting;
          save.settings[key] = !save.settings[key];
          persist();
          renderSettings();
          audio.click();
          if (key === 'vibration' && save.settings.vibration) haptic(10);
        });
      });
      U.garage.addEventListener('click', event => {
        const button = event.target.closest('[data-skin]');
        if (!button) return;
        const skin = SKINS.find(item => item.id === button.dataset.skin);
        if (!skin) return;
        if (save.owned.includes(skin.id)) save.skin = skin.id;
        else if (save.wallet >= skin.price) {
          save.wallet -= skin.price;
          save.owned.push(skin.id);
          save.skin = skin.id;
          haptic([12, 24, 12]);
          audio.reward();
          systemToast(`${skin.name} unlocked`, true);
        } else {
          systemToast(`Need ${(skin.price - save.wallet).toLocaleString()} more coins`);
          haptic(24);
          return;
        }
        persist();
        render();
        requestAnimationFrame(() => U.garage.querySelector(`[data-skin="${skin.id}"]`)?.focus({ preventScroll: true }));
        callbacks.presentationChanged?.();
      });
      U.worlds.addEventListener('click', event => {
        const button = event.target.closest('[data-world]');
        if (!button || button.disabled) return;
        const world = WORLDS.find(item => item.id === button.dataset.world);
        if (!world || playerLevel() < world.level) return;
        save.world = world.id;
        persist();
        audio.reward();
        haptic([8, 18, 8]);
        render();
        requestAnimationFrame(() => U.worlds.querySelector(`[data-world="${world.id}"]`)?.focus({ preventScroll: true }));
        callbacks.presentationChanged?.();
      });
      U.reset.addEventListener('click', () => confirm({ title: 'Reset every record?', copy: 'Coins, styles, worlds, records, and run history will be erased from this browser.', accept: 'RESET EVERYTHING', onAccept: () => { save = defaults(); persist(); render(); callbacks.presentationChanged?.(); systemToast('Save data reset'); } }));
      U.play.addEventListener('click', callbacks.start);
      U.retry.addEventListener('click', callbacks.start);
      U.restart.addEventListener('click', callbacks.restart);
      U.main.addEventListener('click', callbacks.menu);
      U.resultGarage?.addEventListener('click', callbacks.garage);
      U.pause.addEventListener('click', callbacks.pause);
      U.resume.addEventListener('click', callbacks.resume);
      U.pauseMenu.addEventListener('click', callbacks.leaveRun);
      U.splashSkip?.addEventListener('click', callbacks.skipIntro);
      U.confirmCancel.addEventListener('click', () => closeConfirm(false));
      U.confirmAccept.addEventListener('click', () => closeConfirm(true));
      document.addEventListener('keydown', event => {
        if (trapFocus(event, U.confirm)) return;
        if (trapFocus(event, U.pauseOverlay)) return;
        if (trapFocus(event, U.over)) return;
        if (event.key === 'Escape' && U.confirm.classList.contains('active')) closeConfirm(false);
        else if (event.key === 'Escape' && U.pauseOverlay.classList.contains('active')) callbacks.resume();
      });

      let previewResizeTimer = 0;
      const redrawVisiblePreviews = () => {
        clearTimeout(previewResizeTimer);
        previewResizeTimer = setTimeout(() => {
          if (document.querySelector('.menu-view[data-view="garage"].active')) renderGarage();
          if (document.querySelector('.menu-view[data-view="worlds"].active')) renderWorlds();
        }, 120);
      };
      window.addEventListener('resize', redrawVisiblePreviews, { passive: true });
      window.visualViewport?.addEventListener('resize', redrawVisiblePreviews, { passive: true });
    }

    return {
      U,
      get save() { return save; },
      persist,
      selectedSkin,
      selectedWorld,
      playerLevel,
      currentMission,
      missionProgress,
      audio,
      haptic,
      quip,
      systemToast,
      gameplayVisible,
      showCoach,
      hideCoach,
      render,
      openMenu,
      closeOverlays,
      activateView,
      updateHud,
      bankRun,
      showGameOver,
      showPause,
      hidePause,
      showSplash,
      finishSplash,
      confirm,
      bind
    };
  }

  return { create, SKINS, WORLDS, MISSIONS, CHALLENGES, xpForLevel, levelForXp };
});
