namespace StackDrop.Core
{
    /// <summary>
    /// mulberry32. Tiny, fast, and bit-for-bit identical to the JavaScript port, so a seed
    /// produces the same game on every device and in both codebases.
    /// System.Random is not used: its sequence is not guaranteed across .NET runtimes.
    /// </summary>
    public sealed class DeterministicRandom
    {
        uint _state;
        public DeterministicRandom(uint seed) { _state = seed; }

        public double NextDouble()
        {
            unchecked
            {
                _state += 0x6D2B79F5u;
                uint t = _state;
                t = (t ^ (t >> 15)) * (t | 1u);
                t ^= t + (t ^ (t >> 7)) * (t | 61u);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }
    }
}
