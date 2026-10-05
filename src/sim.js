// Port of unity/Assets/Scripts/Core/{DeterministicRandom,StackSimulation}.cs.
// Same operations in the same order on IEEE-754 doubles, so a seed + inputs gives the
// same tower hash here and in C#. The tests in both languages check the same numbers.
import { resolveDrop, growAfterCombo, Outcome } from './core.js';

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_CONFIG = {
  baseSize: 100, blockHeight: 20, range: 150,
  speed0: 110, speedPerLevel: 3.2, speedMax: 300,
  tolerance: 3.5, growBy: 6, comboToGrow: 3, tickRate: 120,
};

export class StackSimulation {
  constructor(seed, config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = mulberry32(seed);
    const h = this.config.baseSize / 2;
    this.tower = [{ x: -h, z: -h, w: this.config.baseSize, d: this.config.baseSize, level: 0 }];
    this.tick = 0; this.height = 0; this.combo = 0; this.over = false; this.lastResult = null;
    this.spawn();
  }
  get top() { return this.tower[this.tower.length - 1]; }
  get dt() { return 1 / this.config.tickRate; }
  get speed() { return Math.min(this.config.speedMax, this.config.speed0 + this.height * this.config.speedPerLevel); }

  spawn() {
    const top = this.top;
    this.axis = this.tower.length % 2 === 1 ? 'x' : 'z';
    const side = this.rng() < 0.5 ? -1 : 1;
    this.pos = side * this.config.range;
    this.dir = -side;
    this.moving = { x: top.x, z: top.z, w: top.w, d: top.d, level: this.tower.length };
    this.place();
  }
  place() {
    if (this.axis === 'x') this.moving.x = this.pos - this.moving.w / 2;
    else this.moving.z = this.pos - this.moving.d / 2;
  }

  step() {
    if (this.over || !this.moving) return;
    this.tick++;
    this.pos += this.dir * this.speed * this.dt;
    if (this.pos > this.config.range) { this.pos = this.config.range; this.dir = -1; }
    if (this.pos < -this.config.range) { this.pos = -this.config.range; this.dir = 1; }
    this.place();
  }

  drop() {
    if (this.over || !this.moving) throw new Error('Nothing to drop.');
    const top = this.top, m = this.moving, x = this.axis === 'x', c = this.config;
    const r = x ? resolveDrop(top.x, top.w, m.x, m.w, c.tolerance) : resolveDrop(top.z, top.d, m.z, m.d, c.tolerance);
    this.lastResult = r;
    const dropped = { ...m, axis: this.axis };
    if (r.outcome === Outcome.Missed) {
      this.over = true; this.moving = null; this.combo = 0;
      return { result: r, dropped };
    }
    this.combo = r.outcome === Outcome.Perfect ? this.combo + 1 : 0;
    const size = r.outcome === Outcome.Perfect ? growAfterCombo(r.width, this.combo, c.comboToGrow, c.growBy, c.baseSize) : r.width;
    const min = r.x - (size - r.width) / 2;
    const placed = { x: x ? min : top.x, z: x ? top.z : min, w: x ? size : top.w, d: x ? top.d : size, level: this.tower.length };
    this.tower.push(placed);
    this.height++;
    const slice = r.sliceWidth > 0
      ? { x: x ? r.sliceX : m.x, z: x ? m.z : r.sliceX, w: x ? r.sliceWidth : m.w, d: x ? m.d : r.sliceWidth, level: m.level }
      : null;
    this.spawn();
    return { result: r, placed, slice, combo: this.combo, axis: dropped.axis };
  }

  continue() {
    if (!this.over) throw new Error('Can only continue after a miss.');
    this.over = false; this.spawn();
  }

  hash() {
    let h = 2166136261 >>> 0;
    const mix = (v) => {
      const u = Number(BigInt.asUintN(32, BigInt(v)));
      for (let i = 0; i < 4; i++) { h ^= (u >>> (i * 8)) & 0xff; h = Math.imul(h, 16777619) >>> 0; }
    };
    const q = (v) => Math.floor(v * 1000 + 0.5);
    for (const b of this.tower) { mix(q(b.x)); mix(q(b.z)); mix(q(b.w)); mix(q(b.d)); }
    mix(this.height); mix(this.tick);
    return h >>> 0;
  }
}

export class Replay {
  constructor(seed) { this.seed = seed; this.inputs = []; }
  record(tick, kind) { this.inputs.push({ tick, kind }); }
  play(config, maxTicks = 1e6) {
    const sim = new StackSimulation(this.seed, config); let i = 0;
    while (sim.tick < maxTicks) {
      while (i < this.inputs.length && this.inputs[i].tick === sim.tick) {
        if (this.inputs[i].kind === 'drop') sim.drop(); else sim.continue();
        i++;
      }
      if (i >= this.inputs.length) break;
      if (sim.over) throw new Error(`Replay stalled at tick ${sim.tick}`);
      sim.step();
    }
    return sim;
  }
}

// The parity scenario both test suites run. A deterministic bot aims: mostly perfect drops,
// every third drop trimmed on purpose, one forced miss at drop 25 followed by a continue.
export function parityRun(seed = 2026, totalDrops = 40) {
  const sim = new StackSimulation(seed); let drops = 0, continued = false;
  for (let guard = 0; guard < 500000; guard++) {
    if (sim.over) { if (continued) break; sim.continue(); continued = true; continue; }
    sim.step();
    const x = sim.axis === 'x', top = sim.top, m = sim.moving;
    const delta = x ? m.x - top.x : m.z - top.z, size = x ? top.w : top.d;
    const want = drops === 24 && !continued ? 'miss' : drops % 3 === 2 ? 'trim' : 'perfect';
    const hit = want === 'perfect' ? Math.abs(delta) <= 1.0 : want === 'trim' ? delta >= 8 && delta <= 12 : Math.abs(delta) >= size + 5;
    if (hit) { sim.drop(); drops++; if (drops >= totalDrops) break; }
  }
  return sim;
}

// ---------- balancing bots ----------
// A bot aims at the block below with a human-like error (normal, sd in units). Runs the real
// simulation headless, so balance numbers reflect the actual rules and current config.
export function botGame(sim, rnd, sd, maxDrops = 400) {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  let aim = gauss() * sd, perfects = 0, drops = 0;
  for (let guard = 0; guard < 2e6 && !sim.over && drops < maxDrops; guard++) {
    sim.step();
    const x = sim.axis === 'x', d = x ? sim.moving.x - sim.top.x : sim.moving.z - sim.top.z;
    const stepLen = sim.speed / sim.config.tickRate;
    if (Math.abs(d - aim) <= stepLen / 2 + 1e-9) {
      const r = sim.drop().result; drops++;
      if (r.outcome === 'Perfect') perfects++;
      aim = gauss() * sd;
    }
  }
  return { height: sim.height, perfects, drops };
}

export function balanceCheck(config, { games = 200, seed = 1, skills = { Casual: 14, Skilled: 5 } } = {}) {
  const out = {};
  for (const [name, sd] of Object.entries(skills)) {
    const rnd = mulberry32(seed * 31 + Math.round(sd * 100));
    const heights = []; let perfects = 0, drops = 0;
    for (let g = 0; g < games; g++) {
      const r = botGame(new StackSimulation(seed * 1000 + g, config), rnd, sd);
      heights.push(r.height); perfects += r.perfects; drops += r.drops;
    }
    heights.sort((a, b) => a - b);
    out[name] = {
      avg: heights.reduce((a, b) => a + b, 0) / games,
      median: heights[Math.floor(games / 2)],
      p90: heights[Math.floor(games * 0.9)],
      perfectRate: drops ? perfects / drops : 0,
    };
  }
  return out;
}
