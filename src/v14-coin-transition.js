(() => {
  'use strict';
  const CoinField = window.DriftSmartCoins?.SmartCoinField;
  if (!CoinField || CoinField.prototype.__v14TransitionFix) return;
  CoinField.prototype.update = function update() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastMaintenance < 80) return;
    this.lastMaintenance = now;
    this.maintain();
  };
  CoinField.prototype.__v14TransitionFix = true;
})();
