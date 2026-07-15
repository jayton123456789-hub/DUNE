(() => {
  'use strict';

  const module = window.DriftGameUI;
  if (!module || typeof module.create !== 'function') return;

  const originalCreate = module.create.bind(module);
  module.create = (...args) => {
    const ui = originalCreate(...args);
    const audio = ui.audio || (ui.audio = {});

    if (typeof audio.coin !== 'function') {
      audio.coin = function coin() {
        if (typeof this.tone === 'function') {
          this.tone(880, 0.07, 'triangle', 0.055, 1320);
          this.tone(1320, 0.075, 'sine', 0.035, 1660, 0.035);
        } else if (typeof this.click === 'function') {
          this.click();
        }
      };
    }

    const optionalEffects = ['click', 'launch', 'line', 'tier', 'bank', 'land', 'lost', 'crash', 'intro', 'coin'];
    for (const name of optionalEffects) {
      if (typeof audio[name] !== 'function') audio[name] = () => {};
    }

    if (typeof ui.systemToast === 'function') {
      const originalToast = ui.systemToast.bind(ui);
      ui.systemToast = message => originalToast(
        message === 'Recovered from a display error'
          ? 'Recovered from a runtime error'
          : message
      );
    }

    return ui;
  };
})();
