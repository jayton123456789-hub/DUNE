import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ScoreSystem } = require('../src/score-system.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const score = new ScoreSystem({ lineY: 110 });
score.beginFlight();
const ball = { grounded: false, y: 80 };
let lineCrossed = false;
for (let index = 0; index < 240; index++) {
  const events = score.update(ball, 1 / 120, index / 120);
  if (events.some(event => event.type === 'line-cross')) lineCrossed = true;
}
assert(lineCrossed, 'score line crossing did not trigger');
assert(score.pendingDisplay >= 12, `pending score too low: ${score.pendingDisplay}`);
const attempted = score.pendingDisplay;
const bank = score.land('perfect').find(event => event.type === 'bank');
assert(bank.banked === attempted, 'perfect landing did not bank full pending score');
assert(score.multiplier === 1.5, `first perfect multiplier should be 1.5, got ${score.multiplier}`);
assert(score.score === attempted, 'banked score was not added to total');

score.beginFlight();
for (let index = 0; index < 120; index++) score.update({ grounded: false, y: -120 }, 1 / 120, index / 120);
const secondAttempt = score.pendingDisplay;
const rough = score.land('rough').find(event => event.type === 'bank');
assert(rough.banked < secondAttempt, 'rough landing should lose some pending score');
assert(rough.banked > 0, 'rough landing should bank part of pending score');
assert(score.multiplier === 1, 'rough landing should reset multiplier');

score.beginFlight();
for (let index = 0; index < 120; index++) score.update({ grounded: false, y: 60 }, 1 / 120, index / 120);
const risk = score.pendingDisplay;
const lost = score.losePending('crash').find(event => event.type === 'pending-lost');
assert(lost?.lost === risk, 'crash did not lose the full pending score');
assert(score.pendingDisplay === 0, 'pending score was not cleared after crash');

console.log(JSON.stringify({
  status: 'pass',
  firstBank: bank.banked,
  firstMultiplier: 1.5,
  roughBankRatio: Number((rough.banked / secondAttempt).toFixed(2)),
  crashRiskLost: lost.lost
}, null, 2));
