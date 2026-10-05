using System;
using UnityEngine;
using StackDrop.Core;

namespace StackDrop.Game
{
    /// <summary>Moves the current block, resolves drops with StackMath, raises events for UI/FX/audio.</summary>
    public sealed class StackController : MonoBehaviour
    {
        [SerializeField] GameConfig config;   // ScriptableObject: speeds, tolerance, widths - tuned without code
        [SerializeField] BlockPool pool;

        public event Action<DropResult, int> Dropped;   // result, combo
        public event Action Failed;

        Block _top, _moving;
        int _combo, _height;
        float _dir = 1f;

        public int Height => _height;

        public void StartRun(Block baseBlock)
        {
            _top = baseBlock; _combo = 0; _height = 0;
            SpawnMoving(_top.Width);
        }

        public void ResumeAfterContinue()
        {
            // Rewarded continue: discard the failed block and give the player a fresh one.
            if (_moving != null) pool.Release(_moving);
            SpawnMoving(_top.Width);
        }

        void Update()
        {
            if (_moving == null) return;
            float speed = config.BaseSpeed + _height * config.SpeedPerLevel;
            _moving.X += _dir * speed * Time.deltaTime;
            if (_moving.X > config.TravelRange || _moving.X < -config.TravelRange) _dir = -_dir;

            if (Input.GetMouseButtonDown(0)) Drop();
        }

        void Drop()
        {
            var r = StackMath.Resolve(_top.X, _top.Width, _moving.X, _moving.Width, config.PerfectTolerance);
            if (r.Outcome == DropOutcome.Missed) { _moving.Fall(); _moving = null; Failed?.Invoke(); return; }

            _combo = r.Outcome == DropOutcome.Perfect ? _combo + 1 : 0;
            float width = r.Outcome == DropOutcome.Perfect
                ? StackMath.GrowAfterCombo(r.Width, _combo, config.ComboToGrow, config.GrowBy, config.BaseWidth)
                : r.Width;

            _moving.Place(r.X, width);
            if (r.SliceWidth > 0f) { var slice = pool.Get(); slice.SpawnSlice(r.SliceX, r.SliceWidth, _moving); }

            _top = _moving; _height++;
            Dropped?.Invoke(r, _combo);
            SpawnMoving(width);
        }

        void SpawnMoving(float width)
        {
            _moving = pool.Get();
            _dir = (_height % 2 == 0) ? 1f : -1f;
            _moving.Spawn(-_dir * config.TravelRange, width, _height + 1);
        }
    }
}
