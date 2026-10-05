using System;
using NUnit.Framework;
using StackDrop.Core;

namespace StackDrop.Tests
{
    [TestFixture]
    public class StackMathTests
    {
        const float Tol = 4f;

        [Test]
        public void DropWithinToleranceIsPerfectAndSnaps()
        {
            var r = StackMath.Resolve(prevX: 50, prevWidth: 100, x: 53, width: 100, perfectTolerance: Tol);
            Assert.AreEqual(DropOutcome.Perfect, r.Outcome);
            Assert.AreEqual(50, r.X, 0.001);
            Assert.AreEqual(100, r.Width, 0.001);
            Assert.AreEqual(0, r.SliceWidth, 0.001);
        }

        [Test]
        public void OvershootRightTrimsTheRightOverhang()
        {
            var r = StackMath.Resolve(0, 100, 30, 100, Tol);
            Assert.AreEqual(DropOutcome.Trimmed, r.Outcome);
            Assert.AreEqual(30, r.X, 0.001);
            Assert.AreEqual(70, r.Width, 0.001);
            Assert.AreEqual(100, r.SliceX, 0.001);
            Assert.AreEqual(30, r.SliceWidth, 0.001);
        }

        [Test]
        public void OvershootLeftTrimsTheLeftOverhang()
        {
            var r = StackMath.Resolve(0, 100, -20, 100, Tol);
            Assert.AreEqual(DropOutcome.Trimmed, r.Outcome);
            Assert.AreEqual(0, r.X, 0.001);
            Assert.AreEqual(80, r.Width, 0.001);
            Assert.AreEqual(-20, r.SliceX, 0.001);
            Assert.AreEqual(20, r.SliceWidth, 0.001);
        }

        [Test]
        public void NoOverlapIsAMiss()
        {
            var r = StackMath.Resolve(0, 100, 120, 100, Tol);
            Assert.AreEqual(DropOutcome.Missed, r.Outcome);
            Assert.AreEqual(0, r.Width, 0.001);
        }

        [Test]
        public void WidthIsAlwaysConservedAcrossRandomDrops()
        {
            var rnd = new Random(7);
            for (int i = 0; i < 5000; i++)
            {
                float prevX = rnd.Next(-200, 200), prevW = rnd.Next(10, 200);
                float x = rnd.Next(-400, 400), w = rnd.Next(10, 200);
                var r = StackMath.Resolve(prevX, prevW, x, w, Tol);
                if (r.Outcome == DropOutcome.Trimmed)
                {
                    Assert.AreEqual(w, r.Width + r.SliceWidth, 0.001);
                    Assert.IsTrue(r.X >= prevX - 0.001 && r.X + r.Width <= prevX + prevW + 0.001);
                }
            }
        }

        [Test]
        public void ComboGrowsTheBlockButNeverPastTheBase()
        {
            Assert.AreEqual(80, StackMath.GrowAfterCombo(80, combo: 2, comboToGrow: 3, growBy: 8, maxWidth: 200), 0.001);
            Assert.AreEqual(88, StackMath.GrowAfterCombo(80, 3, 3, 8, 200), 0.001);
            Assert.AreEqual(200, StackMath.GrowAfterCombo(196, 5, 3, 8, 200), 0.001);
        }

        [Test]
        public void ZeroWidthIsRejected()
        {
            Assert.Throws<ArgumentException>(() => StackMath.Resolve(0, 0, 0, 10, Tol));
        }
    }
}
