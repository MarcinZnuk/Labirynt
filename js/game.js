(function (L) {
  'use strict';

  const MIN_SIZE = 8;
  const MAX_SIZE = 25;

  function levelSize(level) {
    return Math.min(MIN_SIZE + 2 * (level - 1), MAX_SIZE);
  }

  function initialState(level, seed, maze) {
    return {
      level,
      seed,
      maze,
      x: 0,
      y: 0,
      moves: 0,
      clockStarted: false,
      runningSince: null,
      accumulatedMs: 0,
      paused: false,
      finished: false,
    };
  }

  function createLevel(level, seed) {
    if (!Number.isInteger(level) || level < 1) throw new RangeError('Nieprawidłowy poziom: ' + level);
    const size = levelSize(level);
    return initialState(level, seed, L.maze.generate(size, size, L.rng.create(seed)));
  }

  function elapsed(state, nowMs) {
    return state.accumulatedMs + (state.runningSince === null ? 0 : nowMs - state.runningSince);
  }

  function isExit(state) {
    return state.x === state.maze.width - 1 && state.y === state.maze.height - 1;
  }

  // Gdy ruch jest niemożliwy, zwraca ten sam obiekt, więc wywołujący porównuje referencje.
  function move(state, dir, nowMs) {
    if (state.paused || state.finished) return state;
    if (!L.maze.canMove(state.maze, state.x, state.y, dir)) return state;
    const d = L.maze.DIRS[dir];
    const next = Object.assign({}, state, { x: state.x + d.dx, y: state.y + d.dy, moves: state.moves + 1 });
    if (!next.clockStarted) {
      next.clockStarted = true;
      next.runningSince = nowMs;
    }
    if (isExit(next)) {
      next.accumulatedMs = elapsed(next, nowMs);
      next.runningSince = null;
      next.finished = true;
    }
    return next;
  }

  function pause(state, nowMs) {
    if (state.paused || state.finished) return state;
    return Object.assign({}, state, { paused: true, accumulatedMs: elapsed(state, nowMs), runningSince: null });
  }

  function resume(state, nowMs) {
    if (!state.paused) return state;
    return Object.assign({}, state, { paused: false, runningSince: state.clockStarted ? nowMs : null });
  }

  function restart(state) {
    return initialState(state.level, state.seed, state.maze);
  }

  L.game = { MAX_SIZE, levelSize, createLevel, elapsed, move, pause, resume, restart };
})(window.Labirynt = window.Labirynt || {});
