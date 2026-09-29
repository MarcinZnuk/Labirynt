(function () {
  'use strict';

  const { test, assert, assertEqual } = window.T;
  const R = window.Labirynt.render;

  test('render: 25x25 na ekranie 360 px (margines 12 px) ma pole 13 px', () => {
    assertEqual(R.cellSize(336, 600, 25, 25), 13);
  });

  test('render: fitCanvas z marginesem żywopłotu nadal daje pole 13 px dla 25x25 na 360 px', () => {
    const canvas = { style: {} };
    const view = R.fitCanvas(canvas, 336, 600, { width: 25, height: 25 }, 1);
    assert(view.cell >= 13, 'pole ' + view.cell);
    assertEqual(view.cssWidth, view.cell * 25 + 2 * view.origin);
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
