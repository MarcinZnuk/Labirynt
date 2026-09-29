(function () {
  'use strict';

  const { test, assert, assertEqual } = window.T;
  const L = window.Labirynt;

  function take(rand, count) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(rand());
    return out;
  }

  test('rng: to samo ziarno daje ten sam ciąg', () => {
    assertEqual(take(L.rng.create(42), 20), take(L.rng.create(42), 20));
  });

  test('rng: różne ziarna dają różne ciągi', () => {
    assert(JSON.stringify(take(L.rng.create(1), 20)) !== JSON.stringify(take(L.rng.create(2), 20)));
  });

  test('rng: wartości w przedziale [0, 1)', () => {
    for (const v of take(L.rng.create(7), 1000)) assert(v >= 0 && v < 1, 'wartość ' + v);
  });

  test('rng: randomSeed zwraca 32-bitową liczbę całkowitą bez znaku', () => {
    const seed = L.rng.randomSeed();
    assert(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'ziarno ' + seed);
  });
})();
