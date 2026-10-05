using System;
using System.Collections.Generic;

namespace StackDrop.Core
{
    public enum GameState { Menu, Playing, ContinueOffer, GameOver }

    /// <summary>
    /// Explicit transitions. An illegal jump (say, GameOver straight to ContinueOffer)
    /// throws in development instead of leaving the UI in a half-state on a player's phone.
    /// </summary>
    public sealed class GameStateMachine
    {
        static readonly Dictionary<GameState, GameState[]> Allowed = new Dictionary<GameState, GameState[]>
        {
            { GameState.Menu,          new[] { GameState.Playing } },
            { GameState.Playing,       new[] { GameState.ContinueOffer, GameState.GameOver } },
            { GameState.ContinueOffer, new[] { GameState.Playing, GameState.GameOver } },
            { GameState.GameOver,      new[] { GameState.Playing, GameState.Menu } },
        };

        public GameState Current { get; private set; } = GameState.Menu;
        public event Action<GameState, GameState> Changed;

        public bool CanGo(GameState next) => Array.IndexOf(Allowed[Current], next) >= 0;

        public void Go(GameState next)
        {
            if (!CanGo(next))
                throw new InvalidOperationException($"Illegal transition {Current} -> {next}");
            var previous = Current;
            Current = next;
            Changed?.Invoke(previous, next);
        }
    }
}
