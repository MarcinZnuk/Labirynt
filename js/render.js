(function (L) {
  'use strict';

  const PAD = 2;
  const MIN_CELL = 4;
  // Dodatkowy margines płótna na połowę grubości zewnętrznego żywopłotu.
  // Najwyżej 3 px: przy 25x25 na ekranie 360 px pole musi mieć co najmniej 13 px.
  const EDGE = 3;
  const MAX_HEDGE = 2 * (PAD + EDGE);

  // Ogród: żwirowa ścieżka, żywopłot ze światłem i cieniem, latarnia gracza, księżycowa brama wyjścia.
  const THEMES = {
    dark: {
      background: '#121c18',
      wall: '#7fb26a',
      wallShade: '#070d0a',
      wallLight: '#a9d48f',
      player: '#f4b942',
      exit: '#c8b8ff',
    },
    light: {
      background: '#dcd8c8',
      wall: '#2e5530',
      wallShade: '#a9a592',
      wallLight: '#4c7a48',
      player: '#a34e00',
      exit: '#5b3fa8',
    },
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

  function alpha(hex, a) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // Rozmiar CSS z całkowitą liczbą pikseli na pole, rozdzielczość płótna pomnożona przez dpr.
  function fitCanvas(canvas, availWidth, availHeight, maze, dpr) {
    const cell = cellSize(availWidth - 2 * EDGE, availHeight - 2 * EDGE, maze.width, maze.height);
    const origin = PAD + EDGE;
    const cssWidth = cell * maze.width + 2 * origin;
    const cssHeight = cell * maze.height + 2 * origin;
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    return { cell, dpr, cssWidth, cssHeight, origin };
  }

  function wallPath(ctx, maze, cell, origin, dx, dy) {
    const WALL = L.maze.WALL;
    ctx.beginPath();
    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const left = origin + x * cell + dx;
        const top = origin + y * cell + dy;
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
  }

  function draw(ctx, view, maze, pos, theme) {
    const colors = THEMES[theme] || THEMES.dark;
    const cell = view.cell;
    const origin = view.origin === undefined ? PAD : view.origin;
    const center = (v) => origin + (v + 0.5) * cell;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);

    // Brama wyjścia: poświata i pierścień, żeby wyjście było widać także w cieniu żywopłotu.
    const ex = center(maze.width - 1);
    const ey = center(maze.height - 1);
    const halo = ctx.createRadialGradient(ex, ey, 0, ex, ey, cell * 0.9);
    halo.addColorStop(0, alpha(colors.exit, 0.45));
    halo.addColorStop(1, alpha(colors.exit, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(ex - cell, ey - cell, cell * 2, cell * 2);
    ctx.strokeStyle = colors.exit;
    ctx.lineWidth = Math.max(1.5, cell * 0.08);
    ctx.beginPath();
    ctx.arc(ex, ey, cell * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = colors.exit;
    ctx.beginPath();
    ctx.arc(ex, ey, cell * 0.12, 0, Math.PI * 2);
    ctx.fill();

    // Żywopłot: cień przesunięty w dół, bryła, jaśniejszy grzbiet.
    const hedge = Math.max(1.5, Math.min(MAX_HEDGE, cell * 0.3));
    const drop = Math.max(1, hedge * 0.35);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    wallPath(ctx, maze, cell, origin, 0, drop);
    ctx.strokeStyle = colors.wallShade;
    ctx.lineWidth = hedge;
    ctx.stroke();
    wallPath(ctx, maze, cell, origin, 0, 0);
    ctx.strokeStyle = colors.wall;
    ctx.stroke();
    if (hedge >= 5) {
      wallPath(ctx, maze, cell, origin, 0, -hedge * 0.18);
      ctx.strokeStyle = colors.wallLight;
      ctx.lineWidth = hedge * 0.3;
      ctx.stroke();
    }

    // Latarnia gracza: ciepła poświata sięgająca sąsiednich pól.
    const px = center(pos.x);
    const py = center(pos.y);
    const glow = ctx.createRadialGradient(px, py, cell * 0.1, px, py, cell * 1.6);
    glow.addColorStop(0, alpha(colors.player, theme === 'light' ? 0.22 : 0.38));
    glow.addColorStop(1, alpha(colors.player, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(px - cell * 1.6, py - cell * 1.6, cell * 3.2, cell * 3.2);
    ctx.fillStyle = colors.player;
    ctx.beginPath();
    ctx.arc(px, py, cell * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = alpha('#ffffff', theme === 'light' ? 0.35 : 0.6);
    ctx.beginPath();
    ctx.arc(px - cell * 0.07, py - cell * 0.07, cell * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  L.render = { PAD, THEMES, cellSize, contrastRatio, fitCanvas, draw };
})(window.Labirynt = window.Labirynt || {});
