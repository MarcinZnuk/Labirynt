(function (L) {
  'use strict';

  // Miniatura w menu: latarnia przechodzi mały labirynt od wejścia do bramy, potem ogród się zmienia.
  const COLS = 13;
  const ROWS = 7;
  const STEP_MS = 180;
  const REST_MS = 1400;

  // Droga od (0, 0) do wyjścia w prawym dolnym rogu; labirynt doskonały ma dokładnie jedną.
  function solve(maze) {
    const goal = maze.width * maze.height - 1;
    const prev = new Array(maze.width * maze.height).fill(-1);
    const queue = [0];
    prev[0] = 0;
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === goal) break;
      const x = current % maze.width;
      const y = Math.floor(current / maze.width);
      for (const dir of Object.keys(L.maze.DIRS)) {
        if (!L.maze.canMove(maze, x, y, dir)) continue;
        const next = (y + L.maze.DIRS[dir].dy) * maze.width + x + L.maze.DIRS[dir].dx;
        if (prev[next] !== -1) continue;
        prev[next] = current;
        queue.push(next);
      }
    }
    const path = [];
    for (let i = goal; i !== 0; i = prev[i]) path.push(i);
    path.push(0);
    return path.reverse().map((i) => ({ x: i % maze.width, y: Math.floor(i / maze.width) }));
  }

  function start(canvas, getTheme, reducedMotion) {
    const ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) {
      canvas.hidden = true;
      return;
    }
    let maze = null;
    let path = null;
    let began = 0;
    let view = null;

    function reset(now) {
      maze = L.maze.generate(COLS, ROWS, L.rng.create(L.rng.randomSeed()));
      path = solve(maze);
      began = now;
    }

    function fit() {
      const width = Math.min(canvas.parentElement.clientWidth, 520);
      view = L.render.fitCanvas(canvas, width, width * (ROWS / COLS) + 16, maze, window.devicePixelRatio || 1);
    }

    function position(now) {
      if (reducedMotion.matches) return path[0];
      const t = (now - began) / STEP_MS;
      if (t >= path.length - 1) return path[path.length - 1];
      const i = Math.floor(t);
      const f = t - i;
      return { x: path[i].x + (path[i + 1].x - path[i].x) * f, y: path[i].y + (path[i + 1].y - path[i].y) * f };
    }

    function frame(now) {
      requestAnimationFrame(frame);
      if (canvas.offsetParent === null) return;
      if (!maze || (!reducedMotion.matches && now - began > (path.length - 1) * STEP_MS + REST_MS)) {
        reset(now);
        fit();
      }
      if (!view) fit();
      L.render.draw(ctx, view, maze, position(now), getTheme());
    }

    window.addEventListener('resize', () => {
      if (maze) fit();
    });
    requestAnimationFrame(frame);
  }

  L.hero = { solve, start };
})(window.Labirynt = window.Labirynt || {});
