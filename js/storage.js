(function (L) {
  'use strict';

  const KEY = 'labirynt.v1';
  const LEVEL_KEY = /^[1-9]\d*$/;

  function defaults() {
    return { unlocked: 1, best: {}, theme: 'dark' };
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isPositiveInt(value) {
    return Number.isInteger(value) && value >= 1;
  }

  // Każde pole sprawdzane osobno: uszkodzony fragment nie kasuje reszty postępu.
  function sanitize(raw) {
    const result = defaults();
    if (!isPlainObject(raw)) return result;
    if (isPositiveInt(raw.unlocked)) result.unlocked = raw.unlocked;
    if (raw.theme === 'dark' || raw.theme === 'light') result.theme = raw.theme;
    if (isPlainObject(raw.best)) {
      for (const key of Object.keys(raw.best)) {
        const entry = raw.best[key];
        if (!LEVEL_KEY.test(key) || !isPlainObject(entry)) continue;
        if (Number.isFinite(entry.timeMs) && entry.timeMs >= 0 && isPositiveInt(entry.moves)) {
          result.best[key] = { timeMs: entry.timeMs, moves: entry.moves };
        }
      }
    }
    return result;
  }

  // Samo pobranie magazynu może rzucić wyjątek (zablokowane dane witryny), więc jest w try.
  function create(getBackend) {
    function load() {
      try {
        const raw = getBackend().getItem(KEY);
        return raw === null ? defaults() : sanitize(JSON.parse(raw));
      } catch (err) {
        return defaults();
      }
    }

    function save(progress) {
      try {
        getBackend().setItem(KEY, JSON.stringify(progress));
        return true;
      } catch (err) {
        return false;
      }
    }

    return { load, save };
  }

  function recordResult(progress, level, timeMs, moves) {
    const previous = progress.best[level];
    const newBestTime = !previous || timeMs < previous.timeMs;
    const newBestMoves = !previous || moves < previous.moves;
    const best = Object.assign({}, progress.best, {
      [level]: {
        timeMs: newBestTime ? timeMs : previous.timeMs,
        moves: newBestMoves ? moves : previous.moves,
      },
    });
    return {
      progress: Object.assign({}, progress, { best, unlocked: Math.max(progress.unlocked, level + 1) }),
      newBestTime,
      newBestMoves,
    };
  }

  function clearRecords(progress) {
    return Object.assign({}, progress, { best: {} });
  }

  L.storage = { KEY, defaults, sanitize, create, recordResult, clearRecords };
})(window.Labirynt = window.Labirynt || {});
