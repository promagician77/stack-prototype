using UnityEngine;
using StackDrop.Core;

namespace StackDrop.Game
{
    /// <summary>
    /// Reads the simulation and positions pooled cubes. Never changes game state, so visuals
    /// can be restyled per client without any risk to the rules or to replays.
    /// </summary>
    public sealed class StackView : MonoBehaviour
    {
        [SerializeField] BlockPool pool;
        [SerializeField] float unitsToMeters = 0.01f;
        [SerializeField] Transform cameraRig;
        [SerializeField] float cameraFollow = 6f;

        static readonly int ColorId = Shader.PropertyToID("_BaseColor");
        readonly MaterialPropertyBlock _props = new MaterialPropertyBlock(); // one material, no per-block copies
        Block _moving;
        float _hue;

        public void Rebuild(StackSimulation sim)
        {
            _hue = Random.value;   // cosmetic randomness only - never the simulation's RNG
            foreach (var b in sim.Tower) Place(pool.Get(), b);
            _moving = pool.Get();
        }

        public void OnDrop(StackSimulation sim, DropResult r, Box dropped, Axis axis)
        {
            if (r.Outcome == DropOutcome.Missed) { _moving.Fall(); pool.ReleaseAfter(_moving, 2f); _moving = sim.Over ? null : pool.Get(); return; }
            Place(_moving, sim.Tower[sim.Tower.Count - 1]);
            if (r.SliceWidth > 0)
            {
                var slice = dropped;
                if (axis == Axis.X) { slice.X = r.SliceX; slice.W = r.SliceWidth; } else { slice.Z = r.SliceX; slice.D = r.SliceWidth; }
                var piece = pool.Get(); Place(piece, slice); piece.Fall(); pool.ReleaseAfter(piece, 2f);
            }
            _moving = pool.Get();
        }

        public void OnContinue() { if (_moving == null) _moving = pool.Get(); }

        public void Render(StackSimulation sim)
        {
            if (sim.HasMoving && _moving != null) Place(_moving, sim.Moving);
            var target = new Vector3(0, sim.Height * (float)sim.Config.BlockHeight * unitsToMeters, 0);
            cameraRig.position = Vector3.Lerp(cameraRig.position, target, 1 - Mathf.Exp(-cameraFollow * Time.deltaTime));
        }

        void Place(Block block, Box b)
        {
            float s = unitsToMeters, h = 20f * s;
            block.transform.localPosition = new Vector3((float)(b.X + b.W / 2) * s, b.Level * h, (float)(b.Z + b.D / 2) * s);
            block.transform.localScale = new Vector3((float)b.W * s, h, (float)b.D * s);
            _props.SetColor(ColorId, Color.HSVToRGB((_hue + b.Level * 0.012f) % 1f, 0.55f, 0.95f));
            block.Renderer.SetPropertyBlock(_props);
        }
    }
}
