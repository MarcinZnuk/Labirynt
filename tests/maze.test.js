(function () {
  'use strict';

  const { test, assert, assertEqual, assertThrows } = window.T;
  const L = window.Labirynt;
  const DIRS = L.maze.DIRS;

  function build(width, height, seed) {
    return L.maze.generate(width, height, L.rng.create(seed));
  }

  function reachableCount(maze) {
    const seen = new Set([0]);
    const queue = [[0, 0]];
    while (queue.length > 0) {
      const [x, y] = queue.shift();
      for (const name of Object.keys(DIRS)) {
        if (!L.maze.canMove(maze, x, y, name)) continue;
        const nx = x + DIRS[name].dx;
        const ny = y + DIRS[name].dy;
        const key = ny * maze.width + nx;
        if (!seen.has(key)) {
          seen.add(key);
          queue.push([nx, ny]);
        }
      }
    }
    return seen.size;
  }

  function passageCount(maze) {
    let count = 0;
    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        if (L.maze.canMove(maze, x, y, 'right')) count++;
        if (L.maze.canMove(maze, x, y, 'down')) count++;
      }
    }
    return count;
  }

  for (const [w, h] of [[2, 2], [8, 8], [25, 25], [7, 3]]) {
    test(`maze: ${w}x${h} każde pole osiągalne ze startu`, () => {
      assertEqual(reachableCount(build(w, h, 123)), w * h);
    });

    test(`maze: ${w}x${h} jest doskonały (przejść = pól - 1)`, () => {
      assertEqual(passageCount(build(w, h, 123)), w * h - 1);
    });
  }

  test('maze: ściany spójne z obu stron, krawędzie planszy zamknięte', () => {
    const m = build(12, 9, 5);
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        for (const name of Object.keys(DIRS)) {
          const d = DIRS[name];
          const nx = x + d.dx;
          const ny = y + d.dy;
          const open = !L.maze.hasWall(m, x, y, d.wall);
          if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) {
            assert(!open, `otwarta krawędź w (${x},${y}) ${name}`);
          } else {
            assertEqual(open, !L.maze.hasWall(m, nx, ny, d.opposite), `niespójna ściana (${x},${y}) ${name}`);
          }
        }
      }
    }
  });

  test('maze: to samo ziarno i rozmiar dają identyczny labirynt', () => {
    assertEqual(build(15, 15, 99).walls, build(15, 15, 99).walls);
  });

  test('maze: różne ziarna dają różne labirynty', () => {
    assert(JSON.stringify(build(15, 15, 1).walls) !== JSON.stringify(build(15, 15, 2).walls));
  });

  test('maze: canMove odrzuca nieznany kierunek i pole spoza planszy', () => {
    const m = build(4, 4, 3);
    assertEqual(L.maze.canMove(m, 0, 0, 'toString'), false);
    assertEqual(L.maze.canMove(m, 0, 0, 'jump'), false);
    assertEqual(L.maze.canMove(m, -1, 0, 'right'), false);
    assertEqual(L.maze.canMove(m, 4, 0, 'left'), false);
  });

  test('maze: nieprawidłowy rozmiar rzuca wyjątek', () => {
    assertThrows(() => L.maze.generate(0, 5, L.rng.create(1)));
    assertThrows(() => L.maze.generate(2.5, 5, L.rng.create(1)));
  });

  test('maze: 25x25 ma 625 pól (brak przepełnienia stosu)', () => {
    assertEqual(build(25, 25, 2024).walls.length, 625);
  });
})();
