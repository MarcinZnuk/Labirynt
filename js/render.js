(function (L) {
  'use strict';

  const PAD = 2;
  const MIN_CELL = 4;

  const THEMES = {
    dark: { background: '#10141c', wall: '#e6e9ef', player: '#4cc2ff', exit: '#5ee07a' },
    light: { background: '#f7f7f4', wall: '#1d2330', player: '#0a66c2', exit: '#1a8f3c' },
  };

  function cellSize(availWidth, availHeight, cols, rows) {
    const size = Math.floor(Math.min((availWidth - 2 * PAD) / cols, (availHeight - 2 * PAD) / rows));
    return Math.max(MIN_CELL, size);
  }

  function luminance(hex) {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrastRatio(hexA, hexB) {
    const a = luminance(hexA);
    const b = luminance(hexB);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  // Rozmiar CSS z całkowitą liczbą pikseli na pole, rozdzielczość płótna pomnożona przez dpr.
  function fitCanvas(canvas, availWidth, availHeight, maze, dpr) {
    const cell = cellSize(availWidth, availHeight, maze.width, maze.height);
    const cssWidth = cell * maze.width + 2 * PAD;
    const cssHeight = cell * maze.height + 2 * PAD;
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    return { cell, dpr, cssWidth, cssHeight };
  }

  function draw(ctx, view, maze, pos, theme) {
    const colors = THEMES[theme] || THEMES.dark;
    const cell = view.cell;
    const WALL = L.maze.WALL;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);

    const inset = Math.max(1, Math.round(cell * 0.2));
    ctx.fillStyle = colors.exit;
    ctx.fillRect(
      PAD + (maze.width - 1) * cell + inset,
      PAD + (maze.height - 1) * cell + inset,
      cell - 2 * inset,
      cell - 2 * inset
    );

    // Górna i lewa ściana każdego pola oraz prawa i dolna krawędź planszy.
    // Grubość najwyżej 2 * PAD, żeby zewnętrzne ściany nie wychodziły poza płótno.
    ctx.strokeStyle = colors.wall;
    ctx.lineWidth = Math.max(1.5, Math.min(2 * PAD, cell / 8));
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const left = PAD + x * cell;
        const top = PAD + y * cell;
        if (L.maze.hasWall(maze, x, y, WALL.N)) {
          ctx.moveTo(left, top);
          ctx.lineTo(left + cell, top);
        }
        if (L.maze.hasWall(maze, x, y, WALL.W)) {
          ctx.moveTo(left, top);
          ctx.lineTo(left, top + cell);
        }
        if (x === maze.width - 1 && L.maze.hasWall(maze, x, y, WALL.E)) {
          ctx.moveTo(left + cell, top);
          ctx.lineTo(left + cell, top + cell);
        }
        if (y === maze.height - 1 && L.maze.hasWall(maze, x, y, WALL.S)) {
          ctx.moveTo(left, top + cell);
          ctx.lineTo(left + cell, top + cell);
        }
      }
    }
    ctx.stroke();

    ctx.fillStyle = colors.player;
    ctx.beginPath();
    ctx.arc(PAD + (pos.x + 0.5) * cell, PAD + (pos.y + 0.5) * cell, cell * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  L.render = { PAD, THEMES, cellSize, contrastRatio, fitCanvas, draw };
})(window.Labirynt = window.Labirynt || {});
