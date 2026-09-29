(function () {
  'use strict';

  const { test, assert, assertEqual } = window.T;
  const R = window.Labirynt.render;

  test('render: 25x25 na ekranie 360 px (margines 12 px) ma pole 13 px', () => {
    assertEqual(R.cellSize(336, 600, 25, 25), 13);
  });

  test('render: rozmiar pola wyznacza węższy wymiar', () => {
    assertEqual(R.cellSize(1000, 204, 10, 10), 20);
    assertEqual(R.cellSize(204, 1000, 10, 10), 20);
  });

  test('render: pole nigdy nie jest mniejsze niż 4 px', () => {
    assertEqual(R.cellSize(10, 10, 25, 25), 4);
    assertEqual(R.cellSize(0, 0, 8, 8), 4);
  });

  test('render: contrastRatio czarny na białym = 21', () => {
    assert(Math.abs(R.contrastRatio('#000000', '#ffffff') - 21) < 0.01);
    assert(Math.abs(R.contrastRatio('#777777', '#777777') - 1) < 0.01);
  });

  test('render: plansza z kukurydzą i tabliczką mieści się w dostępnym miejscu', () => {
    for (const [w, h, size] of [[336, 600, 25], [1000, 204, 10], [390, 700, 8], [1600, 900, 25]]) {
      const canvas = { style: {} };
      const view = R.fitCanvas(canvas, w, h, { width: size, height: size }, 2);
      assert(view.cssWidth <= w && view.cssHeight <= h, w + 'x' + h + ' -> ' + view.cssWidth + 'x' + view.cssHeight);
      assertEqual(canvas.width, view.cssWidth * 2);
    }
  });

  test('render: w dolnym rzędzie kukurydzy jest przerwa pod polem wyjścia', () => {
    const M = window.Labirynt.maze;
    const maze = M.generate(6, 6, window.Labirynt.rng.create(7));
    const view = R.fitCanvas({ style: {} }, 400, 400, maze, 1);
    const bottom = view.originY + 6 * view.cell;
    const exitLeft = view.originX + 5 * view.cell;
    const covering = R.wallBoxes(view, maze).filter(
      (b) => b.y0 < bottom && b.y1 > bottom && b.x0 < exitLeft + view.cell / 2 && b.x1 > exitLeft + view.cell / 2
    );
    assertEqual(covering.length, 0);
  });

  for (const name of Object.keys(R.THEMES)) {
    test(`render: motyw ${name} - ściany mają kontrast co najmniej 4.5:1`, () => {
      const c = R.THEMES[name];
      assert(R.contrastRatio(c.wall, c.background) >= 4.5, 'kontrast ' + R.contrastRatio(c.wall, c.background));
    });

    test(`render: motyw ${name} - gracz i wyjście mają kontrast co najmniej 3:1`, () => {
      const c = R.THEMES[name];
      assert(R.contrastRatio(c.player, c.background) >= 3, 'gracz');
      assert(R.contrastRatio(c.exit, c.background) >= 3, 'wyjście');
    });
  }
})();
