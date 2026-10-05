using System;
using NUnit.Framework;
using StackDrop.Core;

namespace StackDrop.Tests
{
    [TestFixture]
    public class SimulationTests
    {
        // Same bot as parityRun() in src/sim.js.
        static StackSimulation ParityRun(uint seed, int totalDrops = 40, Replay record = null)
        {
            var sim = new StackSimulation(seed);
            int drops = 0; bool continued = false;
            for (int guard = 0; guard < 500000; guard++)
            {
                if (sim.Over)
                {
                    if (continued) break;
                    record?.Record(sim.Tick, InputKind.Continue);
                    sim.Continue(); continued = true; continue;
                }
                sim.Step();
                bool x = sim.MovingAxis == Axis.X;
                var top = sim.Tower[sim.Tower.Count - 1]; var m = sim.Moving;
                double delta = x ? m.X - top.X : m.Z - top.Z, size = x ? top.W : top.D;
                string want = drops == 24 && !continued ? "miss" : drops % 3 == 2 ? "trim" : "perfect";
                bool hit = want == "perfect" ? Math.Abs(delta) <= 1.0
                         : want == "trim" ? delta >= 8 && delta <= 12
                         : Math.Abs(delta) >= size + 5;
                if (hit)
                {
                    record?.Record(sim.Tick, InputKind.Drop);
                    sim.Drop(); drops++;
                    if (drops >= totalDrops) break;
                }
            }
            return sim;
        }

        [Test]
        public void RandomMatchesTheJavaScriptPortBitForBit()
        {
            var r = new DeterministicRandom(42);
            Assert.AreEqual(0.601103751920164, r.NextDouble(), 1e-15);
            Assert.AreEqual(0.448290558997542, r.NextDouble(), 1e-15);
            Assert.AreEqual(0.852465793490410, r.NextDouble(), 1e-15);
        }

        [Test]
        public void SameSeedAndInputsGiveTheSameTowerInCSharpAndJavaScript()
        {
            var sim = ParityRun(2026);
            Assert.AreEqual(39, sim.Height);
            Assert.AreEqual(4395, sim.Tick);
            Assert.AreEqual(1933281413u, sim.Hash());   // value produced by src/sim.js
        }

        [Test]
        public void ReplayRebuildsTheLiveRunExactly()
        {
            var replay = new Replay { Seed = 99 };
            var live = ParityRun(99, 40, replay);
            var rebuilt = replay.Play();
            Assert.AreEqual(live.Hash(), rebuilt.Hash());
            Assert.AreEqual(live.Height, rebuilt.Height);
        }

        [Test]
        public void DifferentSeedsGiveDifferentGames()
        {
            Assert.IsTrue(ParityRun(1).Hash() != ParityRun(2).Hash());
        }

        [Test]
        public void BlocksNeverGrowPastTheBaseOrVanishAcross200Seeds()
        {
            for (uint seed = 1; seed <= 200; seed++)
            {
                var sim = ParityRun(seed);
                for (int i = 0; i < sim.Tower.Count; i++)
                {
                    var b = sim.Tower[i];
                    Assert.IsTrue(b.W > 0 && b.W <= 100.000001 && b.D > 0 && b.D <= 100.000001);
                    Assert.AreEqual(i, b.Level);
                }
                Assert.AreEqual(sim.Tower.Count - 1, sim.Height);
            }
        }

        [Test]
        public void DroppingAfterTheRunEndedThrows()
        {
            var sim = new StackSimulation(5);
            for (int i = 0; i < 400 && !sim.Over; i++) { sim.Step(); if (Math.Abs(sim.Moving.X - sim.Tower[0].X) > 120) sim.Drop(); }
            Assert.IsTrue(sim.Over);
            Assert.Throws<InvalidOperationException>(() => sim.Drop());
        }
    }
}
