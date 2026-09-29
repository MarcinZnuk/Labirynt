'use strict';

const fs = require('fs');
const path = require('path');

// Skrypty gry zapisują API w window.Labirynt; w Node window to obiekt globalny.
globalThis.window = globalThis;

const testsDir = __dirname;
const html = fs.readFileSync(path.join(testsDir, 'test.html'), 'utf8');
const sources = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);

for (const src of sources) {
  require(path.resolve(testsDir, src));
}

const results = window.T.run();
let failed = 0;
for (const r of results) {
  if (r.ok) {
    console.log('PASS ' + r.name);
  } else {
    failed++;
    console.log('FAIL ' + r.name + ': ' + r.error);
  }
}
console.log('\n' + (results.length - failed) + '/' + results.length + ' zaliczonych');
process.exitCode = failed > 0 ? 1 : 0;
