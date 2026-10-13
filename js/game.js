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

  // 3 gwiazdki za najkrótszą drogę, 2 za drogę dłuższą najwyżej o połowę, 1 za każde przejście.
  function stars(moves, shortest) {
    if (moves <= shortest) return 3;
    if (moves <= shortest * 1.5) return 2;
    return 1;
  }

  function isCount(value) {
    return Number.isInteger(value) && value >= 0;
  }

  // Zapis przerwanej gry: labirynt odtwarza się z poziomu i ziarna, więc ścian nie zapisujemy.
  function toSave(state, nowMs) {
    return {
      level: state.level,
      seed: state.seed,
      x: state.x,
      y: state.y,
      moves: state.moves,
      timeMs: Math.round(elapsed(state, nowMs)),
    };
  }

  // Stan z zapisu, w pauzie. Zapis spoza zasad gry (np. poprawiony ręcznie w bazie) daje null.
  function fromSave(save) {
    if (save === null || typeof save !== 'object') return null;
    const { level, seed, x, y, moves, timeMs } = save;
    if (!Number.isInteger(level) || level < 1) return null;
    if (!isCount(seed) || seed > 0xffffffff) return null;
    if (!isCount(moves) || !isCount(timeMs)) return null;
    const size = levelSize(level);
    if (!isCount(x) || !isCount(y) || x >= size || y >= size) return null;
    if (x === size - 1 && y === size - 1) return null;
    return Object.assign(createLevel(level, seed), {
      x,
      y,
      moves,
      accumulatedMs: timeMs,
      clockStarted: moves > 0,
      paused: true,
    });
  }

  L.game = { MAX_SIZE, levelSize, createLevel, elapsed, move, pause, resume, restart, stars, toSave, fromSave };
})(window.Labirynt = window.Labirynt || {});
