using System;
using System.Collections.Generic;

namespace StackDrop.Core
{
    /// <summary>
    /// Gameplay talks to these interfaces only. Each client project plugs in its own ad
    /// network (LevelPlay, AdMob, AppLovin MAX) or store setup without touching game code.
    /// </summary>
    public interface IAdsService
    {
        bool IsRewardedReady { get; }
        void ShowRewarded(Action<bool> onFinished);  // true = reward earned
        void ShowInterstitial(Action onClosed);
    }

    public enum PurchaseStatus { Purchased, Cancelled, Failed }

    public interface IPurchaseService
    {
        bool IsOwned(string productId);
        void Purchase(string productId, Action<PurchaseStatus> onResult);
        void RestorePurchases(Action<IReadOnlyList<string>> onRestored);
    }

    public static class Products
    {
        public const string RemoveAds = "remove_ads";
    }

    /// <summary>Editor and test stand-in. Real adapters live in Game/Adapters per project.</summary>
    public sealed class MockAdsService : IAdsService
    {
        public bool RewardedFills = true;
        public int InterstitialsShown { get; private set; }
        public bool IsRewardedReady => RewardedFills;
        public void ShowRewarded(Action<bool> onFinished) => onFinished(RewardedFills);
        public void ShowInterstitial(Action onClosed) { InterstitialsShown++; onClosed(); }
    }

    public sealed class MockPurchaseService : IPurchaseService
    {
        readonly HashSet<string> _owned = new HashSet<string>();
        readonly HashSet<string> _storeReceipts; // what the store remembers across reinstalls
        public PurchaseStatus NextResult = PurchaseStatus.Purchased;

        public MockPurchaseService(HashSet<string> storeReceipts = null)
        {
            _storeReceipts = storeReceipts ?? new HashSet<string>();
        }

        public bool IsOwned(string productId) => _owned.Contains(productId);

        public void Purchase(string productId, Action<PurchaseStatus> onResult)
        {
            if (NextResult == PurchaseStatus.Purchased) { _owned.Add(productId); _storeReceipts.Add(productId); }
            onResult(NextResult);
        }

        public void RestorePurchases(Action<IReadOnlyList<string>> onRestored)
        {
            foreach (var id in _storeReceipts) _owned.Add(id);
            onRestored(new List<string>(_storeReceipts));
        }
    }
}
