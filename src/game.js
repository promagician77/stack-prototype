import { resolveDrop, growAfterCombo, Outcome } from './core.js';

const W = 360, H = 640, BH = 28, BASE_W = 210, TOL = 4, COMBO_TO_GROW = 3, GROW_BY = 10;
const GROUND = H - 110, GRAVITY = 1900;

// Fixed-size pools: nothing is allocated per drop, so no GC hitches mid-run.
class Pool {
  constructor(size, make) { this.items = Array.from({ length: size }, make); }
  get() { const it = this.items.find((i) => !i.active); if (it) it.active = true; return it || null; }
  get active() { return this.items.filter((i) => i.active).length; }
  get free() { return this.items.length - this.active; }
  each(f) { for (const i of this.items) if (i.active) f(i); }
}

export class Game {
  constructor(canvas, hooks) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.hooks = hooks;
    this.debris = new Pool(32, () => ({ active: false }));
    this.particles = new Pool(160, () => ({ active: false }));
    this.labels = new Pool(8, () => ({ active: false }));
    this.fps = 60; this.shake = 0; this.cam = 0; this.camTarget = 0;
    this.resize(); window.addEventListener('resize', () => this.resize());
    this.reset();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.c.width = W * dpr; this.c.height = H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  reset() {
    this.tower = [{ x: (W - BASE_W) / 2, w: BASE_W, level: 0, hue: 200 }];
    this.moving = null; this.combo = 0; this.height = 0; this.running = false;
    this.cam = this.camTarget = 0; this.baseHue = 200 + Math.random() * 120;
    this.tower[0].hue = this.baseHue;
  }

  start() { this.reset(); this.running = true; this.spawn(BASE_W); }
  resume() { this.running = true; this.spawn(this.top.w); }
  get top() { return this.tower[this.tower.length - 1]; }
  hue(level) { return (this.baseHue + level * 7) % 360; }
  speed() { return Math.min(430, 150 + this.height * 7); }

  spawn(w) {
    const level = this.tower.length, fromLeft = level % 2 === 1;
    this.moving = { x: fromLeft ? -w * 0.7 : W - w * 0.3, w, level, dir: fromLeft ? 1 : -1, hue: this.hue(level) };
  }

  drop() {
    if (!this.running || !this.moving) return;
    const m = this.moving, t = this.top;
    const r = resolveDrop(t.x, t.w, m.x, m.w, TOL);
    if (r.outcome === Outcome.Missed) {
      this.addDebris(m.x, m.level, m.w, m.hue, m.dir * 120);
      this.moving = null; this.running = false; this.shake = 14; this.combo = 0;
      this.hooks.onEvent('drop.missed');
      setTimeout(() => this.hooks.onFail(this.height), 650);
      return;
    }
    this.combo = r.outcome === Outcome.Perfect ? this.combo + 1 : 0;
    const w = r.outcome === Outcome.Perfect ? growAfterCombo(r.width, this.combo, COMBO_TO_GROW, GROW_BY, BASE_W) : r.width;
    const x = w > r.width ? Math.max(0, r.x - (w - r.width) / 2) : r.x;
    this.tower.push({ x, w, level: m.level, hue: m.hue });
    this.height++;
    if (r.sliceWidth > 0) { this.addDebris(r.sliceX, m.level, r.sliceWidth, m.hue, (r.sliceX > x ? 1 : -1) * 90); this.shake = 4; }
    if (r.outcome === Outcome.Perfect) {
      this.burst(x + w / 2, m.level, m.hue);
      this.label(this.combo > 1 ? `Perfect ×${this.combo}` : 'Perfect', x + w / 2, m.level);
      if (navigator.vibrate) navigator.vibrate(12);
    }
    this.hooks.onEvent(`drop.${r.outcome.toLowerCase()}`, r.outcome === Outcome.Perfect ? `combo ${this.combo}` : `cut ${r.sliceWidth.toFixed(0)}px`);
    this.camTarget = Math.max(0, (this.tower.length - 9) * BH);
    this.spawn(w);
  }

  addDebris(x, level, w, hue, vx) {
    const d = this.debris.get(); if (!d) return;
    Object.assign(d, { x, y: GROUND - level * BH, w, hue, vx, vy: -60, rot: 0, vr: (vx > 0 ? 1 : -1) * (1.5 + Math.random() * 2) });
  }
  burst(cx, level, hue) {
    const cy = GROUND - level * BH + BH / 2;
    for (let i = 0; i < 18; i++) {
      const p = this.particles.get(); if (!p) break;
      const a = (i / 18) * Math.PI * 2, s = 140 + Math.random() * 160;
      Object.assign(p, { x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 80, life: 0.6, max: 0.6, hue, size: 3 + Math.random() * 3 });
    }
  }
  label(text, cx, level) {
    const l = this.labels.get(); if (!l) return;
    Object.assign(l, { text, x: cx, y: GROUND - level * BH - 14, life: 0.9 });
  }

  loop(now) {
    const dt = Math.min(0.033, (now - this.last) / 1000); this.last = now;
    this.fps = this.fps * 0.92 + (1 / Math.max(dt, 0.001)) * 0.08;
    this.update(dt); this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    const m = this.moving;
    if (m && this.running) {
      m.x += m.dir * this.speed() * dt;
      if (m.x + m.w > W + m.w * 0.35 && m.dir > 0) m.dir = -1;
      if (m.x < -m.w * 0.35 && m.dir < 0) m.dir = 1;
    }
    this.cam += (this.camTarget - this.cam) * Math.min(1, dt * 6);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.debris.each((d) => {
      d.vy += GRAVITY * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
      if (d.y - this.cam > H + 80) d.active = false;
    });
    this.particles.each((p) => {
      p.life -= dt; p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) p.active = false;
    });
    this.labels.each((l) => { l.life -= dt; l.y -= 40 * dt; if (l.life <= 0) l.active = false; });
  }

  block(x, y, w, hue, alpha = 1) {
    const g = this.ctx;
    g.globalAlpha = alpha;
    g.fillStyle = `hsl(${hue} 70% 58%)`; g.fillRect(x, y, w, BH);
    g.fillStyle = `hsl(${hue} 80% 72%)`; g.fillRect(x, y, w, 5);
    g.fillStyle = `hsl(${hue} 60% 44%)`; g.fillRect(x, y + BH - 4, w, 4);
    g.globalAlpha = 1;
  }

  draw() {
    const g = this.ctx, h = this.hue(this.tower.length);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `hsl(${(h + 30) % 360} 55% 22%)`); bg.addColorStop(1, `hsl(${h} 45% 12%)`);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    g.save();
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    g.translate(sx, sy + this.cam);

    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, GROUND + BH, W, H);
    for (const b of this.tower) {
      const y = GROUND - b.level * BH;
      if (y + this.cam > H + BH || y + this.cam < -BH) continue;
      this.block(b.x, y, b.w, b.hue);
    }
    const m = this.moving;
    if (m) this.block(m.x, GROUND - m.level * BH, m.w, m.hue);

    this.debris.each((d) => {
      g.save(); g.translate(d.x + d.w / 2, d.y + BH / 2); g.rotate(d.rot);
      this.block(-d.w / 2, -BH / 2, d.w, d.hue, 0.9); g.restore();
    });
    this.particles.each((p) => {
      g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = `hsl(${p.hue} 90% 75%)`;
      g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
    });
    g.globalAlpha = 1;
    g.font = '700 18px Rubik, system-ui, sans-serif'; g.textAlign = 'center';
    this.labels.each((l) => {
      g.globalAlpha = Math.min(1, l.life * 2); g.fillStyle = '#fff'; g.fillText(l.text, l.x, l.y);
    });
    g.globalAlpha = 1;
    g.restore();

    if (this.running || this.height > 0) {
      g.font = '700 64px Rubik, system-ui, sans-serif'; g.textAlign = 'center';
      g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillText(String(this.height), W / 2, 96);
    }
  }
}
