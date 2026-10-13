(function () {
  'use strict';

  const { test, assert, assertEqual } = window.T;
  const L = window.Labirynt;
  const D = L.dust;

  test('dust: liczba drobinek rośnie z powierzchnią ekranu, w granicach', () => {
    assertEqual(D.countFor(390, 844), 25, 'telefon');
    assertEqual(D.countFor(1366, 768), 70, 'laptop');
    assertEqual(D.countFor(3840, 2160), 110, 'duży ekran');
  });

  test('dust: drobinki powstają w obrębie ekranu', () => {
    const rand = L.rng.create(5);
    const list = D.createParticles(1366, 768, rand);
    assertEqual(list.length, 70);
    assert(list.every((p) => p.x >= 0 && p.x <= 1366 && p.y >= 0 && p.y <= 768), 'poza ekranem');
  });

  test('dust: drobinka unosi się do góry', () => {
    const p = { x: 100, y: 500, r: 1, speed: 10, phase: 0, swayAmp: 5, alpha: 0.5 };
    D.step(p, 2, 1366, 768, () => 0.5);
    assertEqual(p.y, 480);
  });

  test('dust: drobinka, która wyleci górą, wraca od dołu w nowym miejscu', () => {
    const p = { x: 100, y: -9, r: 1, speed: 10, phase: 0, swayAmp: 5, alpha: 0.5 };
    D.step(p, 0.1, 1000, 700, () => 0.25);
    assertEqual([p.x, p.y], [250, 708]);
  });

  test('dust: przy świecy drobinki są jaśniejsze niż daleko od niej', () => {
    const nearCandle = D.lightAt(1250, 40, 1366, 768);
    const farCorner = D.lightAt(50, 740, 1366, 768);
    assert(nearCandle > 0.9, 'przy świecy ' + nearCandle);
    assert(farCorner < 0.45, 'w rogu ' + farCorner);
  });
})();
