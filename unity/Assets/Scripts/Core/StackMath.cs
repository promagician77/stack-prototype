using System;

namespace StackDrop.Core
{
    public enum DropOutcome { Perfect, Trimmed, Missed }

    /// <summary>Result of dropping the moving block onto the block below.</summary>
    public struct DropResult
    {
        public readonly DropOutcome Outcome;
        public readonly double X, Width;           // the block that stays on the tower
        public readonly double SliceX, SliceWidth; // the overhang that falls off (0 if none)

        public DropResult(DropOutcome outcome, double x, double width, double sliceX, double sliceWidth)
        {
            Outcome = outcome; X = x; Width = width; SliceX = sliceX; SliceWidth = sliceWidth;
        }
    }

    /// <summary>
    /// Pure slicing math in doubles (bit-identical to the JavaScript port), no UnityEngine dependency, so it is unit-tested in EditMode
    /// and shared by any renderer (2D sprites, 3D meshes, UI).
    /// </summary>
    public static class StackMath
    {
        public static DropResult Resolve(double prevX, double prevWidth, double x, double width, double perfectTolerance)
        {
            if (prevWidth <= 0 || width <= 0) throw new ArgumentException("Widths must be positive.");

            double delta = x - prevX;
            if (Math.Abs(delta) <= perfectTolerance)
                return new DropResult(DropOutcome.Perfect, prevX, width, 0, 0);

            double left = Math.Max(prevX, x);
            double right = Math.Min(prevX + prevWidth, x + width);
            double overlap = right - left;
            if (overlap <= 0)
                return new DropResult(DropOutcome.Missed, x, 0, x, width);

            // The overhang is on the side the block overshot.
            double sliceX = delta > 0 ? right : x;
            double sliceWidth = width - overlap;
            return new DropResult(DropOutcome.Trimmed, left, overlap, sliceX, sliceWidth);
        }

        /// <summary>After a streak of perfect drops the block grows back a little, capped at the base width.</summary>
        public static double GrowAfterCombo(double width, int combo, int comboToGrow, double growBy, double maxWidth)
        {
            if (combo < comboToGrow) return width;
            return Math.Min(maxWidth, width + growBy);
        }
    }
}
