using UnityEngine;
using StackDrop.Core;

namespace StackDrop.Game
{
    /// <summary>
    /// The only place that knows about ads and purchases. Swapping LevelPlay for AdMob on the
    /// next client project means a new IAdsService adapter, not edits across the game.
    /// </summary>
    public sealed class MonetizationController : MonoBehaviour
    {
        readonly AdPolicy _policy = new AdPolicy(minGamesBeforeFirst: 2, gamesBetween: 3);
        IAdsService _ads;
        IPurchaseService _store;
        bool _rewardedThisRun;

        public void Init(IAdsService ads, IPurchaseService store)
        {
            _ads = ads; _store = store;
            _policy.SetRemoveAdsOwned(_store.IsOwned(Products.RemoveAds));
        }

        public bool CanOfferContinue => !_rewardedThisRun && _ads.IsRewardedReady;

        public void OfferContinue(System.Action<bool> onDone)
        {
            _ads.ShowRewarded(earned =>
            {
                if (earned) _rewardedThisRun = true;
                onDone(earned);
            });
        }

        public void OnRunFinished(System.Action proceed)
        {
            bool show = _policy.OnGameOver(_rewardedThisRun);
            _rewardedThisRun = false;
            if (!show) { proceed(); return; }
            _ads.ShowInterstitial(() => { _policy.OnInterstitialShown(); proceed(); });
        }

        public void BuyRemoveAds() =>
            _store.Purchase(Products.RemoveAds, status =>
            {
                if (status == PurchaseStatus.Purchased) _policy.SetRemoveAdsOwned(true);
            });

        public void Restore() =>
            _store.RestorePurchases(ids => _policy.SetRemoveAdsOwned(_store.IsOwned(Products.RemoveAds)));
    }
}
