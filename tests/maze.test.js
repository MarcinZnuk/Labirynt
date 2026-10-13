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

  test('maze: najkrótsza droga idzie korytarzem, nie na skróty', () => {
    // Wąż 3x3: prawo, prawo, dół, lewo, lewo, dół, prawo, prawo.
    const snake = { width: 3, height: 3, walls: [13, 5, 3, 9, 5, 6, 12, 5, 7] };
    assertEqual(L.maze.shortestPathLength(snake), 8);
  });

  test('maze: najkrótsza droga w prostych przypadkach', () => {
    assertEqual(L.maze.shortestPathLength(build(1, 1, 1)), 0, '1x1');
    assertEqual(L.maze.shortestPathLength(build(3, 1, 1)), 2, '3x1');
    assertEqual(L.maze.shortestPathLength(build(2, 2, 1)), 2, '2x2');
  });

  test('maze: droga ze startu do startu to samo pole startu', () => {
    assertEqual(L.maze.pathFromStart(build(5, 5, 3), 0, 0), [{ x: 0, y: 0 }]);
  });

  test('maze: droga ze startu idzie korytarzem, nie na skróty', () => {
    const snake = { width: 3, height: 3, walls: [13, 5, 3, 9, 5, 6, 12, 5, 7] };
    const path = L.maze.pathFromStart(snake, 0, 1);
    assertEqual(path.map((c) => c.x + ',' + c.y), ['0,0', '1,0', '2,0', '2,1', '1,1', '0,1']);
  });

  test('maze: droga ze startu przechodzi tylko przez otwarte przejścia', () => {
    const maze = build(12, 12, 77);
    for (const [tx, ty] of [[11, 11], [0, 11], [11, 0], [6, 5]]) {
      const path = L.maze.pathFromStart(maze, tx, ty);
      assertEqual(path[0], { x: 0, y: 0 }, 'początek');
      assertEqual(path[path.length - 1], { x: tx, y: ty }, 'koniec');
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const dir = Object.keys(DIRS).find((n) => a.x + DIRS[n].dx === b.x && a.y + DIRS[n].dy === b.y);
        assert(dir && L.maze.canMove(maze, a.x, a.y, dir), 'brak przejścia ' + JSON.stringify([a, b]));
      }
    }
  });

  test('maze: droga ze startu do wyjścia ma tyle ruchów, co najkrótsza droga', () => {
    const maze = build(25, 25, 2024);
    assertEqual(L.maze.pathFromStart(maze, 24, 24).length - 1, L.maze.shortestPathLength(maze));
  });

  test('maze: droga ze startu do pola spoza planszy jest pusta', () => {
    assertEqual(L.maze.pathFromStart(build(4, 4, 1), 4, 0), []);
    assertEqual(L.maze.pathFromStart(build(4, 4, 1), -1, 2), []);
  });
})();
