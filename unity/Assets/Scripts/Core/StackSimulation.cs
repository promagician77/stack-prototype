using System;
using System.Collections.Generic;

namespace StackDrop.Core
{
    /// <summary>Tunable numbers. In Unity this is filled from a ScriptableObject or Remote Config.</summary>
    public sealed class SimConfig
    {
        public double BaseSize = 100, BlockHeight = 20, Range = 150;
        public double Speed0 = 110, SpeedPerLevel = 3.2, SpeedMax = 300;
        public double Tolerance = 3.5, GrowBy = 6;
        public int ComboToGrow = 3, TickRate = 120;
    }

    public enum Axis { X, Z }

    public struct Box { public double X, Z, W, D; public int Level; }

    /// <summary>
    /// The whole game rule set as a headless, fixed-step simulation.
    /// Rendering, audio and UI only read from it. Same seed + same inputs = same tower,
    /// which gives replays, reproducible bug reports and bots for balancing.
    /// </summary>
    public sealed class StackSimulation
    {
        public readonly SimConfig Config;
        readonly DeterministicRandom _rng;
        readonly List<Box> _tower = new List<Box>();

        public IReadOnlyList<Box> Tower => _tower;
        public Box Moving;
        public bool HasMoving { get; private set; }
        public Axis MovingAxis { get; private set; }
        public int Tick { get; private set; }
        public int Height { get; private set; }
        public int Combo { get; private set; }
        public bool Over { get; private set; }
        public DropResult LastResult { get; private set; }

        double _pos, _dir;
        double Dt => 1.0 / Config.TickRate;
        public double Speed => Math.Min(Config.SpeedMax, Config.Speed0 + Height * Config.SpeedPerLevel);

        public StackSimulation(uint seed, SimConfig config = null)
        {
            Config = config ?? new SimConfig();
            _rng = new DeterministicRandom(seed);
            double h = Config.BaseSize / 2;
            _tower.Add(new Box { X = -h, Z = -h, W = Config.BaseSize, D = Config.BaseSize, Level = 0 });
            Spawn();
        }

        Box Top => _tower[_tower.Count - 1];

        void Spawn()
        {
            var top = Top;
            MovingAxis = _tower.Count % 2 == 1 ? Axis.X : Axis.Z;
            double side = _rng.NextDouble() < 0.5 ? -1 : 1;
            _pos = side * Config.Range;
            _dir = -side;
            Moving = new Box { X = top.X, Z = top.Z, W = top.W, D = top.D, Level = _tower.Count };
            PlaceMoving();
            HasMoving = true;
        }

        void PlaceMoving()
        {
            if (MovingAxis == Axis.X) Moving.X = _pos - Moving.W / 2;
            else Moving.Z = _pos - Moving.D / 2;
        }

        public void Step()
        {
            if (Over || !HasMoving) return;
            Tick++;
            _pos += _dir * Speed * Dt;
            if (_pos > Config.Range) { _pos = Config.Range; _dir = -1; }
            if (_pos < -Config.Range) { _pos = -Config.Range; _dir = 1; }
            PlaceMoving();
        }

        public DropResult Drop()
        {
            if (Over || !HasMoving) throw new InvalidOperationException("Nothing to drop.");
            var top = Top; var m = Moving; bool x = MovingAxis == Axis.X;
            var r = x ? StackMath.Resolve(top.X, top.W, m.X, m.W, Config.Tolerance)
                      : StackMath.Resolve(top.Z, top.D, m.Z, m.D, Config.Tolerance);
            LastResult = r;

            if (r.Outcome == DropOutcome.Missed) { Over = true; HasMoving = false; Combo = 0; return r; }

            Combo = r.Outcome == DropOutcome.Perfect ? Combo + 1 : 0;
            double size = r.Outcome == DropOutcome.Perfect
                ? StackMath.GrowAfterCombo(r.Width, Combo, Config.ComboToGrow, Config.GrowBy, Config.BaseSize)
                : r.Width;
            double min = r.X - (size - r.Width) / 2;

            var placed = new Box { X = x ? min : top.X, Z = x ? top.Z : min, W = x ? size : top.W, D = x ? top.D : size, Level = _tower.Count };
            _tower.Add(placed);
            Height++;
            Spawn();
            return r;
        }

        public void Continue()
        {
            if (!Over) throw new InvalidOperationException("Can only continue after a miss.");
            Over = false;
            Spawn();
        }

        /// <summary>FNV-1a over the tower rounded to 1/1000 unit. Matches the JavaScript port exactly.</summary>
        public uint Hash()
        {
            unchecked
            {
                uint h = 2166136261u;
                Action<long> mix = v =>
                {
                    uint u = (uint)v;
                    for (int i = 0; i < 4; i++) { h ^= (u >> (i * 8)) & 0xFFu; h *= 16777619u; }
                };
                foreach (var b in _tower)
                {
                    mix(Q(b.X)); mix(Q(b.Z)); mix(Q(b.W)); mix(Q(b.D));
                }
                mix(Height); mix(Tick);
                return h;
            }
        }

        static long Q(double v) => (long)Math.Floor(v * 1000 + 0.5);
    }

    public enum InputKind { Drop, Continue }
    public struct InputEvent { public int Tick; public InputKind Kind; }

    /// <summary>Records inputs by tick; replaying them on a fresh simulation rebuilds the same run.</summary>
    public sealed class Replay
    {
        public uint Seed;
        public readonly List<InputEvent> Inputs = new List<InputEvent>();

        public void Record(int tick, InputKind kind) => Inputs.Add(new InputEvent { Tick = tick, Kind = kind });

        public StackSimulation Play(SimConfig config = null, int maxTicks = 1000000)
        {
            var sim = new StackSimulation(Seed, config);
            int i = 0;
            while (sim.Tick < maxTicks)
            {
                while (i < Inputs.Count && Inputs[i].Tick == sim.Tick)
                {
                    if (Inputs[i].Kind == InputKind.Drop) sim.Drop(); else sim.Continue();
                    i++;
                }
                if (i >= Inputs.Count) break;
                if (sim.Over) throw new InvalidOperationException($"Replay stalled at tick {sim.Tick}: run is over but inputs remain.");
                sim.Step();
            }
            return sim;
        }
    }
}
