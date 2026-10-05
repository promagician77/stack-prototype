// Direct port of unity/Assets/Scripts/Core (StackMath, AdPolicy, GameStateMachine).
// Same numbers, same rules, same tests - so the browser build behaves like the Unity one.

export const Outcome = { Perfect: 'Perfect', Trimmed: 'Trimmed', Missed: 'Missed' };

export function resolveDrop(prevX, prevW, x, w, tol) {
  if (prevW <= 0 || w <= 0) throw new Error('Widths must be positive.');
  const delta = x - prevX;
  if (Math.abs(delta) <= tol) return { outcome: Outcome.Perfect, x: prevX, width: w, sliceX: 0, sliceWidth: 0 };
  const left = Math.max(prevX, x), right = Math.min(prevX + prevW, x + w), overlap = right - left;
  if (overlap <= 0) return { outcome: Outcome.Missed, x, width: 0, sliceX: x, sliceWidth: w };
  return { outcome: Outcome.Trimmed, x: left, width: overlap, sliceX: delta > 0 ? right : x, sliceWidth: w - overlap };
}

export function growAfterCombo(w, combo, comboToGrow, growBy, maxW) {
  return combo < comboToGrow ? w : Math.min(maxW, w + growBy);
}

export class AdPolicy {
  constructor(minGamesBeforeFirst = 2, gamesBetween = 3) {
    this.minGamesBeforeFirst = minGamesBeforeFirst; this.gamesBetween = gamesBetween;
    this.removeAdsOwned = false; this.gamesPlayed = 0; this.gamesSinceInterstitial = gamesBetween;
  }
  onGameOver(watchedRewardedThisRun) {
    this.gamesPlayed++; this.gamesSinceInterstitial++;
    if (this.removeAdsOwned || watchedRewardedThisRun || this.gamesPlayed < this.minGamesBeforeFirst) return false;
    return this.gamesSinceInterstitial > this.gamesBetween;
  }
  onInterstitialShown() { this.gamesSinceInterstitial = 0; }
}

const ALLOWED = { Menu: ['Playing'], Playing: ['ContinueOffer', 'GameOver'], ContinueOffer: ['Playing', 'GameOver'], GameOver: ['Playing', 'Menu'] };
export class GameStateMachine {
  constructor() { this.current = 'Menu'; this.listeners = []; }
  canGo(next) { return ALLOWED[this.current].includes(next); }
  go(next) {
    if (!this.canGo(next)) throw new Error(`Illegal transition ${this.current} -> ${next}`);
    const prev = this.current; this.current = next; this.listeners.forEach((f) => f(prev, next));
  }
  onChange(f) { this.listeners.push(f); }
}
