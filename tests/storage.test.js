(function () {
  'use strict';

  const { test, assert, assertEqual } = window.T;
  const S = window.Labirynt.storage;

  function memory(initial) {
    const data = Object.assign({}, initial);
    return {
      data,
      getItem: (key) => (Object.hasOwn(data, key) ? data[key] : null),
      setItem: (key, value) => {
        data[key] = String(value);
      },
    };
  }

  test('storage: brak danych daje stan domyślny', () => {
    const store = S.create(() => memory());
    assertEqual(store.load(), { unlocked: 1, best: {}, theme: 'dark' });
  });

  test('storage: zapis i odczyt zwracają ten sam postęp', () => {
    const backend = memory();
    const store = S.create(() => backend);
    const progress = { unlocked: 4, best: { 1: { timeMs: 5300, moves: 22 } }, theme: 'light' };
    assertEqual(store.save(progress), true);
    assertEqual(store.load(), progress);
    assert(Object.hasOwn(backend.data, 'labirynt.v1'), 'klucz labirynt.v1');
  });

  test('storage: niepoprawny JSON daje stan domyślny', () => {
    const store = S.create(() => memory({ 'labirynt.v1': '{nie json' }));
    assertEqual(store.load(), S.defaults());
  });

  test('storage: wyjątek przy dostępie do magazynu daje stan domyślny i save = false', () => {
    const store = S.create(() => {
      throw new Error('SecurityError');
    });
    assertEqual(store.load(), S.defaults());
    assertEqual(store.save(S.defaults()), false);
  });

  test('storage: wyjątki getItem i setItem są przechwytywane', () => {
    const broken = {
      getItem: () => {
        throw new Error('odczyt');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const store = S.create(() => broken);
    assertEqual(store.load(), S.defaults());
    assertEqual(store.save(S.defaults()), false);
  });

  test('storage: sanitize odrzuca dane innego typu niż obiekt', () => {
    for (const raw of [null, 'tekst', 5, [1, 2], true]) {
      assertEqual(S.sanitize(raw), S.defaults(), JSON.stringify(raw));
    }
  });

  test('storage: sanitize poprawia każde pole osobno', () => {
    assertEqual(S.sanitize({ unlocked: 'abc', best: [1, 2], theme: 'neon' }), S.defaults());
    assertEqual(S.sanitize({ unlocked: 0 }).unlocked, 1);
    assertEqual(S.sanitize({ unlocked: 3.5 }).unlocked, 1);
    assertEqual(S.sanitize({ unlocked: 6, theme: 'light' }), { unlocked: 6, best: {}, theme: 'light' });
  });

  test('storage: sanitize zostawia tylko poprawne rekordy', () => {
    const raw = JSON.parse(
      '{"best":{"2":{"timeMs":-5,"moves":3},"3":{"timeMs":100,"moves":0},"x":{"timeMs":1,"moves":1},' +
        '"__proto__":{"timeMs":1,"moves":1},"05":{"timeMs":1,"moves":1},"6":null,' +
        '"4":{"timeMs":1200,"moves":40,"extra":true}}}'
    );
    assertEqual(S.sanitize(raw).best, { 4: { timeMs: 1200, moves: 40 } });
  });

  test('storage: pierwszy wynik jest rekordem i odblokowuje kolejny poziom', () => {
    const r = S.recordResult(S.defaults(), 1, 5000, 30);
    assertEqual([r.newBestTime, r.newBestMoves], [true, true]);
    assertEqual(r.progress.best[1], { timeMs: 5000, moves: 30 });
    assertEqual(r.progress.unlocked, 2);
  });

  test('storage: rekord czasu i rekord ruchów liczone osobno', () => {
    const first = S.recordResult(S.defaults(), 1, 5000, 30).progress;
    const r = S.recordResult(first, 1, 4000, 35);
    assertEqual([r.newBestTime, r.newBestMoves], [true, false]);
    assertEqual(r.progress.best[1], { timeMs: 4000, moves: 30 });
  });

  test('storage: gorszy wynik nie zmienia rekordu', () => {
    const first = S.recordResult(S.defaults(), 1, 5000, 30).progress;
    const r = S.recordResult(first, 1, 5000, 30);
    assertEqual([r.newBestTime, r.newBestMoves], [false, false]);
    assertEqual(r.progress.best[1], { timeMs: 5000, moves: 30 });
  });

  test('storage: niższy poziom nie cofa odblokowania', () => {
    const progress = { unlocked: 7, best: {}, theme: 'dark' };
    assertEqual(S.recordResult(progress, 2, 1000, 10).progress.unlocked, 7);
  });

  test('storage: recordResult nie zmienia wejścia', () => {
    const progress = S.defaults();
    S.recordResult(progress, 1, 1000, 10);
    assertEqual(progress, S.defaults());
  });

  test('storage: clearRecords czyści rekordy, zostawia odblokowanie i motyw', () => {
    const progress = { unlocked: 5, best: { 1: { timeMs: 1, moves: 1 } }, theme: 'light' };
    assertEqual(S.clearRecords(progress), { unlocked: 5, best: {}, theme: 'light' });
  });
})();
