(function () {
  'use strict';

  const { test, assertEqual } = window.T;
  const U = window.Labirynt.ui;

  test('ui: formatTime pokazuje minuty, sekundy i dziesiąte części', () => {
    assertEqual(
      [0, 99, 100, 59999, 65432, 600000].map(U.formatTime),
      ['0:00.0', '0:00.0', '0:00.1', '0:59.9', '1:05.4', '10:00.0']
    );
  });

  test('ui: formatTime zamienia wartość ujemną na zero', () => {
    assertEqual(U.formatTime(-5), '0:00.0');
  });

  test('ui: recordText opisuje rodzaj rekordu', () => {
    assertEqual(
      [U.recordText(true, true), U.recordText(true, false), U.recordText(false, true), U.recordText(false, false)],
      ['Nowy rekord czasu i ruchów!', 'Nowy rekord czasu!', 'Nowy rekord ruchów!', '']
    );
  });

  test('ui: recordRows sortuje poziomy liczbowo', () => {
    const progress = {
      unlocked: 11,
      best: { 10: { timeMs: 65432, moves: 90 }, 2: { timeMs: 1500, moves: 14 } },
      theme: 'dark',
    };
    assertEqual(U.recordRows(progress), [
      { level: 2, time: '0:01.5', moves: '14' },
      { level: 10, time: '1:05.4', moves: '90' },
    ]);
  });
})();
