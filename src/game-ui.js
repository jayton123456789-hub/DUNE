(function attachGameUI(root, factory) {
  root.DriftGameUI = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  'use strict';

  const $ = id => document.getElementById(id);
  const SAVE_KEY = 'driftline-save-v7';

  const SKINS = [
    { id: 'aqua', name: 'Aqua', price: 0, hue: 0, rarity: 'Starter', description: 'The original clean line.' },
    { id: 'coral', name: 'Coral', price: 450, hue: 145, rarity: 'Common', description: 'Warm coral energy.' },
    { id: 'sunset', name: 'Sunset', price: 900, hue: 195, rarity: 'Common', description: 'Golden-hour glow.' },
    { id: 'violet', name: 'Violet', price: 1800, hue: 75, rarity: 'Rare', description: 'Deep ultraviolet finish.' },
    { id: 'lime', name: 'Volt', price: 3200, hue: 260, rarity: 'Rare', description: 'Electric lime streak.' },
    { id: 'midnight', name: 'Midnight', price: 5500, hue: 35, rarity: 'Epic', description: 'Cold blue shadow core.' },
    { id: 'prism', name: 'Prism', price: 15000, hue: 0, rarity: 'Legendary', description: 'Animated RGB glow and rainbow trail.', animated: true }
  ];

  const defaults = () => ({
    bestScore: 0,
    bestDistance: 0,
    wallet: 0,
    lifetimeCoins: 0,
    totalScore: 0,
    runs: 0,
    perfects: 0,
    owned: ['aqua'],
    skin: 'aqua',
    settings: { sound: true, vibration: true, motion: true },
    records: {
      maxAltitude: 0,
      longestAir: 0,
      maxSpeed: 0,
      bestChain: 0,
      lineCrossings: 0
    }
  });

  function loadSave() {
    try {
      const current = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (current) {
        const base = defaults();
        return {
          ...base,
          ...current,
          owned: current.owned?.length ? current.owned : ['aqua'],
          settings: { ...base.settings, ...(current.settings || {}) },
          records: { ...base.records, ...(current.records || {}) }
        };
      }
      const legacy = JSON.parse(localStorage.getItem('driftline-save-v6') || localStorage.getItem('driftline-save-v5') || '{}');
      const migrated = defaults();
      migrated.bestDistance = Number(legacy.bestDistance ?? legacy.best) || 0;
      migrated.bestScore = Number(legacy.bestScore) || 0;
      migrated.wallet = Number(legacy.wallet) || 0;
      migrated.lifetimeCoins = Number(legacy.lifetimeCoins) || 0;
      migrated.runs = Number(legacy.runs) || 0;
      migrated.perfects = Number(legacy.perfects) || 0;
      migrated.owned = legacy.owned?.length ? legacy.owned : ['aqua'];
      migrated.skin = legacy.skin || 'aqua';
      migrated.settings = { ...migrated.settings, ...(legacy.settings || {}) };
      return migrated;
    } catch (_) {
      return defaults();
    }
  }

  class AudioBus {
    constructor(settings) { this.settings = settings; }
    unlock() {
      if (!this.settings().sound) return;
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.12;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') this.context.resume();
    }
    tone(start, duration, type = 'sine', gain = 0.08, end = start, delay = 0) {
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
      amplifier.gain.exponentialRampToValueAtTime(gain, now + 0.012);
      amplifier.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(amplifier);
      amplifier.connect(this.master);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.03);
    }
    click() { this.tone(500, 0.055, 'triangle', 0.055, 690); }
    launch() { this.tone(170, 0.18, 'triangle', 0.09, 470); }
    line() {
      this.tone(640, 0.1, 'triangle', 0.085, 920);
      this.tone(920, 0.12, 'sine', 0.05, 1180, 0.045);
    }
    tier(tier) { this.tone(760 + tier * 115, 0.09, 'sine', 0.05, 980 + tier * 130); }
    bank(amount) {
      const strength = Math.min(0.1, 0.045 + amount / 800);
      this.tone(410, 0.13, 'triangle', strength, 620);
      this.tone(620, 0.16, 'triangle', strength * 0.8, 850, 0.055);
    }
    land(grade) {
      if (grade === 'perfect') {
        this.tone(500, 0.12, 'triangle', 0.09, 790);
        this.tone(790, 0.12, 'sine', 0.06, 1040, 0.05);
      } else this.tone(grade === 'good' ? 350 : 135, 0.1, 'triangle', 0.06, grade === 'good' ? 475 : 84);
    }
    lost() { this.tone(210, 0.16, 'sawtooth', 0.06, 95); }
    crash() { this.tone(110, 0.25, 'sawtooth', 0.13, 48); }
    intro() {
      this.tone(140, 0.38, 'sine', 0.045, 260);
      this.tone(260, 0.32, 'triangle', 0.045, 540, 0.25);
    }
  }

  function create() {
    const U = {
      hud: $('hud'), score: $('scoreValue'), distance: $('distanceValue'), pending: $('pendingScore'),
      runCoins: $('runCoins'), toast: $('landingToast'), multiplier: $('multiplierValue'),
      speed: $('speedLabel'), altitude: $('altitudeLabel'), pause: $('pauseButton'),
      menu: $('menuRoot'), splash: $('splashIntro'), splashSkip: $('skipIntro'), splashLogo: $('splashLogo'),
      wallet: $('walletCoins'), garageWallet: $('garageWalletCoins'), bestScore: $('bestScore'),
      bestDistance: $('bestDistance'), selectedSkinName: $('selectedSkinName'), play: $('playButton'),
      garage: $('garageGrid'), sound: $('soundToggle'), vibration: $('vibrationToggle'),
      motion: $('motionToggle'), reset: $('resetDataButton'),
      recordScore: $('recordScore'), recordDistance: $('recordDistance'), recordAltitude: $('recordAltitude'),
      recordAir: $('recordAir'), recordSpeed: $('recordSpeed'), recordChain: $('recordChain'),
      over: $('gameOverScreen'), overTitle: $('gameOverTitle'), overReason: $('gameOverReason'),
      finalScore: $('finalScore'), finalDistance: $('finalDistance'), finalBest: $('finalBest'),
      finalCoins: $('finalCoins'), retry: $('retryButton'), resultGarage: $('resultGarageButton'),
      main: $('menuButton'), pauseOverlay: $('pauseOverlay'), resume: $('resumeButton'),
      restart: $('restartButton'), pauseSettings: $('pauseSettingsButton'), pauseMenu: $('pauseMenuButton'),
      system: $('toastMessage'), currentGoal: $('currentGoal'), levelValue: $('levelValue')
    };

    let save = loadSave();
    const persist = () => {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {}
    };
    const selectedSkin = () => SKINS.find(skin => skin.id === save.skin) || SKINS[0];
    const audio = new AudioBus(() => save.settings);
    const haptic = pattern => { if (save.settings.vibration && navigator.vibrate) navigator.vibrate(pattern); };

    const quip = (message, color = '#fff', duration = 850) => {
      U.toast.textContent = message;
      U.toast.style.color = color;
      U.toast.classList.add('show');
      clearTimeout(quip.timer);
      quip.timer = setTimeout(() => U.toast.classList.remove('show'), duration);
    };

    const systemToast = message => {
      U.system.textContent = message;
      U.system.classList.add('show');
      clearTimeout(systemToast.timer);
      systemToast.timer = setTimeout(() => U.system.classList.remove('show'), 1400);
    };

    function gameplayVisible(visible, state) {
      U.hud.classList.toggle('active', visible);
      U.hud.setAttribute('aria-hidden', visible ? 'false' : 'true');
      U.pause.style.display = visible && state === 'playing' ? 'block' : 'none';
    }

    function renderSettings() {
      U.sound.classList.toggle('on', save.settings.sound);
      U.vibration.classList.toggle('on', save.settings.vibration);
      U.motion.classList.toggle('on', save.settings.motion);
    }

    function renderGarage() {
      U.garage.replaceChildren();
      for (const skin of SKINS) {
        const owned = save.owned.includes(skin.id);
        const equipped = save.skin === skin.id;
        const card = document.createElement('article');
        card.className = `garage-card${equipped ? ' selected' : ''}${owned ? '' : ' locked'}${skin.animated ? ' legendary' : ''}`;
        card.innerHTML = `
          <div class="garage-preview ${skin.animated ? 'prism-preview' : ''}">
            <span class="garage-ball" style="--skin-hue:${skin.hue}deg"></span>
            ${skin.animated ? '<i class="rainbow-ring"></i>' : ''}
          </div>
          <div class="garage-copy"><small>${skin.rarity}</small><h3>${skin.name}</h3><p>${skin.description}</p></div>
          <button class="garage-action" type="button" data-skin="${skin.id}">
            ${equipped ? 'EQUIPPED' : owned ? 'EQUIP' : `<img src="assets/coin.svg" alt="" />${skin.price.toLocaleString()}`}
          </button>`;
        U.garage.append(card);
      }
    }

    function playerLevel() {
      return Math.max(1, Math.floor(Math.sqrt(save.totalScore / 120)) + 1);
    }

    function render() {
      const skin = selectedSkin();
      U.wallet.textContent = U.garageWallet.textContent = save.wallet.toLocaleString();
      U.bestScore.textContent = save.bestScore.toLocaleString();
      U.bestDistance.textContent = `${Math.floor(save.bestDistance)} m`;
      U.selectedSkinName.textContent = skin.name;
      U.levelValue.textContent = playerLevel();
      U.recordScore.textContent = save.bestScore.toLocaleString();
      U.recordDistance.textContent = `${Math.floor(save.bestDistance)} m`;
      U.recordAltitude.textContent = `${Math.floor(save.records.maxAltitude)} px`;
      U.recordAir.textContent = `${save.records.longestAir.toFixed(2)} s`;
      U.recordSpeed.textContent = `${Math.floor(save.records.maxSpeed * 0.34)} km/h`;
      U.recordChain.textContent = `×${Math.max(1, save.records.bestChain).toFixed(1)}`;
      U.currentGoal.textContent = 'Cross the score line and land smoothly';
      renderSettings();
      renderGarage();
    }

    function activateView(name) {
      document.querySelectorAll('.menu-view').forEach(view => {
        const active = view.dataset.view === name;
        view.classList.toggle('active', active);
        view.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      document.querySelectorAll('[data-nav-view]').forEach(button => {
        button.classList.toggle('active', button.dataset.navView === name);
      });
    }

    function openMenu(name = 'main') {
      U.pauseOverlay.classList.remove('active');
      U.over.classList.remove('active');
      U.menu.classList.add('active');
      activateView(name);
      render();
    }

    function closeOverlays() {
      U.menu.classList.remove('active');
      U.over.classList.remove('active');
      U.pauseOverlay.classList.remove('active');
    }

    function updateHud({ score, distance, pending, multiplier, coins, speed, altitude, aboveLine }) {
      U.score.textContent = Math.floor(score).toLocaleString();
      U.distance.textContent = `${Math.floor(distance)} m`;
      U.pending.textContent = pending > 0 ? `+${pending}` : '—';
      U.pending.classList.toggle('hot', pending > 0);
      U.multiplier.textContent = `×${multiplier.toFixed(1)}`;
      U.speed.textContent = speed > 1300 ? 'MAX VELOCITY' : speed > 1000 ? 'HYPERSPEED' : speed > 760 ? 'BLAZING' : speed > 550 ? 'FAST' : 'CRUISE';
      U.altitude.textContent = aboveLine ? `${Math.round(altitude)} ABOVE LINE` : altitude > 4 ? `${Math.round(altitude)} ALT` : `${Math.round(speed * 0.34)} KM/H`;
      U.runCoins.textContent = coins;
    }

    function bankRun({ score, distance, coins, metrics }) {
      save.wallet += coins;
      save.lifetimeCoins += coins;
      save.totalScore += score;
      save.runs += 1;
      save.bestScore = Math.max(save.bestScore, Math.floor(score));
      save.bestDistance = Math.max(save.bestDistance, Math.floor(distance));
      save.records.maxAltitude = Math.max(save.records.maxAltitude, metrics.maxAltitude || 0);
      save.records.longestAir = Math.max(save.records.longestAir, metrics.longestAir || 0);
      save.records.maxSpeed = Math.max(save.records.maxSpeed, metrics.maxSpeed || 0);
      save.records.bestChain = Math.max(save.records.bestChain, metrics.bestMultiplier || 1);
      save.records.lineCrossings += metrics.lineCrossings || 0;
      persist();
    }

    function showGameOver({ title, reason, score, distance, coins }) {
      U.overTitle.textContent = title;
      U.overReason.textContent = reason;
      U.finalScore.textContent = Math.floor(score).toLocaleString();
      U.finalDistance.textContent = `${Math.floor(distance)} m`;
      U.finalBest.textContent = save.bestScore.toLocaleString();
      U.finalCoins.textContent = coins;
      U.over.classList.add('active');
    }

    function showSplash() {
      U.splash.classList.add('active');
      U.splash.setAttribute('aria-hidden', 'false');
    }

    function finishSplash() {
      U.splash.classList.add('complete');
      setTimeout(() => {
        U.splash.classList.remove('active');
        U.splash.setAttribute('aria-hidden', 'true');
      }, 520);
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
          haptic([12, 25, 12]);
          systemToast(`${skin.name} unlocked`);
        } else {
          systemToast(`Need ${(skin.price - save.wallet).toLocaleString()} more coins`);
          haptic(24);
          return;
        }
        persist();
        render();
      });
      U.reset.addEventListener('click', () => {
        if (!confirm('Reset all save data?')) return;
        save = defaults();
        persist();
        render();
      });
      U.play.addEventListener('click', callbacks.start);
      U.retry.addEventListener('click', callbacks.start);
      U.restart.addEventListener('click', callbacks.start);
      U.main.addEventListener('click', callbacks.menu);
      U.resultGarage?.addEventListener('click', callbacks.garage);
      U.pause.addEventListener('click', callbacks.pause);
      U.resume.addEventListener('click', callbacks.resume);
      U.pauseMenu.addEventListener('click', callbacks.menu);
      U.pauseSettings.addEventListener('click', callbacks.settings);
      U.splashSkip?.addEventListener('click', callbacks.skipIntro);
    }

    return {
      U,
      get save() { return save; },
      persist,
      selectedSkin,
      audio,
      haptic,
      quip,
      systemToast,
      gameplayVisible,
      render,
      openMenu,
      closeOverlays,
      activateView,
      updateHud,
      bankRun,
      showGameOver,
      showSplash,
      finishSplash,
      bind
    };
  }

  return { create, SKINS };
});
