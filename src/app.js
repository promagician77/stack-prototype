import { Game } from './game.js';
import { AdPolicy, GameStateMachine } from './core.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------- services (mock adapters; the Unity build swaps in LevelPlay/AdMob and Unity IAP) ----------
const purchases = {
  owned: new Set(store.get('sd_owned', [])),
  receipts: new Set(store.get('sd_receipts', [])), // what the store account remembers across reinstalls
  save() { store.set('sd_owned', [...this.owned]); store.set('sd_receipts', [...this.receipts]); },
  isOwned(id) { return this.owned.has(id); },
};
const policy = new AdPolicy(2, 3);
policy.removeAdsOwned = purchases.isOwned('remove_ads');
const sm = new GameStateMachine();
let rewardedThisRun = false, best = store.get('sd_best', 0), lastScore = 0;

// ---------- dev panel ----------
const events = [];
function log(name, detail = '') {
  events.unshift({ t: new Date().toLocaleTimeString('en-GB'), name, detail });
  events.length = Math.min(events.length, 14);
  $('ev').innerHTML = events.map((e) => `<li><span>${e.t}</span><b>${esc(e.name)}</b>${e.detail ? ` <em>${esc(e.detail)}</em>` : ''}</li>`).join('');
}
sm.onChange((a, b) => log('state', `${a} → ${b}`));

// ---------- overlays ----------
// Overlay buttons ignore taps for a moment after appearing. A player tapping fast to stack
// must never hit "Watch ad" or "Buy" by accident - accidental ad clicks are an ad-policy risk.
let shownAt = 0;
const GUARD_MS = 700;
function show(id) { shownAt = performance.now(); document.querySelectorAll('.ov').forEach((o) => (o.hidden = o.id !== id)); }
const guard = (name, fn) => () => {
  if (performance.now() - shownAt < GUARD_MS) { log('input.ignored', `${name} tapped too soon`); return; }
  fn();
};
function hideAll() { document.querySelectorAll('.ov').forEach((o) => (o.hidden = true)); }

function runAd(kind, seconds, done) {
  show('ad');
  $('adkind').textContent = kind === 'rewarded' ? 'Rewarded ad (test)' : 'Interstitial ad (test)';
  $('adnote').textContent = kind === 'rewarded' ? 'Watch to the end to continue your run.' : 'Shown at most once every few games.';
  $('adclose').hidden = true;
  log(`ad.${kind}.shown`);
  let left = seconds;
  $('adtimer').textContent = left;
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
  $('buyrow').hidden = purchases.isOwned('remove_ads');
  $('ownedrow').hidden = !purchases.isOwned('remove_ads');
  show('over');
}

// ---------- game ----------
const game = new Game($('cv'), {
  onEvent: (name, detail) => log(name, detail),
  onFail: (score) => {
    lastScore = score;
    if (!rewardedThisRun) { sm.go('ContinueOffer'); show('cont'); return; }
    finishRun();
  },
});

function finishRun() {
  sm.go('GameOver');
  const showInterstitial = policy.onGameOver(rewardedThisRun);
  log('run.finished', `score ${lastScore}${showInterstitial ? ', interstitial due' : ''}`);
  rewardedThisRun = false;
  if (showInterstitial) runAd('interstitial', 3, () => { policy.onInterstitialShown(); gameOverScreen(); });
  else gameOverScreen();
}

function play() {
  hideAll();
  sm.go('Playing');
  game.start();
}

$('startbtn').onclick = play;
$('againbtn').onclick = guard('play again', play);
$('contyes').onclick = guard('watch ad', () => runAd('rewarded', 5, () => { rewardedThisRun = true; hideAll(); sm.go('Playing'); game.resume(); }));
$('contno').onclick = guard('no thanks', () => { hideAll(); finishRun(); });

$('cv').addEventListener('pointerdown', (e) => { e.preventDefault(); if (sm.current === 'Playing') game.drop(); });
document.addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'Enter') && sm.current === 'Playing' && !$('play').hidden) { e.preventDefault(); game.drop(); }
});

// ---------- purchases ----------
function openStore() { show('sheet'); $('sheetmsg').textContent = ''; $('buybtn').disabled = false; log('iap.sheet.opened', 'remove_ads'); }
$('buyopen').onclick = guard('remove ads', openStore);
$('sheetcancel').onclick = () => { log('iap.purchase.cancelled'); gameOverScreen(); };
$('buybtn').onclick = guard('buy', () => {
  $('buybtn').disabled = true; $('sheetmsg').textContent = 'Processing…';
  setTimeout(() => {
    purchases.owned.add('remove_ads'); purchases.receipts.add('remove_ads'); purchases.save();
    policy.removeAdsOwned = true;
    log('iap.purchase.completed', 'remove_ads, interstitials off');
    gameOverScreen();
  }, 900);
});
$('restore').onclick = () => {
  purchases.receipts.forEach((id) => purchases.owned.add(id)); purchases.save();
  policy.removeAdsOwned = purchases.isOwned('remove_ads');
  log('iap.restore', purchases.receipts.size ? [...purchases.receipts].join(', ') : 'nothing to restore');
  gameOverScreen();
};
$('reinstall').onclick = () => {
  purchases.owned.clear(); purchases.save(); policy.removeAdsOwned = false;
  log('dev.reinstall', 'local purchases wiped, store receipts kept');
  if (sm.current === 'GameOver') gameOverScreen();
};

// ---------- dev stats ----------
setInterval(() => {
  $('d-fps').textContent = Math.round(game.fps);
  $('d-state').textContent = sm.current;
  $('d-height').textContent = game.height;
  $('d-combo').textContent = game.combo;
  $('d-debris').textContent = `${game.debris.active} / ${game.debris.items.length}`;
  $('d-part').textContent = `${game.particles.active} / ${game.particles.items.length}`;
  $('d-games').textContent = policy.gamesPlayed;
  $('d-since').textContent = policy.gamesSinceInterstitial;
  $('d-noads').textContent = policy.removeAdsOwned ? 'owned' : 'no';
}, 200);

$('menubest').textContent = best;
show('menu');
log('app.started', purchases.isOwned('remove_ads') ? 'remove_ads owned' : 'ads on');

// ---------- tabs ----------
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[role=tab]'); if (!b) return;
  document.querySelectorAll('.tabs [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
  document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.id !== b.dataset.tab));
  if (b.dataset.tab === 'code' && !codeLoaded) loadCode(document.querySelector('.files button'));
});

// ---------- code viewer (reads the real files in this repo) ----------
let codeLoaded = false;
// One pass over the escaped source, so a match is never re-highlighted by a later rule.
const TOKENS = /(\/\/.*$)|(\$?&quot;.*?&quot;)|(\[(?:Test|TestFixture|SerializeField)\])|\b(using|namespace|public|private|static|readonly|sealed|class|struct|enum|interface|void|bool|int|float|string|var|new|return|if|else|for|foreach|throw|event|const|get|set|in|true|false|null|override|this)\b/gm;
function highlight(src) {
  return esc(src).replace(TOKENS, (m, cm, st, at, kw) =>
    cm ? `<span class="cm">${cm}</span>` : st ? `<span class="st">${st}</span>` : at ? `<span class="at">${at}</span>` : `<span class="kw">${kw}</span>`);
}
async function loadCode(btn) {
  document.querySelectorAll('.files button').forEach((x) => x.setAttribute('aria-current', String(x === btn)));
  $('codename').textContent = btn.dataset.file;
  try {
    const r = await fetch('/' + btn.dataset.file); if (!r.ok) throw new Error(r.status);
    $('codebody').innerHTML = highlight(await r.text()); codeLoaded = true;
  } catch { $('codebody').textContent = 'Could not load this file. It is in the repo at ' + btn.dataset.file; }
}
document.querySelector('.files').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) loadCode(b); });
