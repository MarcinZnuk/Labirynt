(function (L) {
  'use strict';

  const REPEAT_DELAY_MS = 200;
  const REPEAT_INTERVAL_MS = 120;
  const SWIPE_MIN_PX = 30;

  // event.code opisuje fizyczny klawisz: WASD działa przy Caps Lock i w każdym układzie.
  const KEY_COMMANDS = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    KeyW: 'up',
    KeyS: 'down',
    KeyA: 'left',
    KeyD: 'right',
    Escape: 'pause',
    KeyP: 'pause',
    KeyN: 'newMaze',
  };
  // Akcje wykonywane raz na naciśnięcie, bez powtarzania.
  const ACTIONS = new Set(['pause', 'newMaze']);

  function keyToCommand(code) {
    return typeof code === 'string' && Object.hasOwn(KEY_COMMANDS, code) ? KEY_COMMANDS[code] : null;
  }

  function swipeDirection(dx, dy) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }

  // Zegary owinięte w funkcje: wywołanie window.setTimeout z innym this rzuca wyjątek.
  const browserTimers = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id),
  };

  // Własne powtarzanie zamiast systemowego: jednakowe tempo na każdym urządzeniu.
  // held trzyma kierunki w kolejności naciśnięcia, aktywny jest ostatni.
  function createRepeater(emit, timers) {
    const t = timers || browserTimers;
    const held = [];
    let timeoutId = null;
    let intervalId = null;

    function stopTimers() {
      if (timeoutId !== null) t.clearTimeout(timeoutId);
      if (intervalId !== null) t.clearInterval(intervalId);
      timeoutId = null;
      intervalId = null;
    }

    function startTimers(dir) {
      stopTimers();
      timeoutId = t.setTimeout(() => {
        timeoutId = null;
        emit(dir);
        intervalId = t.setInterval(() => emit(dir), REPEAT_INTERVAL_MS);
      }, REPEAT_DELAY_MS);
    }

    function remove(dir) {
      const index = held.indexOf(dir);
      if (index !== -1) held.splice(index, 1);
    }

    function press(dir) {
      if (held[held.length - 1] === dir) return;
      remove(dir);
      held.push(dir);
      emit(dir);
      startTimers(dir);
    }

    function release(dir) {
      const wasActive = held[held.length - 1] === dir;
      remove(dir);
      if (!wasActive) return;
      stopTimers();
      if (held.length > 0) startTimers(held[held.length - 1]);
    }

    function releaseAll() {
      held.length = 0;
      stopTimers();
    }

    return { press, release, releaseAll };
  }

  function bind(options) {
    const { dpad, swipeArea, onCommand, isEnabled } = options;
    const repeater = createRepeater((dir) => {
      if (isEnabled()) onCommand(dir);
    });

    window.addEventListener('keydown', (e) => {
      if (!isEnabled() || e.altKey || e.ctrlKey || e.metaKey) return;
      const cmd = keyToCommand(e.code);
      if (cmd || e.code === 'Space') e.preventDefault();
      if (!cmd) return;
      if (ACTIONS.has(cmd)) {
        if (!e.repeat) onCommand(cmd);
        return;
      }
      repeater.press(cmd);
    });

    window.addEventListener('keyup', (e) => {
      const cmd = keyToCommand(e.code);
      if (cmd && !ACTIONS.has(cmd)) repeater.release(cmd);
    });

    window.addEventListener('blur', () => repeater.releaseAll());

    if (dpad) {
      const pointers = new Map();
      dpad.addEventListener('pointerdown', (e) => {
        const button = e.target.closest('[data-dir]');
        if (!button || !isEnabled()) return;
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, button.dataset.dir);
        repeater.press(button.dataset.dir);
      });
      const end = (e) => {
        const dir = pointers.get(e.pointerId);
        if (!dir) return;
        pointers.delete(e.pointerId);
        repeater.release(dir);
      };
      dpad.addEventListener('pointerup', end);
      dpad.addEventListener('pointercancel', end);
      dpad.addEventListener('lostpointercapture', end);
    }

    if (swipeArea) {
      let start = null;
      swipeArea.addEventListener('pointerdown', (e) => {
        if (isEnabled()) start = { id: e.pointerId, x: e.clientX, y: e.clientY };
      });
      swipeArea.addEventListener('pointerup', (e) => {
        if (!start || start.id !== e.pointerId) return;
        const dir = swipeDirection(e.clientX - start.x, e.clientY - start.y);
        start = null;
        if (dir && isEnabled()) onCommand(dir);
      });
      swipeArea.addEventListener('pointercancel', () => {
        start = null;
      });
    }

    return { releaseAll: () => repeater.releaseAll() };
  }

  L.input = { REPEAT_DELAY_MS, REPEAT_INTERVAL_MS, SWIPE_MIN_PX, keyToCommand, swipeDirection, createRepeater, bind };
})(window.Labirynt = window.Labirynt || {});
