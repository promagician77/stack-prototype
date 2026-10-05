import { StackSimulation, Replay } from './sim.js';

const W = 360, H = 640, S = 0.92, COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6);
const BASE_Y = 452, BH = 20;

class Pool {
  constructor(size) { this.items = Array.from({ length: size }, () => ({ active: false })); }
  get() { const it = this.items.find((i) => !i.active); if (it) it.active = true; return it || null; }
  get active() { let n = 0; for (const i of this.items) if (i.active) n++; return n; }
  each(f) { for (const i of this.items) if (i.active) f(i); }
  clear() { for (const i of this.items) i.active = false; }
}

// ---------- sound: synthesized, no audio files to load ----------
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  unlock() {
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  tone(freq, dur, type, gain, slideTo) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  perfect(combo) {
    const f = 523.25 * Math.pow(2, SCALE[Math.min(combo - 1, SCALE.length - 1)] / 12);
    this.tone(f, 0.28, 'sine', 0.2); this.tone(f * 2, 0.18, 'sine', 0.05);
  }
  trim() { this.tone(170, 0.14, 'triangle', 0.22, 90); }
  miss() { this.tone(320, 0.5, 'sawtooth', 0.06, 70); }
}

export class Game {
  constructor(canvas, hooks) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.hooks = hooks;
    this.sfx = new Sfx();
    this.debris = new Pool(24); this.particles = new Pool(140); this.ripples = new Pool(6); this.labels = new Pool(6);
    this.frameMs = new Float32Array(120); this.fi = 0; this.fps = 60;
    this.quality = 'high'; this.slowFrames = 0; this.fastFrames = 0; this.stress = false;
    this.mode = 'idle'; this.cam = 0; this.camTarget = 0; this.hue = 210; this.acc = 0;
    this.sim = new StackSimulation(1); this.resize();
    window.addEventListener('resize', () => this.resize());
    this.last = performance.now(); requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    const dpr = this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    this.c.width = W * dpr; this.c.height = H * dpr; this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- runs ----------
  start(seed, config) {
    this.seed = seed; this.config = { ...config };
    this.sim = new StackSimulation(seed, this.config);
    this.recording = new Replay(seed);
    this.hue = (seed % 360);           // cosmetic only, derived from the seed, never consumes sim RNG
    this.reset(); this.mode = 'live';
  }
  reset() { this.debris.clear(); this.particles.clear(); this.ripples.clear(); this.labels.clear(); this.acc = 0; this.cam = this.camTarget = 0; }

  drop() {
    if (this.mode !== 'live' || this.sim.over) return;
    this.recording.record(this.sim.tick, 'drop');
    this.applyDrop(this.sim.drop());
  }
  continueRun() { this.recording.record(this.sim.tick, 'continue'); this.sim.continue(); this.mode = 'live'; }

  startReplay() {
    this.liveHash = this.sim.hash(); this.liveHeight = this.sim.height;
    this.replay = { rec: this.recording, i: 0 };
    this.sim = new StackSimulation(this.seed, this.config);
    this.reset(); this.mode = 'replay';
  }

  applyDrop(info) {
    const r = info.result;
    if (r.outcome === 'Missed') {
      this.addDebris(info.dropped, info.dropped.axis);
      this.shake = 12; this.sfx.miss();
      this.hooks.onEvent('drop.missed', `tick ${this.sim.tick}`);
      if (this.mode === 'live') { this.mode = 'waiting'; setTimeout(() => this.hooks.onFail(this.sim.height), 700); }
      return;
    }
    if (info.slice) { this.addDebris(info.slice, info.axis); this.shake = 3; this.sfx.trim(); }
    if (r.outcome === 'Perfect') {
      const p = info.placed;
      this.addRipple(p); this.sfx.perfect(info.combo);
      this.addLabel(info.combo > 1 ? `Perfect ×${info.combo}` : 'Perfect', p);
      if (this.quality === 'high') this.burst(p);
      if (navigator.vibrate) navigator.vibrate(10);
    }
    this.camTarget = Math.max(0, this.sim.height * BH * S - 150);
    this.hooks.onEvent(`drop.${r.outcome.toLowerCase()}`, r.outcome === 'Perfect' ? `combo ${info.combo}` : `cut ${r.sliceWidth.toFixed(1)}`, info);
  }

  // ---------- effects ----------
  addDebris(b, axis) {
    const d = this.debris.get(); if (!d) return;
    const top = this.sim.tower[Math.max(0, b.level - 1)] || b;
    const out = axis === 'x' ? Math.sign((b.x + b.w / 2) - (top.x + top.w / 2)) : Math.sign((b.z + b.d / 2) - (top.z + top.d / 2));
    Object.assign(d, { x: b.x, z: b.z, w: b.w, d: b.d, y: b.level * BH, vy: 0, vx: axis === 'x' ? out * 40 : 0, vz: axis === 'z' ? out * 40 : 0, life: 1.6, level: b.level });
  }
  addRipple(b) { const r = this.ripples.get(); if (r) Object.assign(r, { b: { ...b }, t: 0 }); }
  addLabel(text, b) { const l = this.labels.get(); if (l) Object.assign(l, { text, b: { ...b }, t: 0 }); }
  burst(b) {
    const [cx, cy] = this.proj(b.x + b.w / 2, (b.level + 1) * BH, b.z + b.d / 2);
    for (let i = 0; i < 20; i++) {
      const p = this.particles.get(); if (!p) break;
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 140;
      Object.assign(p, { x: cx, y: cy - this.cam, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - 90, life: 0.7, max: 0.7, size: 1.5 + Math.random() * 2.5 });
    }
  }

  // ---------- loop ----------
  loop(now) {
    const ms = now - this.last; this.last = now;
    const dt = Math.min(0.05, ms / 1000);
    this.frameMs[this.fi = (this.fi + 1) % this.frameMs.length] = ms;
    this.fps = this.fps * 0.9 + (1000 / Math.max(ms, 1)) * 0.1;
    this.adapt(ms);

    if (this.mode === 'live' || this.mode === 'replay') {
      const tickDt = 1 / this.sim.config.tickRate; this.acc += dt; let n = 0;
      while (this.acc >= tickDt && n++ < 12) { this.stepOnce(); this.acc -= tickDt; if (this.mode !== 'live' && this.mode !== 'replay') break; }
    }
    this.update(dt); this.draw();
    if (this.stress) { const t = performance.now(); while (performance.now() - t < 26) { /* simulate a slow phone */ } }
    requestAnimationFrame((t) => this.loop(t));
  }

  stepOnce() {
    if (this.mode === 'replay') {
      const { rec } = this.replay;
      while (this.replay.i < rec.inputs.length && rec.inputs[this.replay.i].tick === this.sim.tick) {
        const inp = rec.inputs[this.replay.i++];
        if (inp.kind === 'drop') this.applyDrop(this.sim.drop()); else this.sim.continue();
      }
      if (this.replay.i >= rec.inputs.length) {
        this.mode = 'done';
        const replayHash = this.sim.hash();
        setTimeout(() => this.hooks.onReplayDone({ liveHash: this.liveHash, replayHash, height: this.sim.height }), 900);
        return;
      }
    }
    this.sim.step();
  }

  adapt(ms) {
    // Adaptive quality: sustained slow frames drop resolution and particles, recovery is slower on purpose.
    if (ms > 24) { this.slowFrames++; this.fastFrames = 0; } else if (ms < 18) { this.fastFrames++; this.slowFrames = Math.max(0, this.slowFrames - 1); }
    if (this.quality === 'high' && this.slowFrames > 45) { this.quality = 'low'; this.resize(); this.hooks.onEvent('quality.low', 'sustained frames over 24 ms'); }
    if (this.quality === 'low' && this.fastFrames > 240) { this.quality = 'high'; this.slowFrames = 0; this.resize(); this.hooks.onEvent('quality.high', 'recovered'); }
  }

  update(dt) {
    this.cam += (this.camTarget - this.cam) * Math.min(1, dt * 5);
    this.shake = Math.max(0, (this.shake || 0) - dt * 40);
    this.debris.each((d) => { d.vy -= 900 * dt; d.y += d.vy * dt; d.x += d.vx * dt; d.z += d.vz * dt; d.life -= dt; if (d.life <= 0) d.active = false; });
    this.particles.each((p) => { p.life -= dt; p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life <= 0) p.active = false; });
    this.ripples.each((r) => { r.t += dt; if (r.t > 0.55) r.active = false; });
    this.labels.each((l) => { l.t += dt; if (l.t > 0.9) l.active = false; });
  }

  // ---------- drawing ----------
  proj(x, y, z) { return [W / 2 + (x - z) * COS * S, BASE_Y + (x + z) * SIN * S - y * S + this.cam]; }
  hueAt(level) { return (this.hue + level * 5) % 360; }

  poly(pts, fill, stroke) {
    const g = this.g; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.stroke(); }
  }
  box(b, y0, hue, alpha = 1) {
    const x0 = b.x, x1 = b.x + b.w, z0 = b.z, z1 = b.z + b.d, y1 = y0 + BH, p = (x, y, z) => this.proj(x, y, z);
    this.g.globalAlpha = alpha;
    this.poly([p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1), p(x1, y0, z0)], `hsl(${hue} 52% 48%)`);
    this.poly([p(x0, y1, z1), p(x1, y1, z1), p(x1, y0, z1), p(x0, y0, z1)], `hsl(${hue} 52% 38%)`);
    this.poly([p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], `hsl(${hue} 62% 64%)`);
    this.g.globalAlpha = 1;
  }

  draw() {
    const g = this.g, top = this.sim.tower.length, h = this.hueAt(top);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `hsl(${(h + 40) % 360} 42% 74%)`); bg.addColorStop(1, `hsl(${(h + 10) % 360} 36% 52%)`);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    g.save();
    if (this.shake) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    const tower = this.sim.tower;
    const first = Math.max(0, Math.floor((this.cam - 260) / (BH * S)));
    // pedestal under the base so the tower stands on something
    const b0 = tower[0];
    for (let k = 6; k >= 1; k--) this.box({ x: b0.x, z: b0.z, w: b0.w, d: b0.d }, -k * BH, this.hueAt(0), 0.5 - k * 0.06);
    for (let i = first; i < tower.length; i++) this.box(tower[i], tower[i].level * BH, this.hueAt(tower[i].level));
    this.debris.each((d) => this.box(d, d.y, this.hueAt(d.level), Math.max(0, Math.min(1, d.life))));
    if (this.sim.moving && (this.mode === 'live' || this.mode === 'replay')) {
      const m = this.sim.moving; this.box(m, m.level * BH, this.hueAt(m.level));
    }
    this.ripples.each((r) => {
      const k = 1 + r.t * 0.7, b = r.b, cx = b.x + b.w / 2, cz = b.z + b.d / 2, hw = b.w / 2 * k, hd = b.d / 2 * k, y = (b.level + 1) * BH;
      g.lineWidth = 2.5; g.globalAlpha = Math.max(0, 1 - r.t / 0.55);
      this.poly([this.proj(cx - hw, y, cz - hd), this.proj(cx + hw, y, cz - hd), this.proj(cx + hw, y, cz + hd), this.proj(cx - hw, y, cz + hd)], null, '#fff');
      g.globalAlpha = 1;
    });
    this.particles.each((p) => {
      g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = '#fff';
      g.beginPath(); g.arc(p.x, p.y + this.cam, p.size, 0, Math.PI * 2); g.fill();
    });
    g.globalAlpha = 1;
    g.font = '700 17px Rubik, system-ui, sans-serif'; g.textAlign = 'center';
    this.labels.each((l) => {
      const [x, y] = this.proj(l.b.x + l.b.w / 2, (l.b.level + 1) * BH, l.b.z + l.b.d / 2);
      g.globalAlpha = Math.max(0, 1 - l.t / 0.9); g.fillStyle = '#fff'; g.fillText(l.text, x, y - 26 - l.t * 30);
    });
    g.globalAlpha = 1;
    g.restore();

    if (this.mode !== 'idle') {
      g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.95)';
      g.font = '700 68px Rubik, system-ui, sans-serif'; g.fillText(String(this.sim.height), W / 2, 104);
    }
    if (this.mode === 'replay' || this.mode === 'done') {
      g.fillStyle = 'rgba(20,24,32,0.55)'; g.fillRect(W / 2 - 52, 122, 104, 26);
      g.fillStyle = '#fff'; g.font = '600 13px Rubik, system-ui, sans-serif'; g.fillText('REPLAY', W / 2, 140);
    }
  }
}
