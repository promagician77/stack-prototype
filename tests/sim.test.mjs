import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, StackSimulation, Replay, parityRun } from '../src/sim.js';

test('random matches the C# port bit for bit', () => {
  const r = mulberry32(42);
  assert.equal(r().toFixed(15), '0.601103751920164');
  assert.equal(r().toFixed(15), '0.448290558997542');
  assert.equal(r().toFixed(15), '0.852465793490410');
});

test('parity scenario gives the same tower hash as C#', () => {
  const s = parityRun(2026);
  assert.equal(s.height, 39); assert.equal(s.tick, 4395); assert.equal(s.hash(), 1933281413);
});

test('replay rebuilds a recorded run exactly', () => {
  // record a run through the public API, the way the game does
  const live = new StackSimulation(99), rec = new Replay(99); let drops = 0, cont = false;
  while (drops < 30) {
    if (live.over) { if (cont) break; rec.record(live.tick, 'continue'); live.continue(); cont = true; continue; }
    live.step();
    const x = live.axis === 'x', d = x ? live.moving.x - live.top.x : live.moving.z - live.top.z;
    if ((drops === 12 && !cont && Math.abs(d) > 110) || (drops !== 12 && Math.abs(d - (drops % 4)) <= 0.6)) {
      rec.record(live.tick, 'drop'); live.drop(); drops++;
    }
  }
  assert.equal(rec.play().hash(), live.hash());
});

test('blocks never exceed the base or vanish across 200 seeds', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = parityRun(seed);
    s.tower.forEach((b, i) => { assert.ok(b.w > 0 && b.w <= 100 + 1e-6 && b.d > 0 && b.d <= 100 + 1e-6); assert.equal(b.level, i); });
    assert.equal(s.tower.length - 1, s.height);
  }
});

test('a tampered replay is caught', () => {
  const rec = new Replay(7); const sim = new StackSimulation(7);
  for (let i = 0; i < 50; i++) sim.step();
  rec.record(sim.tick, 'drop'); sim.drop();
  rec.inputs[0].tick += 3; // inputs edited after the fact
  assert.notEqual(rec.play().hash(), sim.hash());
});

import { balanceCheck } from '../src/sim.js';
test('balance check is deterministic and skill matters', () => {
  const a = balanceCheck({}, { games: 60, seed: 3 }), b = balanceCheck({}, { games: 60, seed: 3 });
  assert.deepEqual(a, b);
  assert.ok(a.Skilled.avg > a.Casual.avg * 1.5, `skilled ${a.Skilled.avg} vs casual ${a.Casual.avg}`);
});
test('a wider perfect window makes the game easier', () => {
  const tight = balanceCheck({ tolerance: 2 }, { games: 60, seed: 4 }).Casual.avg;
  const wide = balanceCheck({ tolerance: 8 }, { games: 60, seed: 4 }).Casual.avg;
  assert.ok(wide > tight, `wide ${wide} vs tight ${tight}`);
});
