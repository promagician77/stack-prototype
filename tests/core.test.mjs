// Same expectations as the C# EditMode tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDrop, growAfterCombo, AdPolicy, GameStateMachine, Outcome } from '../src/core.js';

test('perfect snaps within tolerance', () => {
  const r = resolveDrop(50, 100, 53, 100, 4);
  assert.equal(r.outcome, Outcome.Perfect); assert.equal(r.x, 50); assert.equal(r.width, 100);
});
test('overshoot right and left trim the right overhang', () => {
  assert.deepEqual(resolveDrop(0, 100, 30, 100, 4), { outcome: 'Trimmed', x: 30, width: 70, sliceX: 100, sliceWidth: 30 });
  assert.deepEqual(resolveDrop(0, 100, -20, 100, 4), { outcome: 'Trimmed', x: 0, width: 80, sliceX: -20, sliceWidth: 20 });
});
test('no overlap is a miss', () => assert.equal(resolveDrop(0, 100, 120, 100, 4).outcome, 'Missed'));
test('width conserved over random drops', () => {
  for (let i = 0; i < 5000; i++) {
    const pw = 10 + Math.random() * 190, w = 10 + Math.random() * 190, px = Math.random() * 400 - 200, x = Math.random() * 800 - 400;
    const r = resolveDrop(px, pw, x, w, 4);
    if (r.outcome === 'Trimmed') assert.ok(Math.abs(r.width + r.sliceWidth - w) < 1e-9);
  }
});
test('combo growth capped', () => {
  assert.equal(growAfterCombo(80, 2, 3, 8, 200), 80); assert.equal(growAfterCombo(196, 5, 3, 8, 200), 200);
});
test('ad policy shows on games 2, 6, 10', () => {
  const p = new AdPolicy(2, 3); let shown = '';
  for (let g = 1; g <= 10; g++) if (p.onGameOver(false)) { p.onInterstitialShown(); shown += g + ' '; }
  assert.equal(shown, '2 6 10 ');
});
test('state machine rejects skipped states', () => {
  const sm = new GameStateMachine(); assert.throws(() => sm.go('GameOver')); sm.go('Playing'); sm.go('GameOver');
  assert.throws(() => sm.go('ContinueOffer'));
});
