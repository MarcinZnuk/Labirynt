(function () {
  'use strict';

  const { test, assertEqual } = window.T;
  const I = window.Labirynt.input;

  // Sztuczny zegar: advance(ms) wykonuje zaplanowane zadania w kolejności czasu.
  function fakeTimers() {
    let now = 0;
    let nextId = 1;
    const tasks = new Map();
    function schedule(fn, ms, every) {
      const id = nextId++;
      tasks.set(id, { at: now + ms, fn, every });
      return id;
    }
    return {
      setTimeout: (fn, ms) => schedule(fn, ms, 0),
      setInterval: (fn, ms) => schedule(fn, ms, ms),
      clearTimeout: (id) => tasks.delete(id),
      clearInterval: (id) => tasks.delete(id),
      advance(ms) {
        const end = now + ms;
        for (;;) {
          let dueId = null;
          let due = null;
          for (const [id, task] of tasks) {
            if (task.at <= end && (!due || task.at < due.at)) {
              due = task;
              dueId = id;
            }
          }
          if (!due) break;
          now = due.at;
          if (due.every) due.at += due.every;
          else tasks.delete(dueId);
          due.fn();
        }
        now = end;
      },
    };
  }

  function setup() {
    const emitted = [];
    const timers = fakeTimers();
    const repeater = I.createRepeater((dir) => emitted.push(dir), timers);
    return { emitted, timers, repeater };
  }

  test('input: klawisze strzałek, WASD, pauzy i nowej planszy', () => {
    const codes = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Escape', 'KeyP', 'KeyN'];
    assertEqual(codes.map(I.keyToCommand), ['up', 'down', 'left', 'right', 'up', 'left', 'down', 'right', 'pause', 'pause', 'newMaze']);
  });

  test('input: inne klawisze nie są poleceniami', () => {
    assertEqual(['KeyQ', 'Space', 'Enter', 'toString', '', undefined].map(I.keyToCommand), [null, null, null, null, null, null]);
  });

  test('input: gest poniżej progu jest ignorowany', () => {
    assertEqual([I.swipeDirection(10, 5), I.swipeDirection(29, -29), I.swipeDirection(0, 0)], [null, null, null]);
  });

  test('input: gest wybiera dominujący kierunek', () => {
    assertEqual(
      [I.swipeDirection(40, 10), I.swipeDirection(-40, 10), I.swipeDirection(5, 30), I.swipeDirection(5, -60)],
      ['right', 'left', 'down', 'up']
    );
  });

  test('repeater: naciśnięcie daje ruch od razu, potem po 200 ms i co 120 ms', () => {
    const { emitted, timers, repeater } = setup();
    repeater.press('up');
    assertEqual(emitted.length, 1, 'od razu');
    timers.advance(199);
    assertEqual(emitted.length, 1, 'przed 200 ms');
    timers.advance(1);
    assertEqual(emitted.length, 2, 'po 200 ms');
    timers.advance(240);
    assertEqual(emitted, ['up', 'up', 'up', 'up']);
  });

  test('repeater: puszczenie zatrzymuje powtarzanie', () => {
    const { emitted, timers, repeater } = setup();
    repeater.press('left');
    timers.advance(250);
    repeater.release('left');
    timers.advance(1000);
    assertEqual(emitted.length, 2);
  });

  test('repeater: releaseAll zatrzymuje powtarzanie', () => {
    const { emitted, timers, repeater } = setup();
    repeater.press('down');
    repeater.press('right');
    repeater.releaseAll();
    timers.advance(2000);
    assertEqual(emitted, ['down', 'right']);
  });

  test('repeater: powtórne naciśnięcie tego samego kierunku nic nie dodaje', () => {
    const { emitted, repeater } = setup();
    repeater.press('up');
    repeater.press('up');
    assertEqual(emitted, ['up']);
  });

  test('repeater: puszczenie nieaktywnego klawisza nie przerywa ruchu', () => {
    const { emitted, timers, repeater } = setup();
    repeater.press('up');
    timers.advance(50);
    repeater.press('right');
    repeater.release('up');
    timers.advance(320);
    assertEqual(emitted, ['up', 'right', 'right', 'right']);
  });

  test('repeater: po puszczeniu aktywnego wraca do wciąż trzymanego', () => {
    const { emitted, timers, repeater } = setup();
    repeater.press('up');
    repeater.press('right');
    repeater.release('right');
    timers.advance(200);
    assertEqual(emitted, ['up', 'right', 'up']);
  });
})();
