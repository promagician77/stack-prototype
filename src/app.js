import { Game } from './game.js';
import { AdPolicy, GameStateMachine } from './core.js';
import { balanceCheck, mulberry32 } from './sim.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (n) => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------- remote-config style tuning ----------
let config = { version: 1, sim: { speed0: 110, speedPerLevel: 3.2, tolerance: 3.5 }, ads: { minGamesBeforeFirst: 2, gamesBetween: 3 } };
let configSource = 'built-in defaults';

// ---------- services ----------
const purchases = {
  owned: new Set(store.get('sd_owned', [])), receipts: new Set(store.get('sd_receipts', [])),
  save() { store.set('sd_owned', [...this.owned]); store.set('sd_receipts', [...this.receipts]); },
  isOwned(id) { return this.owned.has(id); },
};
const policy = new AdPolicy(config.ads.minGamesBeforeFirst, config.ads.gamesBetween);
policy.removeAdsOwned = purchases.isOwned('remove_ads');
const sm = new GameStateMachine();
let rewardedThisRun = false, best = store.get('sd_best', 0), lastScore = 0, lastVerify = '';

// ---------- analytics ----------
const stats = { runs: 0, finished: 0, heights: 0, drops: 0, perfects: 0, offers: 0, accepted: 0, interstitials: 0, purchases: 0 };

// ---------- event log ----------
const events = [];
function log(name, detail = '') {
  events.unshift({ t: new Date().toLocaleTimeString('en-GB'), name, detail });
  events.length = Math.min(events.length, 40);
  $('ev').innerHTML = events.map((e) => `<li><span>${e.t}</span><b>${esc(e.name)}</b>${e.detail ? ` <em>${esc(e.detail)}</em>` : ''}</li>`).join('');
}
sm.onChange((a, b) => log('state', `${a} → ${b}`));

// ---------- overlays (buttons ignore taps briefly, so fast stacking taps never hit an ad) ----------
let shownAt = 0;
const GUARD_MS = 700;
function show(id) { shownAt = performance.now(); document.querySelectorAll('.ov').forEach((o) => (o.hidden = o.id !== id)); }
function hideAll() { document.querySelectorAll('.ov').forEach((o) => (o.hidden = true)); }
const guard = (name, fn) => () => {
  if (performance.now() - shownAt < GUARD_MS) { log('input.ignored', `${name} tapped too soon`); return; }
  fn();
};

function runAd(kind, seconds, done) {
  show('ad');
  $('adkind').textContent = kind === 'rewarded' ? 'Rewarded ad (test)' : 'Interstitial ad (test)';
  $('adnote').textContent = kind === 'rewarded' ? 'Watch to the end to continue your run.' : 'Shown at most once every few games.';
  $('adclose').hidden = true; log(`ad.${kind}.shown`);
  let left = seconds; $('adtimer').textContent = left;
  const iv = setInterval(() => {
    left--; $('adtimer').textContent = Math.max(left, 0);
    if (left <= 0) {
      clearInterval(iv);
      if (kind === 'rewarded') { log('ad.rewarded.completed', 'reward granted'); done(true); }
      else { $('adclose').hidden = false; $('adclose').onclick = () => { log('ad.interstitial.closed'); done(); }; }
    }
  }, 1000);
}

function gameOverScreen() {
  best = Math.max(best, lastScore); store.set('sd_best', best);
  $('goscore').textContent = lastScore; $('gobest').textContent = best;
  $('buyrow').hidden = purchases.isOwned('remove_ads'); $('ownedrow').hidden = !purchases.isOwned('remove_ads');
  $('verify').textContent = lastVerify; $('verify').hidden = !lastVerify;
  show('over');
}

// ---------- game ----------
const game = new Game($('cv'), {
  onEvent: (name, detail, info) => {
    log(name, detail);
    if (info && game.mode === 'live') { stats.drops++; if (info.result.outcome === 'Perfect') stats.perfects++; }
    if (name === 'drop.missed' && game.mode !== 'replay') stats.drops++;
  },
  onFail: (score) => {
    lastScore = score;
    if (!rewardedThisRun) { stats.offers++; sm.go('ContinueOffer'); show('cont'); return; }
    finishRun();
  },
  onReplayDone: ({ liveHash, replayHash, height }) => {
    const ok = liveHash === replayHash;
    lastVerify = ok ? `Replay verified: same tower, hash ${hex(replayHash)}` : `Replay mismatch: ${hex(liveHash)} vs ${hex(replayHash)}`;
    log(ok ? 'replay.verified' : 'replay.mismatch', `height ${height}, ${hex(replayHash)}`);
    gameOverScreen();
  },
});

function newSeed() { return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0; }
function play() {
  game.sfx.unlock();
  hideAll(); lastVerify = '';
  sm.go('Playing');
  const seed = newSeed();
  game.start(seed, config.sim);
  stats.runs++;
  log('run.started', `seed ${hex(seed)}, config v${config.version}`);
}
function finishRun() {
  sm.go('GameOver');
  stats.finished++; stats.heights += lastScore;
  const showInterstitial = policy.onGameOver(rewardedThisRun);
  log('run.finished', `height ${lastScore}, ${game.recording.inputs.length} inputs, hash ${hex(game.sim.hash())}`);
  rewardedThisRun = false;
  if (showInterstitial) runAd('interstitial', 3, () => { stats.interstitials++; policy.onInterstitialShown(); gameOverScreen(); });
  else gameOverScreen();
}

$('startbtn').onclick = play;
$('againbtn').onclick = guard('play again', play);
$('replaybtn').onclick = guard('watch replay', () => { hideAll(); game.startReplay(); log('replay.started', `${game.recording.inputs.length} inputs`); });
$('contyes').onclick = guard('watch ad', () => runAd('rewarded', 5, () => {
  stats.accepted++; rewardedThisRun = true; hideAll(); sm.go('Playing'); game.continueRun(); log('run.continued', `tick ${game.sim.tick}`);
}));
$('contno').onclick = guard('no thanks', () => { hideAll(); finishRun(); });
$('mute').onclick = () => {
  game.sfx.muted = !game.sfx.muted; $('mute').setAttribute('aria-pressed', String(game.sfx.muted));
  $('mute').textContent = game.sfx.muted ? '🔇' : '🔊';
};

$('cv').addEventListener('pointerdown', (e) => { e.preventDefault(); if (sm.current === 'Playing') game.drop(); });
document.addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'Enter') && sm.current === 'Playing' && !$('play').hidden && e.target === document.body) { e.preventDefault(); game.drop(); }
});

// ---------- purchases ----------
$('buyopen').onclick = guard('remove ads', () => { show('sheet'); $('sheetmsg').textContent = ''; $('buybtn').disabled = false; log('iap.sheet.opened', 'remove_ads'); });
$('sheetcancel').onclick = () => { log('iap.purchase.cancelled'); gameOverScreen(); };
$('buybtn').onclick = guard('buy', () => {
  $('buybtn').disabled = true; $('sheetmsg').textContent = 'Processing…';
  setTimeout(() => {
    purchases.owned.add('remove_ads'); purchases.receipts.add('remove_ads'); purchases.save();
    policy.removeAdsOwned = true; stats.purchases++;
    log('iap.purchase.completed', 'remove_ads, interstitials off'); gameOverScreen();
  }, 900);
});
$('restore').onclick = guard('restore', () => {
  purchases.receipts.forEach((id) => purchases.owned.add(id)); purchases.save();
  policy.removeAdsOwned = purchases.isOwned('remove_ads');
  log('iap.restore', purchases.receipts.size ? [...purchases.receipts].join(', ') : 'nothing to restore'); gameOverScreen();
});
$('reinstall').onclick = () => {
  purchases.owned.clear(); purchases.save(); policy.removeAdsOwned = false;
  log('dev.reinstall', 'local purchases wiped, store receipts kept');
  if (sm.current === 'GameOver' && !$('over').hidden) gameOverScreen();
};
$('stress').onchange = (e) => { game.stress = e.target.checked; log('dev.stress', e.target.checked ? 'on: +26 ms per frame' : 'off'); };

// ---------- live tuning ----------
const sliders = [
  ['t-speed', 'sim', 'speed0', (v) => `${v} u/s`],
  ['t-tol', 'sim', 'tolerance', (v) => `±${v} u`],
  ['t-gap', 'ads', 'gamesBetween', (v) => `${v} games`],
];
function syncSliders() { sliders.forEach(([id, grp, key, fmt]) => { $(id).value = config[grp][key]; $(id + 'v').textContent = fmt(config[grp][key]); }); $('cfgsrc').textContent = `v${config.version} · ${configSource}`; }
sliders.forEach(([id, grp, key, fmt]) => {
  $(id).addEventListener('input', () => {
    const v = parseFloat($(id).value); config[grp][key] = v; $(id + 'v').textContent = fmt(v);
    if (grp === 'ads') policy.gamesBetween = v;
  });
  $(id).addEventListener('change', () => { config.version++; configSource = 'edited live'; syncSliders(); log('config.changed', `${key} = ${config[grp][key]}, applies from next run`); });
});
fetch('/config.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => {
  config = j; configSource = 'loaded from config.json';
  policy.minGamesBeforeFirst = j.ads.minGamesBeforeFirst; policy.gamesBetween = j.ads.gamesBetween;
  syncSliders(); log('config.loaded', `v${j.version}`);
}).catch(() => syncSliders());

// ---------- dev panel ----------
const fg = $('fgraph'), fgc = fg.getContext('2d');
function drawGraph() {
  const w = fg.width, h = fg.height, n = game.frameMs.length; fgc.clearRect(0, 0, w, h);
  const y = (ms) => h - Math.min(ms, 50) / 50 * h;
  for (let i = 0; i < n; i++) {
    const ms = game.frameMs[(game.fi + 1 + i) % n];
    fgc.fillStyle = ms < 18 ? '#4E9A4F' : ms < 30 ? '#D9A21B' : '#E8505B';
    fgc.fillRect(i * (w / n), y(ms), w / n - 0.5, h - y(ms));
  }
  fgc.strokeStyle = 'rgba(30,36,48,.35)'; fgc.setLineDash([4, 4]);
  [16.7, 33.3].forEach((ms) => { fgc.beginPath(); fgc.moveTo(0, y(ms)); fgc.lineTo(w, y(ms)); fgc.stroke(); });
  fgc.setLineDash([]);
}
setInterval(() => {
  const s = game.sim, avg = Array.from(game.frameMs).reduce((a, b) => a + b, 0) / game.frameMs.length;
  $('d-fps').textContent = Math.round(game.fps); $('d-ms').textContent = avg.toFixed(1) + ' ms';
  $('d-q').textContent = game.quality === 'high' ? 'High (2x)' : 'Low (1x, no particles)';
  $('d-debris').textContent = `${game.debris.active}/${game.debris.items.length}`;
  $('d-part').textContent = `${game.particles.active}/${game.particles.items.length}`;
  $('d-state').textContent = sm.current + (game.mode === 'replay' ? ' (replaying)' : '');
  $('d-seed').textContent = game.seed ? hex(game.seed) : '-';
  $('d-tick').textContent = `${s.tick} @ ${s.config.tickRate} Hz`;
  $('d-height').textContent = s.height; $('d-combo').textContent = s.combo;
  $('d-inputs').textContent = game.recording ? game.recording.inputs.length : 0;
  $('d-hash').textContent = hex(s.hash());
  $('a-runs').textContent = stats.runs;
  $('a-avg').textContent = stats.finished ? (stats.heights / stats.finished).toFixed(1) : '-';
  $('a-perfect').textContent = stats.drops ? Math.round(stats.perfects / stats.drops * 100) + '%' : '-';
  $('a-cont').textContent = stats.offers ? `${stats.accepted}/${stats.offers}` : '-';
  $('a-int').textContent = stats.interstitials; $('a-buy').textContent = stats.purchases;
  $('a-since').textContent = policy.gamesSinceInterstitial; $('a-noads').textContent = policy.removeAdsOwned ? 'owned' : 'no';
  drawGraph();
}, 250);

document.querySelector('.devtabs').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('.devtabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('.devpane').forEach((p) => (p.hidden = p.id !== b.dataset.pane));
});

$('menubest').textContent = best; show('menu');
log('app.started', purchases.isOwned('remove_ads') ? 'remove_ads owned' : 'ads on');

// ---------- page tabs ----------
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[role=tab]'); if (!b) return;
  document.querySelectorAll('.tabs [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
  document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.id !== b.dataset.tab));
  if (b.dataset.tab === 'code' && !codeLoaded) loadCode(document.querySelector('.files button'));
});

// ---------- code viewer ----------
let codeLoaded = false;
const TOKENS = /(\/\/.*$)|(\$?&quot;.*?&quot;)|(\[(?:Test|TestFixture|SerializeField|RequireComponent\(typeof\(\w+\)\))\])|\b(using|namespace|public|private|static|readonly|sealed|class|struct|enum|interface|void|bool|int|uint|long|double|float|string|var|new|return|if|else|for|foreach|while|throw|event|const|get|set|in|true|false|null|override|this|unchecked)\b/gm;
function highlight(src) {
  return esc(src).replace(TOKENS, (m, cm, st, at, kw) =>
    cm ? `<span class="cm">${cm}</span>` : st ? `<span class="st">${st}</span>` : at ? `<span class="at">${at}</span>` : `<span class="kw">${kw}</span>`);
}
async function loadCode(btn) {
  document.querySelectorAll('.files button').forEach((x) => x.setAttribute('aria-current', String(x === btn)));
  $('codename').textContent = btn.dataset.file;
  try { const r = await fetch('/' + btn.dataset.file); if (!r.ok) throw new Error(r.status); $('codebody').innerHTML = highlight(await r.text()); codeLoaded = true; }
  catch { $('codebody').textContent = 'Could not load this file. It is in the repo at ' + btn.dataset.file; }
}
document.querySelector('.files').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) loadCode(b); });

// ---------- balance check ----------
$('balance').onclick = () => {
  $('balance').disabled = true; $('btime').textContent = 'Running…';
  setTimeout(() => {
    const t = performance.now(), r = balanceCheck(config.sim, { games: 200, seed: 7 }), ms = performance.now() - t;
    $('btable').innerHTML = '<tr><th></th><th>Avg height</th><th>Median</th><th>Top 10%</th><th>Perfects</th></tr>' +
      Object.entries(r).map(([k, v]) => `<tr><th>${k}</th><td>${v.avg.toFixed(1)}</td><td>${v.median}</td><td>${v.p90}</td><td>${Math.round(v.perfectRate * 100)}%</td></tr>`).join('');
    $('btime').textContent = `400 games at config v${config.version}, simulated in ${Math.round(ms)} ms`;
    log('balance.check', `casual ${r.Casual.avg.toFixed(1)}, skilled ${r.Skilled.avg.toFixed(1)}`);
    $('balance').disabled = false;
  }, 30);
};

// ---------- demo bot: same aiming logic as the balancing bots ----------
let botOn = false, botAim = 0;
const botRnd = mulberry32(12345);
const gauss = () => Math.sqrt(-2 * Math.log(1 - botRnd())) * Math.cos(2 * Math.PI * botRnd());
$('bot').onchange = (e) => { botOn = e.target.checked; botAim = gauss() * 3; log('dev.bot', botOn ? 'on' : 'off'); };
(function botLoop() {
  if (botOn && sm.current === 'Playing' && game.mode === 'live' && game.sim.moving) {
    const s = game.sim, x = s.axis === 'x', d = x ? s.moving.x - s.top.x : s.moving.z - s.top.z;
    if (Math.abs(d - botAim) <= s.speed / s.config.tickRate) { game.drop(); botAim = gauss() * 3; }
  }
  requestAnimationFrame(botLoop);
})();
