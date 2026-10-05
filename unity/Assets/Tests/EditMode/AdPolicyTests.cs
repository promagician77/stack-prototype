using NUnit.Framework;
using StackDrop.Core;

namespace StackDrop.Tests
{
    [TestFixture]
    public class AdPolicyTests
    {
        [Test]
        public void FirstGameNeverShowsAnInterstitial()
        {
            var p = new AdPolicy(minGamesBeforeFirst: 2, gamesBetween: 3);
            Assert.IsFalse(p.OnGameOver(false));
        }

        [Test]
        public void ShowsOnGameTwoThenLeavesThreeCleanGames()
        {
            var p = new AdPolicy(2, 3);
            var shown = "";
            for (int game = 1; game <= 10; game++)
            {
                bool show = p.OnGameOver(false);
                if (show) { p.OnInterstitialShown(); shown += game + " "; }
            }
            Assert.AreEqual("2 6 10 ", shown);
        }

        [Test]
        public void NeverAfterThePlayerChoseARewardedAd()
        {
            var p = new AdPolicy(2, 3);
            p.OnGameOver(false);
            Assert.IsFalse(p.OnGameOver(watchedRewardedThisRun: true));
        }

        [Test]
        public void RemoveAdsTurnsInterstitialsOffForGood()
        {
            var p = new AdPolicy(2, 3);
            p.SetRemoveAdsOwned(true);
            for (int i = 0; i < 20; i++) Assert.IsFalse(p.OnGameOver(false));
        }
    }
}
