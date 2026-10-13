(function (L) {
  'use strict';

  const PAD = 2;
  const MIN_CELL = 4;

  // Plansza leży na obrazie mapy: tło planszy to półprzezroczysta warstwa koloru pergaminu
  // (krycie BOARD_ALPHA), która wyrównuje rysunki pod ścianami, ale zostawia mapę widoczną.
  const BOARD_ALPHA = 0.6;
  // Wyjście i ślad gracza w kolorze czerwonego atramentu, jak trasa do skarbu na obrazie mapy.
  const THEMES = {
    dark: { background: '#3e220c', wall: '#f3e6c8', player: '#4cc2ff', exit: '#e5553f', trail: '#e5553f' },
    light: { background: '#f0d9b0', wall: '#2b1d10', player: '#0a66c2', exit: '#a3221a', trail: '#a3221a' },
  };

  // Droga liczy się na nowo tylko po zmianie planszy albo pola gracza, a nie w każdej klatce.
  let trailCache = { maze: null, x: -1, y: -1, path: [] };

  function trailPath(maze, x, y) {
    if (trailCache.maze !== maze || trailCache.x !== x || trailCache.y !== y) {
      trailCache = { maze, x, y, path: L.maze.pathFromStart(maze, x, y) };
    }
    return trailCache.path;
  }

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
    ctx.clearRect(0, 0, view.cssWidth, view.cssHeight);
    ctx.globalAlpha = BOARD_ALPHA;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);
    ctx.globalAlpha = 1;

    // Kropkowana trasa od startu do pola gracza. Labirynt nie ma pętli, więc przy zawracaniu
    // kropki same się zwijają. Kropki to zerowe kreski z okrągłym końcem.
    const trail = trailPath(maze, Math.round(pos.x), Math.round(pos.y));
    if (trail.length > 1) {
      ctx.strokeStyle = colors.trail;
      ctx.lineWidth = Math.max(2, cell * 0.1);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([0, Math.max(4, cell / 4)]);
      ctx.beginPath();
      trail.forEach((c, i) => {
        const cx = PAD + (c.x + 0.5) * cell;
        const cy = PAD + (c.y + 0.5) * cell;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Wyjście oznacza czerwony X.
    const inset = Math.max(2, Math.round(cell * 0.22));
    const exitLeft = PAD + (maze.width - 1) * cell;
    const exitTop = PAD + (maze.height - 1) * cell;
    ctx.strokeStyle = colors.exit;
    ctx.lineWidth = Math.max(2, cell * 0.14);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(exitLeft + inset, exitTop + inset);
    ctx.lineTo(exitLeft + cell - inset, exitTop + cell - inset);
    ctx.moveTo(exitLeft + cell - inset, exitTop + inset);
    ctx.lineTo(exitLeft + inset, exitTop + cell - inset);
    ctx.stroke();

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
