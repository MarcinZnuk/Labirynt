(function (L) {
  'use strict';

  const MOVE_MS = 100;

  const canvas = document.getElementById('board');
  const boardWrap = document.getElementById('board-wrap');
  const ctx = canvas.getContext ? canvas.getContext('2d') : null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const store = L.storage.create(() => window.localStorage);

  let progress = store.load();
  let screen = 'menu';
  let state = null;
  let view = null;
  let anim = null; // { fromX, fromY, start }: trwająca animacja ruchu
  let queued = null; // jedno polecenie ruchu wydane w trakcie animacji
  let finishHandled = false;

  const input = L.input.bind({
    dpad: document.getElementById('dpad'),
    swipeArea: canvas,
    onCommand,
    isEnabled: () => screen === 'game',
  });

  function setScreen(name) {
    screen = name;
    input.releaseAll();
    L.ui.show(name);
  }

  function fit() {
    if (!state || !ctx || screen !== 'game') return;
    const dpr = window.devicePixelRatio || 1;
    view = L.render.fitCanvas(canvas, boardWrap.clientWidth, boardWrap.clientHeight, state.maze, dpr);
  }

  function resetMotion() {
    anim = null;
    queued = null;
    finishHandled = false;
  }

  function startLevel(level) {
    state = L.game.createLevel(level, L.rng.randomSeed());
    resetMotion();
    L.ui.setPaused(false);
    setScreen('game');
    fit();
  }

  function doMove(dir) {
    const now = performance.now();
    const next = L.game.move(state, dir, now);
    if (next === state) return;
    anim = reducedMotion.matches ? null : { fromX: state.x, fromY: state.y, start: now };
    state = next;
  }

  function onCommand(cmd) {
    if (screen !== 'game' || !state) return;
    if (cmd === 'pause') {
      togglePause();
      return;
    }
    if (cmd === 'newMaze') {
      newMaze();
      return;
    }
    if (state.paused || state.finished) return;
    if (anim) {
      queued = cmd;
      return;
    }
    doMove(cmd);
  }

  // Ten sam poziom, nowe ziarno; rekordy i odblokowanie bez zmian.
  function newMaze() {
    if (!state || state.finished) return;
    startLevel(state.level);
  }

  function togglePause() {
    if (!state || state.finished) return;
    const now = performance.now();
    state = state.paused ? L.game.resume(state, now) : L.game.pause(state, now);
    if (state.paused) {
      input.releaseAll();
      queued = null;
    }
    L.ui.setPaused(state.paused);
  }

  function finishLevel(now) {
    finishHandled = true;
    const timeMs = L.game.elapsed(state, now);
    const result = L.storage.recordResult(progress, state.level, timeMs, state.moves);
    progress = result.progress;
    store.save(progress);
    L.ui.setContinueVisible(progress.unlocked > 1);
    L.ui.showDone({
      level: state.level,
      timeMs,
      moves: state.moves,
      newBestTime: result.newBestTime,
      newBestMoves: result.newBestMoves,
    });
    setScreen('done');
  }

  function frame() {
    requestAnimationFrame(frame);
    if (screen !== 'game' || !state || !view) return;
    // Jeden zegar dla ruchu i HUD: znacznik rAF bywa wcześniejszy niż performance.now() z obsługi klawisza.
    const now = performance.now();
    let px = state.x;
    let py = state.y;
    if (anim) {
      const t = Math.min(1, (now - anim.start) / MOVE_MS);
      px = anim.fromX + (state.x - anim.fromX) * t;
      py = anim.fromY + (state.y - anim.fromY) * t;
      if (t >= 1) {
        anim = null;
        const next = queued;
        queued = null;
        if (next && !state.paused && !state.finished) doMove(next);
      }
    }
    L.render.draw(ctx, view, state.maze, { x: px, y: py }, progress.theme);
    L.ui.updateHud({ level: state.level, timeMs: L.game.elapsed(state, now), moves: state.moves });
    if (state.finished && !anim && !finishHandled) finishLevel(now);
  }

  const handlers = {
    newGame: () => startLevel(1),
    continue: () => startLevel(progress.unlocked),
    records: () => {
      L.ui.renderRecords(progress);
      setScreen('records');
    },
    toggleTheme: () => {
      progress = Object.assign({}, progress, { theme: progress.theme === 'dark' ? 'light' : 'dark' });
      store.save(progress);
      L.ui.applyTheme(progress.theme);
    },
    pause: () => togglePause(),
    newMaze: () => newMaze(),
    resume: () => togglePause(),
    restart: () => {
      if (!state) return;
      state = L.game.restart(state);
      resetMotion();
      L.ui.setPaused(false);
    },
    menu: () => {
      state = null;
      L.ui.setPaused(false);
      L.ui.setContinueVisible(progress.unlocked > 1);
      setScreen('menu');
    },
    next: () => startLevel(state.level + 1),
    clearRecords: () => {
      if (!window.confirm('Wyczyścić wszystkie rekordy?')) return;
      progress = L.storage.clearRecords(progress);
      store.save(progress);
      L.ui.renderRecords(progress);
    },
    back: () => setScreen('menu'),
  };

  L.ui.init(document, handlers);
  L.ui.applyTheme(progress.theme);
  L.ui.setContinueVisible(progress.unlocked > 1);
  if (!ctx) L.ui.showCanvasError();

  window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    input.releaseAll();
    if (screen === 'game' && state && !state.paused && !state.finished) togglePause();
  });

  // ?level=N: pomoc przy testach ręcznych, nie zmienia zapisanego postępu.
  const startLevelParam = Number(new URLSearchParams(window.location.search).get('level'));
  if (Number.isInteger(startLevelParam) && startLevelParam >= 1) startLevel(startLevelParam);
  else setScreen('menu');

  requestAnimationFrame(frame);
})(window.Labirynt);
