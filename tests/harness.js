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

  function run() {
    return cases.map((c) => {
      try {
        c.fn();
        return { name: c.name, ok: true };
      } catch (err) {
        return { name: c.name, ok: false, error: err && err.message ? err.message : String(err) };
      }
    });
  }

  root.T = { test, assert, assertEqual, assertThrows, run };
})(window);
