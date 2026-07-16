import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ScoreSystem } = require('../src/score-system.js');

const score = new ScoreSystem();

// Distance points are the non-volatile floor of every run. Updating with the
// same or a lower distance must never double-count or take points away.
assert.equal(score.updateDistance(174.9).length, 0, 'non-milestone distance should be quiet');
assert.equal(score.score, 24, 'distance floor should award one point per seven metres');
const milestone = score.updateDistance(175).find(event => event.type === 'distance-milestone');
assert.deepEqual(milestone && { points: milestone.points, distance: milestone.distance }, { points: 25, distance: 175 });
score.updateDistance(350);
assert.equal(score.score, 50, 'distance floor should reach 50 points at 350 metres');
score.updateDistance(300);
assert.equal(score.score, 50, 'distance moving backward must not reduce score');
assert.equal(score.snapshot().travel, 50, 'snapshot should expose the travel contribution');

function accrueAir(y, seconds = 1.5) {
  score.beginFlight();
  const allEvents = [];
  for (let step = 0; step < seconds * 120; step += 1) {
    allEvents.push(...score.update({ grounded: false, y }, 1 / 120, step / 120));
  }
  return allEvents;
}

const firstEvents = accrueAir(-220);
assert.ok(firstEvents.some(event => event.type === 'line-cross'), 'first air run should cross the score line');
assert.ok(firstEvents.some(event => event.type === 'tier-up' && event.tier >= 3), 'high air should reach a visible tier');
const firstAttempt = score.pendingDisplay;
assert.ok(firstAttempt >= 35, `high-air pending score is too weak: ${firstAttempt}`);
const perfect = score.land('perfect').find(event => event.type === 'bank');
assert.equal(perfect.banked, firstAttempt, 'perfect landing should bank the full pending amount');
assert.equal(score.multiplier, 1.5, 'first perfect line crossing should start a 1.5x chain');
assert.equal(score.score, 50 + firstAttempt, 'banked air score should stack on the distance floor');

accrueAir(-120, 1.25);
const recoveryAttempt = score.pendingDisplay;
const recovery = score.land('recovery').find(event => event.type === 'bank');
assert.equal(recovery.banked, Math.floor(recoveryAttempt * 0.45), 'recovery should bank exactly its configured share');
assert.ok(recovery.banked > 0 && recovery.banked < recoveryAttempt, 'recovery should preserve some risk but not all of it');
assert.equal(recovery.lost, recoveryAttempt - recovery.banked, 'recovery loss accounting is inconsistent');
assert.equal(score.multiplier, 1, 'recovery should reset the perfect chain');
assert.equal(score.chain, 0, 'recovery should clear chain count');

accrueAir(70, 1);
const crashRisk = score.pendingDisplay;
const beforeCrash = score.score;
const lost = score.losePending('crash').find(event => event.type === 'pending-lost');
assert.equal(lost?.lost, crashRisk, 'crash should lose the full pending amount');
assert.equal(score.score, beforeCrash, 'losing pending risk must not remove banked or travel points');
assert.equal(score.pendingDisplay, 0, 'pending risk should clear after a crash');
assert.equal(score.snapshot().travel, 50, 'flight events must not corrupt the distance floor');

// Perfect low arcs must build the visible landing chain too. Requiring a score
// line crossing here made the x3 career challenge unreachable in real runs.
score.land('perfect');
assert.equal(score.multiplier, 1.5, 'a clean low arc should start the landing chain');
score.land('perfect');
assert.equal(score.multiplier, 2, 'consecutive clean low arcs should continue the landing chain');

console.log(JSON.stringify({
  status: 'pass',
  distanceFloor: score.snapshot().travel,
  perfectBank: perfect.banked,
  recovery: {
    attempted: recovery.attempted,
    banked: recovery.banked,
    lost: recovery.lost
  },
  crashRiskLost: lost.lost,
  finalScore: score.score
}, null, 2));
