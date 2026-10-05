using System.Collections.Generic;
using NUnit.Framework;
using StackDrop.Core;

namespace StackDrop.Tests
{
    [TestFixture]
    public class PurchaseTests
    {
        [Test]
        public void CancelledPurchaseGrantsNothing()
        {
            var store = new MockPurchaseService { NextResult = PurchaseStatus.Cancelled };
            PurchaseStatus got = PurchaseStatus.Failed;
            store.Purchase(Products.RemoveAds, s => got = s);
            Assert.AreEqual(PurchaseStatus.Cancelled, got);
            Assert.IsFalse(store.IsOwned(Products.RemoveAds));
        }

        [Test]
        public void RestoreAfterReinstallBringsRemoveAdsBack()
        {
            var receipts = new HashSet<string>();
            var firstInstall = new MockPurchaseService(receipts);
            firstInstall.Purchase(Products.RemoveAds, _ => { });

            var reinstall = new MockPurchaseService(receipts); // same store account, fresh app
            Assert.IsFalse(reinstall.IsOwned(Products.RemoveAds));
            reinstall.RestorePurchases(_ => { });
            Assert.IsTrue(reinstall.IsOwned(Products.RemoveAds));
        }
    }
}
