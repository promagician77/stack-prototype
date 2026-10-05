using System;

namespace StackDrop.Core
{
    public enum DropOutcome { Perfect, Trimmed, Missed }

    /// <summary>Result of dropping the moving block onto the block below.</summary>
    public struct DropResult
    {
        public readonly DropOutcome Outcome;
        public readonly float X, Width;           // the block that stays on the tower
        public readonly float SliceX, SliceWidth; // the overhang that falls off (0 if none)

        public DropResult(DropOutcome outcome, float x, float width, float sliceX, float sliceWidth)
        {
            Outcome = outcome; X = x; Width = width; SliceX = sliceX; SliceWidth = sliceWidth;
        }
    }

    /// <summary>
    /// Pure slicing math, no UnityEngine dependency, so it is unit-tested in EditMode
    /// and shared by any renderer (2D sprites, 3D meshes, UI).
    /// </summary>
    public static class StackMath
    {
        public static DropResult Resolve(float prevX, float prevWidth, float x, float width, float perfectTolerance)
        {
            if (prevWidth <= 0f || width <= 0f) throw new ArgumentException("Widths must be positive.");

            float delta = x - prevX;
            if (Math.Abs(delta) <= perfectTolerance)
                return new DropResult(DropOutcome.Perfect, prevX, width, 0f, 0f);

            float left = Math.Max(prevX, x);
            float right = Math.Min(prevX + prevWidth, x + width);
            float overlap = right - left;
            if (overlap <= 0f)
                return new DropResult(DropOutcome.Missed, x, 0f, x, width);

            // The overhang is on the side the block overshot.
            float sliceX = delta > 0f ? right : x;
            float sliceWidth = width - overlap;
            return new DropResult(DropOutcome.Trimmed, left, overlap, sliceX, sliceWidth);
        }

        /// <summary>After a streak of perfect drops the block grows back a little, capped at the base width.</summary>
        public static float GrowAfterCombo(float width, int combo, int comboToGrow, float growBy, float maxWidth)
        {
            if (combo < comboToGrow) return width;
            return Math.Min(maxWidth, width + growBy);
        }
    }
}
