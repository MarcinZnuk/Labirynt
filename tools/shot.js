'use strict';

// Zrzut ekranu w Chrome bez okna przez protokół CDP.
// Powód: --window-size na Windows nie schodzi poniżej okolic 504 px, więc samą
// flagą nie da się zobaczyć układu telefonu. Emulacja ustawia dokładny viewport.
//
// Użycie: node tools/shot.js <plik[?query]> <nazwa> [SZER,WYS]

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { root, delay, launch } = require('./cdp');

const [target, name, size] = process.argv.slice(2);
if (!target || !name) {
  console.error('użycie: node tools/shot.js <plik[?query]> <nazwa> [SZER,WYS]');
  process.exit(2);
}
const [width, height] = (size || '390,844').split(',').map(Number);

function fileUrl(spec) {
  const [file, query] = spec.split('?');
  const href = pathToFileURL(path.resolve(root, file)).href;
  return query ? href + '?' + query : href;
}

(async () => {
  const chrome = await launch({ profile: 'profile-shot' });
  try {
    await chrome.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await chrome.send('Page.enable');
    await chrome.send('Page.navigate', { url: fileUrl(target) });
    await delay(1200);
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.join(root, '.shots'), { recursive: true });
    fs.writeFileSync(path.join(root, '.shots', name + '.png'), Buffer.from(shot.data, 'base64'));
    console.log('.shots/' + name + '.png');
  } finally {
    chrome.stop();
  }
})().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
