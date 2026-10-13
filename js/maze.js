(function (L) {
  'use strict';

  const WALL = { N: 1, E: 2, S: 4, W: 8 };
  const ALL_WALLS = WALL.N | WALL.E | WALL.S | WALL.W;

  // Kierunek: przesunięcie, ściana po stronie pola i ściana po stronie sąsiada.
  const DIRS = {
    up: { dx: 0, dy: -1, wall: WALL.N, opposite: WALL.S },
    right: { dx: 1, dy: 0, wall: WALL.E, opposite: WALL.W },
    down: { dx: 0, dy: 1, wall: WALL.S, opposite: WALL.N },
    left: { dx: -1, dy: 0, wall: WALL.W, opposite: WALL.E },
  };
  const DIR_NAMES = Object.keys(DIRS);

  function inside(maze, x, y) {
    return x >= 0 && y >= 0 && x < maze.width && y < maze.height;
  }

  // Recursive backtracker w wersji iteracyjnej: jawny stos zamiast rekurencji.
  function generate(width, height, rand) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError('Nieprawidłowy rozmiar labiryntu: ' + width + 'x' + height);
    }
    const maze = { width, height, walls: new Array(width * height).fill(ALL_WALLS) };
    const visited = new Array(width * height).fill(false);
    const stack = [0];
    visited[0] = true;

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const x = current % width;
      const y = Math.floor(current / width);
      const options = DIR_NAMES.filter((name) => {
        const nx = x + DIRS[name].dx;
        const ny = y + DIRS[name].dy;
        return inside(maze, nx, ny) && !visited[ny * width + nx];
      });
      if (options.length === 0) {
        stack.pop();
        continue;
      }
      const d = DIRS[options[Math.floor(rand() * options.length)]];
      const next = (y + d.dy) * width + (x + d.dx);
      maze.walls[current] &= ~d.wall;
      maze.walls[next] &= ~d.opposite;
      visited[next] = true;
      stack.push(next);
    }
    return maze;
  }

  function hasWall(maze, x, y, wall) {
    return (maze.walls[y * maze.width + x] & wall) !== 0;
  }

  function canMove(maze, x, y, dir) {
    if (!Object.hasOwn(DIRS, dir) || !inside(maze, x, y)) return false;
    return !hasWall(maze, x, y, DIRS[dir].wall);
  }

  // Najkrótsza droga ze startu (0, 0) do pola (x, y), od startu do celu (BFS).
  // Labirynt jest doskonały, więc to jedyna droga bez zawracania. Pusta, gdy pola nie ma.
  function pathFromStart(maze, x, y) {
    if (!inside(maze, x, y)) return [];
    const target = y * maze.width + x;
    const prev = new Array(maze.width * maze.height).fill(-1);
    const queue = [0];
    prev[0] = 0;
    for (let head = 0; head < queue.length && prev[target] === -1; head++) {
      const current = queue[head];
      const cx = current % maze.width;
      const cy = Math.floor(current / maze.width);
      for (const name of DIR_NAMES) {
        if (!canMove(maze, cx, cy, name)) continue;
        const next = (cy + DIRS[name].dy) * maze.width + (cx + DIRS[name].dx);
        if (prev[next] === -1) {
          prev[next] = current;
          queue.push(next);
        }
      }
    }
    if (prev[target] === -1) return [];
    const path = [];
    for (let i = target; ; i = prev[i]) {
      path.push({ x: i % maze.width, y: Math.floor(i / maze.width) });
      if (i === 0) break;
    }
    return path.reverse();
  }

  // Liczba ruchów najkrótszej drogi ze startu do wyjścia w prawym dolnym rogu.
  function shortestPathLength(maze) {
    return pathFromStart(maze, maze.width - 1, maze.height - 1).length - 1;
  }

  L.maze = { WALL, DIRS, generate, hasWall, canMove, pathFromStart, shortestPathLength };
})(window.Labirynt = window.Labirynt || {});
