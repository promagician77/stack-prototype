# Stack Drop - prototype for Devflow

A one-tap isometric stacking game, built to show how I deliver client game work.

## What's in it
- **Game:** isometric blocks sliced on alternating axes, combos that grow the block back,
  synthesized sound with rising pitch per combo, ripples, particles, haptics.
- **Deterministic simulation:** fixed 120 Hz rules, seeded RNG, separate from rendering.
  A run is stored as a seed plus the tick of each tap. "Watch replay" rebuilds it and checks the hash.
- **Cross-language parity:** `src/sim.js` and `unity/Assets/Scripts/Core/StackSimulation.cs` produce the
  same tower hash for the same seed and inputs (checked by tests on both sides).
- **Monetization:** rewarded continue, interstitial frequency cap, remove-ads with restore,
  and a tap guard so fast players never hit an ad by accident.
- **Developer panel:** frame-time graph, adaptive quality (try the slow-phone toggle), pools,
  seed/tick/hash, live tuning from `config.json`, a 400-game balance check, analytics, event log.

## Tests
```
npm test   # JS: 14 tests. C#: 21 NUnit tests compiled and run with Mono.
```
The C# core has no UnityEngine dependency, so it runs in CI without the editor and in Unity's Test Runner (EditMode).

## Unity layout
- `Core/` - StackSimulation, StackMath, DeterministicRandom, AdPolicy, GameStateMachine, service interfaces
- `Game/` - SimulationRunner (fixed timestep, input recording), StackView (read-only renderer),
  BlockPool, Block, MonetizationController
- `Tests/EditMode/` - NUnit tests

## Run / deploy
```
npm start        # http://localhost:3000
npm run deploy   # Vercel, or import the repo with the "Other" preset and no build command
```
