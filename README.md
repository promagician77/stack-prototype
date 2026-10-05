# Stack Drop - prototype for Devflow

A one-tap stacking game built to show how I deliver client game work.

- **Play it:** open `index.html` (or the deployed link) on a phone. Tap to drop.
- **Monetization flow:** rewarded continue, interstitial frequency cap, remove-ads purchase with restore.
- **Live developer panel:** FPS, game state, object pool usage, ad policy counters, event log.
- **Unity C#:** `unity/Assets/Scripts` - engine-independent core (slice math, ad policy, state machine,
  ads/IAP interfaces) plus the MonoBehaviour layer. `unity/Assets/Tests/EditMode` - NUnit tests.

The browser build is a direct port of the C# core, so both behave the same.

## Tests
```
npm test     # JS port (7 tests) + C# core compiled with Mono (15 tests)
```
The C# core has no UnityEngine dependency, so it compiles and runs in CI without the editor.
Inside Unity the same tests run in the Test Runner (EditMode).

## Run / deploy
```
npm start        # http://localhost:3000
npm run deploy   # Vercel, or import the repo with the "Other" preset and no build command
```
