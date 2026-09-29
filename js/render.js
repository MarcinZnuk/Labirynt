(function (L) {
  'use strict';

  const PAD = 2;
  const MIN_CELL = 4;

  // Pseudo-3D: proporcje względem boku pola. Rzędy kukurydzy mają wysokość DEPTH,
  // czubki są przesunięte w prawo o SKEW (widać ścianę zachodnią i południową),
  // rząd ma grubość THICK, a pod planszą zostaje pas na tabliczkę "Wyjście".
  // Z korytarza widać pas ziemi o szerokości 1 - THICK - DEPTH pola: niższe i cieńsze
  // rzędy zostawiają miejsce, w którym ludzik stoi na ścieżce, a nie na kukurydzy.
  const DEPTH = 0.34;
  const SKEW = 0.14;
  const THICK = 0.22;
  const SIGN_ROWS = 0.9;
  const SIGN_PX = 12;
  const SIGN_TEXT = 'Wyjście';
  const SIGN_FONT = '"Rockwell", "Roboto Slab", "Clarendon", Georgia, serif';

  // wall to kolor czubków kukurydzy: to on odcina ściany od ścieżki (test kontrastu).
  const THEMES = {
    dark: {
      background: '#2b2016',
      soilDark: '#1f170f',
      soilLight: '#3b2c1d',
      shadow: 'rgba(0, 0, 0, 0.35)',
      wall: '#a9c957',
      wallFront: '#4b6e25',
      wallFrontDark: '#22330f',
      wallSide: '#3a5a1d',
      stalk: '#6f8f34',
      leaf: '#c4dc78',
      leafDeep: '#7fa23a',
      tassel: '#f0cf6a',
      cob: '#f2c14e',
      husk: '#88a83f',
      player: '#ff7a4d',
      pants: '#4a6fb0',
      skin: '#f0c8a0',
      hat: '#e8c35a',
      hatBand: '#8a3b1c',
      eye: '#2b1a0c',
      exit: '#e3b35a',
      signEdge: '#7a4e1e',
      signText: '#2b1a0c',
    },
    light: {
      background: '#dcc48e',
      soilDark: '#c8ad74',
      soilLight: '#e9d6a8',
      shadow: 'rgba(60, 40, 10, 0.22)',
      wall: '#2e5a18',
      wallFront: '#22460f',
      wallFrontDark: '#14290a',
      wallSide: '#1d3d0d',
      stalk: '#4f7d28',
      leaf: '#5f9a2e',
      leafDeep: '#244a12',
      tassel: '#d9a93a',
      cob: '#e8b53e',
      husk: '#6f9a34',
      player: '#b0301f',
      pants: '#2f4b7c',
      skin: '#f0c8a0',
      hat: '#f0d27a',
      hatBand: '#8a3b1c',
      eye: '#2b1a0c',
      exit: '#7a4a1c',
      signEdge: '#4a2a0c',
      signText: '#f6e7c1',
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

  // Rozmiar CSS z całkowitą liczbą pikseli na pole, rozdzielczość płótna pomnożona przez dpr.
  // Poza siatką płótno mieści wysokość kukurydzy, przesunięcie czubków i pas na tabliczkę;
  // piksel zapasu pokrywa zaokrąglenie ułamkowych proporcji w górę.
  function fitCanvas(canvas, availWidth, availHeight, maze, dpr) {
    const cols = maze.width + THICK + SKEW;
    const rows = maze.height + THICK + DEPTH + SIGN_ROWS;
    const cell = cellSize(availWidth - 1, availHeight - SIGN_PX - 1, cols, rows);
    const cssWidth = Math.ceil(cell * cols) + 2 * PAD;
    const cssHeight = Math.ceil(cell * rows) + SIGN_PX + 2 * PAD;
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    return {
      cell,
      dpr,
      cssWidth,
      cssHeight,
      originX: PAD + (cell * THICK) / 2,
      originY: PAD + cell * (DEPTH + THICK / 2),
      depth: cell * DEPTH,
      skew: cell * SKEW,
      thick: cell * THICK,
    };
  }

  // Stały pseudolosowy szum: ta sama plansza wygląda tak samo w każdej klatce.
  function noise(a, b, k) {
    const v = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453;
    return v - Math.floor(v);
  }

  function polygon(c, points) {
    c.beginPath();
    c.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
    c.closePath();
    c.fill();
  }

  function ellipse(c, x, y, rx, ry, rotation) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, rotation || 0, 0, Math.PI * 2);
    c.fill();
  }

  function paintSoil(c, view, maze, colors) {
    const cell = view.cell;
    const size = Math.max(1, cell * 0.07);
    for (const [color, k0] of [[colors.soilDark, 0], [colors.soilLight, 3]]) {
      c.fillStyle = color;
      c.beginPath();
      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          for (let k = k0; k < k0 + 3; k++) {
            c.rect(
              view.originX + (x + noise(x, y, k)) * cell,
              view.originY + (y + noise(y, x, k + 7)) * cell,
              size,
              size
            );
          }
        }
      }
      c.fill();
    }
  }

  // Bryły rzędów kukurydzy w kolejności malowania: od północy do południa, a w wierszu
  // od wschodu na zachód, bo widz patrzy z południowego zachodu i bliższe bryły zasłaniają dalsze.
  function wallBoxes(view, maze) {
    const WALL = L.maze.WALL;
    const cell = view.cell;
    const half = view.thick / 2;
    const gx = (x) => view.originX + x * cell;
    const gy = (y) => view.originY + y * cell;
    const lastX = maze.width - 1;
    const lastY = maze.height - 1;

    function horizontal(x, line) {
      if (line < maze.height) return L.maze.hasWall(maze, x, line, WALL.N);
      // Przerwa w dolnym rzędzie pod polem wyjścia prowadzi do tabliczki.
      return x !== lastX && L.maze.hasWall(maze, x, lastY, WALL.S);
    }

    const boxes = [];
    for (let line = 0; line <= maze.height; line++) {
      // Sąsiednie odcinki poziome łączymy w jeden rząd, żeby nie było szwów.
      const runs = [];
      let start = -1;
      for (let x = 0; x <= maze.width; x++) {
        const wall = x < maze.width && horizontal(x, line);
        if (wall && start < 0) start = x;
        if (!wall && start >= 0) {
          runs.push([start, x]);
          start = -1;
        }
      }
      for (let i = runs.length - 1; i >= 0; i--) {
        const [from, to] = runs[i];
        boxes.push({ x0: gx(from) - half, x1: gx(to) + half, y0: gy(line) - half, y1: gy(line) + half, seed: line * 97 + from });
      }
      if (line === maze.height) break;
      for (let x = maze.width; x >= 0; x--) {
        const wall = x < maze.width
          ? L.maze.hasWall(maze, x, line, WALL.W)
          : L.maze.hasWall(maze, lastX, line, WALL.E);
        if (wall) {
          boxes.push({ x0: gx(x) - half, x1: gx(x) + half, y0: gy(line) - half, y1: gy(line + 1) + half, seed: 5000 + line * 97 + x });
        }
      }
    }
    return boxes;
  }

  // Łodygi wzdłuż krawędzi bryły przy ziemi, od (ax, ay) do (bx, by), pochylone jak ściana.
  function paintStalks(c, view, colors, ax, ay, bx, by, seed) {
    const cell = view.cell;
    const h = view.depth;
    const s = view.skew;
    const length = Math.hypot(bx - ax, by - ay);
    const step = Math.max(3, cell * 0.17);
    const count = Math.max(1, Math.floor(length / step));
    const cobs = [];
    c.strokeStyle = colors.stalk;
    c.lineWidth = Math.max(1, cell * 0.045);
    c.beginPath();
    for (let i = 0; i < count; i++) {
      const t = (i + 0.3 + noise(seed, i, 1) * 0.4) / count;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      c.moveTo(px, py);
      c.lineTo(px + s, py - h);
      // Liść odchodzący od łodygi w losową stronę.
      const lt = 0.35 + noise(seed, i, 2) * 0.35;
      const lx = px + s * lt;
      const ly = py - h * lt;
      const dir = noise(seed, i, 3) < 0.5 ? -1 : 1;
      c.moveTo(lx, ly);
      c.quadraticCurveTo(lx + dir * cell * 0.08, ly - cell * 0.06, lx + dir * cell * 0.13, ly + cell * 0.02);
      if (cell >= 16 && noise(seed, i, 4) < 0.14) cobs.push([lx - dir * cell * 0.04, ly, dir]);
    }
    c.stroke();
    for (const [x, y, dir] of cobs) {
      c.fillStyle = colors.cob;
      ellipse(c, x, y, cell * 0.035, cell * 0.08, dir * 0.35);
      c.fillStyle = colors.husk;
      ellipse(c, x + dir * cell * 0.02, y + cell * 0.03, cell * 0.025, cell * 0.06, dir * 0.6);
    }
  }

  function paintBox(c, view, b, colors) {
    const cell = view.cell;
    const h = view.depth;
    const s = view.skew;

    c.fillStyle = colors.wallSide;
    polygon(c, [[b.x0, b.y0], [b.x0, b.y1], [b.x0 + s, b.y1 - h], [b.x0 + s, b.y0 - h]]);

    const front = c.createLinearGradient(0, b.y1, 0, b.y1 - h);
    front.addColorStop(0, colors.wallFrontDark);
    front.addColorStop(1, colors.wallFront);
    c.fillStyle = front;
    polygon(c, [[b.x0, b.y1], [b.x1, b.y1], [b.x1 + s, b.y1 - h], [b.x0 + s, b.y1 - h]]);

    if (cell >= 8) {
      paintStalks(c, view, colors, b.x0, b.y1, b.x1, b.y1, b.seed);
      paintStalks(c, view, colors, b.x0, b.y0, b.x0, b.y1, b.seed + 0.5);
    }

    const tx = b.x0 + s;
    const ty = b.y0 - h;
    const w = b.x1 - b.x0;
    const d = b.y1 - b.y0;
    c.fillStyle = colors.wall;
    c.fillRect(tx, ty, w, d);
    if (cell < 8) return;

    // Kępy liści wystają poza krawędź czubka, więc rząd nie wygląda jak równa listwa.
    const along = Math.max(w, d);
    const count = Math.max(2, Math.round(along / (cell * 0.2)));
    const tassels = [];
    for (let i = 0; i < count; i++) {
      const t = (i + noise(b.seed, i, 5)) / count;
      const cx = w >= d ? tx + w * t : tx + w / 2 + (noise(b.seed, i, 6) - 0.5) * w;
      const cy = w >= d ? ty + d / 2 + (noise(b.seed, i, 6) - 0.5) * d : ty + d * t;
      c.fillStyle = noise(b.seed, i, 7) < 0.5 ? colors.leaf : colors.leafDeep;
      ellipse(c, cx, cy, cell * 0.1, cell * 0.045, noise(b.seed, i, 8) * Math.PI);
      if (noise(b.seed, i, 9) < 0.4) tassels.push([cx, cy]);
    }
    // Wiechy: po trzy krótkie kłosy rozchodzące się w górę ze szczytu łodygi.
    c.strokeStyle = colors.tassel;
    c.lineWidth = Math.max(1, cell * 0.03);
    c.lineCap = 'round';
    c.beginPath();
    const spike = cell * 0.09;
    for (const [x, y] of tassels) {
      for (const angle of [-0.6, 0, 0.6]) {
        c.moveTo(x, y);
        c.lineTo(x + Math.sin(angle) * spike, y - Math.cos(angle) * spike);
      }
    }
    c.stroke();
  }

  function paintSign(c, view, maze, colors) {
    const cell = view.cell;
    const gapX = view.originX + (maze.width - 0.5) * cell;
    const top = view.originY + maze.height * cell + view.thick / 2 + 2;
    const height = view.cssHeight - PAD - top;
    const font = Math.max(9, Math.min(24, Math.floor(height * 0.6)));
    c.font = '700 ' + font + 'px ' + SIGN_FONT;
    const width = c.measureText(SIGN_TEXT).width + font * 1.2;
    const x = Math.max(PAD, Math.min(gapX - width / 2, view.cssWidth - PAD - width));
    const radius = Math.min(4, height / 4);

    c.fillStyle = colors.shadow;
    c.fillRect(x + 2, top + 2, width, height);
    c.fillStyle = colors.exit;
    c.strokeStyle = colors.signEdge;
    c.lineWidth = Math.max(1, font * 0.09);
    c.beginPath();
    c.roundRect(x, top, width, height, radius);
    c.fill();
    c.stroke();
    // Słoje deski.
    c.globalAlpha = 0.25;
    c.beginPath();
    c.moveTo(x + width * 0.08, top + height * 0.3);
    c.lineTo(x + width * 0.55, top + height * 0.3);
    c.moveTo(x + width * 0.4, top + height * 0.78);
    c.lineTo(x + width * 0.92, top + height * 0.78);
    c.stroke();
    c.globalAlpha = 1;

    c.fillStyle = colors.signText;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(SIGN_TEXT, x + width / 2, top + height / 2 + font * 0.05);
  }

  function paintField(c, view, maze, colors) {
    c.fillStyle = colors.background;
    c.fillRect(0, 0, view.cssWidth, view.cssHeight);
    paintSoil(c, view, maze, colors);
    const boxes = wallBoxes(view, maze);
    // Cień pada na południowy wschód; jego część na bryłach zamalują ściany.
    const off = view.cell * 0.14;
    c.fillStyle = colors.shadow;
    c.beginPath();
    for (const b of boxes) c.rect(b.x0 + off, b.y0 + off, b.x1 - b.x0, b.y1 - b.y0);
    c.fill();
    for (const b of boxes) paintBox(c, view, b, colors);
    paintSign(c, view, maze, colors);
  }

  // Pole kukurydzy jest bogate w detale, więc malujemy je raz do bufora i w każdej
  // klatce tylko kopiujemy; nowy bufor powstaje przy zmianie planszy, rozmiaru lub motywu.
  let cache = null;

  function fieldLayer(view, maze, colors, theme) {
    const key = [view.cell, view.dpr, view.cssWidth, view.cssHeight, theme].join('|');
    if (cache && cache.maze === maze && cache.key === key) return cache.canvas;
    if (typeof document === 'undefined') return null;
    const layer = cache ? cache.canvas : document.createElement('canvas');
    layer.width = Math.round(view.cssWidth * view.dpr);
    layer.height = Math.round(view.cssHeight * view.dpr);
    const c = layer.getContext('2d');
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    paintField(c, view, maze, colors);
    cache = { maze, key, canvas: layer };
    return layer;
  }

  // Punkt, w którym ludzik stoi: w widocznym pasie ziemi między północnym rzędem
  // (jego podstawa) a czubkiem południowego rzędu, który przy widoku z ukosa zachodzi na pole.
  function walkerFeet(view, pos) {
    const floorTop = view.thick / 2;
    const floorBottom = view.cell - view.thick / 2 - view.depth;
    return {
      x: view.originX + (pos.x + 0.5) * view.cell,
      y: view.originY + pos.y * view.cell + floorTop + (floorBottom - floorTop) * 0.6,
      shadowRy: view.cell * 0.06,
    };
  }

  // Ludzik w słomkowym kapeluszu.
  function drawWalker(c, view, pos, colors, actor) {
    const cell = view.cell;
    const feet = walkerFeet(view, pos);
    const x = feet.x;
    const y = feet.y;
    const tall = cell * 0.8;
    const facing = actor.facing || 'down';
    const side = facing === 'left' ? -1 : facing === 'right' ? 1 : 0;
    const swing = actor.moving ? Math.sin(actor.phase * Math.PI * 2) : 0;

    c.fillStyle = colors.shadow;
    ellipse(c, x, y, cell * 0.22, feet.shadowRy, 0);

    const hip = y - tall * 0.36;
    const shoulder = y - tall * 0.64;
    const headR = tall * 0.13;
    const headY = shoulder - headR * 0.9;
    const bodyW = cell * 0.3;

    if (cell < 10) {
      c.fillStyle = colors.player;
      c.fillRect(x - bodyW / 2, shoulder, bodyW, y - shoulder);
      c.fillStyle = colors.hat;
      ellipse(c, x, headY, headR * 1.4, headR, 0);
      return;
    }

    c.lineCap = 'round';
    c.strokeStyle = colors.pants;
    c.lineWidth = Math.max(1.2, cell * 0.085);
    c.beginPath();
    if (side === 0) {
      // Przodem lub tyłem: nogi na zmianę unoszą się.
      const lift = swing * cell * 0.06;
      c.moveTo(x - bodyW * 0.25, hip);
      c.lineTo(x - bodyW * 0.25, y - Math.max(0, lift));
      c.moveTo(x + bodyW * 0.25, hip);
      c.lineTo(x + bodyW * 0.25, y - Math.max(0, -lift));
    } else {
      // Bokiem: krok w przód i w tył.
      const stride = swing * cell * 0.1;
      c.moveTo(x, hip);
      c.lineTo(x + stride, y);
      c.moveTo(x, hip);
      c.lineTo(x - stride, y);
    }
    c.stroke();

    c.fillStyle = colors.player;
    c.beginPath();
    c.roundRect(x - bodyW / 2, shoulder, bodyW, hip - shoulder + cell * 0.04, bodyW * 0.3);
    c.fill();

    c.strokeStyle = colors.player;
    c.lineWidth = Math.max(1, cell * 0.07);
    c.beginPath();
    const armSwing = -swing * cell * 0.08;
    const handY = hip + cell * 0.02;
    if (side === 0) {
      c.moveTo(x - bodyW / 2, shoulder + cell * 0.03);
      c.lineTo(x - bodyW / 2 - cell * 0.05, handY + armSwing * 0.5);
      c.moveTo(x + bodyW / 2, shoulder + cell * 0.03);
      c.lineTo(x + bodyW / 2 + cell * 0.05, handY - armSwing * 0.5);
    } else {
      c.moveTo(x, shoulder + cell * 0.03);
      c.lineTo(x + armSwing * side, handY);
    }
    c.stroke();

    c.fillStyle = colors.skin;
    ellipse(c, x, headY, headR, headR, 0);

    if (cell >= 18 && facing !== 'up') {
      c.fillStyle = colors.eye;
      const eyeR = Math.max(0.8, cell * 0.018);
      const eyeY = headY + headR * 0.15;
      if (side === 0) {
        ellipse(c, x - headR * 0.4, eyeY, eyeR, eyeR, 0);
        ellipse(c, x + headR * 0.4, eyeY, eyeR, eyeR, 0);
      } else {
        ellipse(c, x + side * headR * 0.5, eyeY, eyeR, eyeR, 0);
      }
    }

    // Kapelusz: rondo, pasek i główka.
    const brimY = headY - headR * 0.45;
    c.fillStyle = colors.hat;
    ellipse(c, x, brimY, headR * 1.75, headR * 0.5, 0);
    c.fillStyle = colors.hatBand;
    c.fillRect(x - headR * 0.85, brimY - headR * 0.45, headR * 1.7, headR * 0.3);
    c.fillStyle = colors.hat;
    c.beginPath();
    c.roundRect(x - headR * 0.8, brimY - headR * 1.05, headR * 1.6, headR * 0.62, headR * 0.3);
    c.fill();
  }

  // actor: { facing: 'up' | 'down' | 'left' | 'right', moving, phase z przedziału [0, 1] }.
  function draw(ctx, view, maze, pos, theme, actor) {
    const colors = THEMES[theme] || THEMES.dark;
    const layer = fieldLayer(view, maze, colors, theme);
    if (layer) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer, 0, 0);
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    } else {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      paintField(ctx, view, maze, colors);
    }
    drawWalker(ctx, view, pos, colors, actor || {});
  }

  L.render = { PAD, THEMES, SIGN_TEXT, cellSize, contrastRatio, fitCanvas, wallBoxes, walkerFeet, draw };
})(window.Labirynt = window.Labirynt || {});
