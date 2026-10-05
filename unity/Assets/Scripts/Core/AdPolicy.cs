namespace StackDrop.Core
{
    /// <summary>
    /// Decides when an interstitial may show. Kept in one class with tests, so a client
    /// asking for "fewer ads" is a one-number change, not a hunt through the game code.
    /// </summary>
    public sealed class AdPolicy
    {
        public int MinGamesBeforeFirst { get; }
        public int GamesBetween { get; }
        public bool RemoveAdsOwned { get; private set; }

        public int GamesPlayed { get; private set; }
        public int GamesSinceInterstitial { get; private set; }

        public AdPolicy(int minGamesBeforeFirst = 2, int gamesBetween = 3)
        {
            MinGamesBeforeFirst = minGamesBeforeFirst;
            GamesBetween = gamesBetween;
            GamesSinceInterstitial = gamesBetween; // first eligible game can show one
        }

        /// <summary>Call once per finished run. Returns true if an interstitial should show now.</summary>
        public bool OnGameOver(bool watchedRewardedThisRun)
        {
            GamesPlayed++;
            GamesSinceInterstitial++;
            if (RemoveAdsOwned) return false;
            if (watchedRewardedThisRun) return false;          // never stack a forced ad on a chosen one
            if (GamesPlayed < MinGamesBeforeFirst) return false; // let new players play first
            return GamesSinceInterstitial > GamesBetween;
        }

        public void OnInterstitialShown() => GamesSinceInterstitial = 0;

        public void SetRemoveAdsOwned(bool owned) => RemoveAdsOwned = owned;
    }
}
