(function (root) {
  'use strict';

  const cases = [];

  function test(name, fn) {
    cases.push({ name, fn });
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'warunek niespełniony');
  }

  function assertEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error((message ? message + ': ' : '') + 'oczekiwano ' + e + ', otrzymano ' + a);
    }
  }

  function assertThrows(fn, message) {
    try {
      fn();
    } catch (err) {
      return;
    }
    throw new Error(message || 'oczekiwano wyjątku');
  }

  // Testy mogą zwracać obietnicę; wykonują się po kolei.
  async function run() {
    const results = [];
    for (const c of cases) {
      try {
        await c.fn();
        results.push({ name: c.name, ok: true });
      } catch (err) {
        results.push({ name: c.name, ok: false, error: err && err.message ? err.message : String(err) });
      }
    }
    return results;
  }

  root.T = { test, assert, assertEqual, assertThrows, run };
})(window);
