(function () {
  'use strict';

  const { test, assert, assertEqual, assertThrows } = window.T;
  const L = window.Labirynt;
  const G = L.game;

  // Najkrótsza droga ze startu do wyjścia jako lista kierunków.
  function solve(maze) {
    const DIRS = L.maze.DIRS;
    const target = maze.width * maze.height - 1;
    const prev = new Map([[0, null]]);
    const queue = [0];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === target) break;
      const x = cur % maze.width;
      const y = Math.floor(cur / maze.width);
      for (const name of Object.keys(DIRS)) {
        if (!L.maze.canMove(maze, x, y, name)) continue;
        const next = (y + DIRS[name].dy) * maze.width + (x + DIRS[name].dx);
        if (!prev.has(next)) {
          prev.set(next, { from: cur, dir: name });
          queue.push(next);
        }
      }
    }
    const path = [];
    for (let at = target; prev.get(at); at = prev.get(at).from) path.unshift(prev.get(at).dir);
    return path;
  }

  function openDir(state) {
    return ['right', 'down'].find((d) => L.maze.canMove(state.maze, state.x, state.y, d));
  }

  test('game: rozmiar poziomu zgodny ze wzorem', () => {
    assertEqual([1, 2, 9, 10, 50].map(G.levelSize), [8, 10, 24, 25, 25]);
  });

  test('game: nowy poziom zaczyna się na starcie bez ruchów i bez zegara', () => {
    const s = G.createLevel(3, 11);
    assertEqual([s.x, s.y, s.moves, s.maze.width, s.maze.height], [0, 0, 0, 12, 12]);
    assertEqual([s.paused, s.finished, s.clockStarted], [false, false, false]);
    assertEqual(G.elapsed(s, 99999), 0);
  });

  test('game: nieprawidłowy poziom rzuca wyjątek', () => {
    assertThrows(() => G.createLevel(0, 1));
    assertThrows(() => G.createLevel(1.5, 1));
  });

  test('game: to samo ziarno daje ten sam labirynt poziomu', () => {
    assertEqual(G.createLevel(2, 77).maze.walls, G.createLevel(2, 77).maze.walls);
  });

  test('game: ruch w ścianę zwraca ten sam stan', () => {
    const s = G.createLevel(1, 5);
    assert(G.move(s, 'up', 1000) === s, 'ruch w górę ze startu');
    assert(G.move(s, 'left', 1000) === s, 'ruch w lewo ze startu');
    assertEqual(s.moves, 0);
  });

  test('game: nieznany kierunek zwraca ten sam stan', () => {
    const s = G.createLevel(1, 5);
    assert(G.move(s, 'jump', 1000) === s);
  });

  test('game: ruch w otwarte przejście zmienia pozycję i licznik', () => {
    const s = G.createLevel(1, 5);
    const dir = openDir(s);
    const next = G.move(s, dir, 1000);
    assertEqual([next.x + next.y, next.moves], [1, 1]);
    assertEqual([s.x, s.y, s.moves], [0, 0, 0], 'stan wejściowy nie może się zmienić');
  });

  test('game: zegar startuje przy pierwszym ruchu', () => {
    const s = G.createLevel(1, 5);
    const next = G.move(s, openDir(s), 1000);
    assertEqual(G.elapsed(next, 1500), 500);
  });

  test('game: pauza zatrzymuje naliczanie czasu', () => {
    let s = G.createLevel(1, 5);
    s = G.move(s, openDir(s), 1000);
    s = G.pause(s, 1500);
    assertEqual(G.elapsed(s, 9000), 500, 'w pauzie');
    s = G.resume(s, 9000);
    assertEqual(G.elapsed(s, 9200), 700, 'po wznowieniu');
  });

  test('game: pauza przed pierwszym ruchem nie uruchamia zegara', () => {
    let s = G.createLevel(1, 5);
    s = G.pause(s, 100);
    s = G.resume(s, 200);
    assertEqual(G.elapsed(s, 5000), 0);
    s = G.move(s, openDir(s), 6000);
    assertEqual(G.elapsed(s, 6250), 250);
  });

  test('game: w pauzie ruch jest ignorowany', () => {
    const s = G.pause(G.createLevel(1, 5), 100);
    assert(G.move(s, openDir(s), 200) === s);
  });

  test('game: dojście do wyjścia kończy poziom i zatrzymuje zegar', () => {
    let s = G.createLevel(1, 7);
    const path = solve(s.maze);
    path.forEach((dir, i) => {
      s = G.move(s, dir, 1000 + i * 100);
    });
    assertEqual([s.finished, s.moves, s.x, s.y], [true, path.length, 7, 7]);
    assertEqual(G.elapsed(s, 999999), (path.length - 1) * 100);
  });

  test('game: po ukończeniu ruch jest ignorowany', () => {
    let s = G.createLevel(1, 7);
    for (const dir of solve(s.maze)) s = G.move(s, dir, 1000);
    for (const dir of ['up', 'left', 'down', 'right']) assert(G.move(s, dir, 2000) === s, dir);
    assert(G.pause(s, 2000) === s, 'pauza po ukończeniu');
  });

  test('game: restart zachowuje labirynt i zeruje postęp', () => {
    let s = G.createLevel(4, 21);
    s = G.move(s, openDir(s), 1000);
    s = G.pause(s, 2000);
    const r = G.restart(s);
    assert(r.maze === s.maze, 'ten sam labirynt');
    assertEqual([r.level, r.seed, r.x, r.y, r.moves, r.paused, r.finished], [4, 21, 0, 0, 0, false, false]);
    assertEqual(G.elapsed(r, 50000), 0);
  });
})();
