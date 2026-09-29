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

  L.maze = { WALL, DIRS, generate, hasWall, canMove };
})(window.Labirynt = window.Labirynt || {});
