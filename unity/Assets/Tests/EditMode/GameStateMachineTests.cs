using System;
using System.Collections.Generic;
using NUnit.Framework;
using StackDrop.Core;

namespace StackDrop.Tests
{
    [TestFixture]
    public class GameStateMachineTests
    {
        [Test]
        public void FullRunWithAContinueIsLegal()
        {
            var sm = new GameStateMachine();
            var seen = new List<string>();
            sm.Changed += (from, to) => seen.Add(from + ">" + to);
            sm.Go(GameState.Playing);
            sm.Go(GameState.ContinueOffer);
            sm.Go(GameState.Playing);
            sm.Go(GameState.GameOver);
            sm.Go(GameState.Playing);
            Assert.AreEqual(5, seen.Count);
            Assert.AreEqual("ContinueOffer>Playing", seen[2]);
        }

        [Test]
        public void SkippingStatesThrows()
        {
            var sm = new GameStateMachine();
            Assert.Throws<InvalidOperationException>(() => sm.Go(GameState.GameOver));
            sm.Go(GameState.Playing);
            sm.Go(GameState.GameOver);
            Assert.Throws<InvalidOperationException>(() => sm.Go(GameState.ContinueOffer));
        }
    }
}
