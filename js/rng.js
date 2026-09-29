(function (L) {
  'use strict';

  // mulberry32: szybki generator 32-bitowy, w zupełności wystarczający do labiryntów.
  function create(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }

  L.rng = { create, randomSeed };
})(window.Labirynt = window.Labirynt || {});
