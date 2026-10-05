using System;
using UnityEngine;
using StackDrop.Core;

namespace StackDrop.Game
{
    /// <summary>
    /// Drives the headless StackSimulation at a fixed 120 Hz, independent of frame rate,
    /// and records every input so any run can be replayed exactly.
    /// </summary>
    public sealed class SimulationRunner : MonoBehaviour
    {
        [SerializeField] StackView view;
        [SerializeField] int maxCatchUpTicks = 8;   // avoids a "spiral of death" after a long hitch

        public StackSimulation Sim { get; private set; }
        public Replay Recording { get; private set; }
        public event Action<DropResult, int> Dropped;
        public event Action Failed;

        double _accumulator;

        public void StartRun(uint seed, SimConfig config)
        {
            Sim = new StackSimulation(seed, config);
            Recording = new Replay { Seed = seed };
            _accumulator = 0;
            view.Rebuild(Sim);
        }

        public void Continue()
        {
            Recording.Record(Sim.Tick, InputKind.Continue);
            Sim.Continue();
            view.OnContinue();
        }

        void Update()
        {
            if (Sim == null) return;

            if (!Sim.Over && Input.GetMouseButtonDown(0))
            {
                Recording.Record(Sim.Tick, InputKind.Drop);
                var dropped = Sim.Moving; var axis = Sim.MovingAxis;   // captured before the next block spawns
                var r = Sim.Drop();
                view.OnDrop(Sim, r, dropped, axis);
                if (Sim.Over) Failed?.Invoke(); else Dropped?.Invoke(r, Sim.Combo);
            }

            double dt = 1.0 / Sim.Config.TickRate;
            _accumulator += Time.unscaledDeltaTime;
            int ticks = 0;
            while (_accumulator >= dt && ticks++ < maxCatchUpTicks) { Sim.Step(); _accumulator -= dt; }
            if (ticks > maxCatchUpTicks) _accumulator = 0;

            view.Render(Sim);
        }
    }
}
