'use strict';

// Test pętli gry w Chrome bez okna: main.js łączy DOM z logiką, więc nie ma
// testów jednostkowych. Tutaj sprawdzamy zachowania widoczne dla gracza.
//
// Użycie: node tools/smoke.js

const path = require('path');
const { pathToFileURL } = require('url');
const { root, delay, launch } = require('./cdp');

const KEYS = {
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  Escape: 27,
  KeyN: 78,
};

const checks = [];

function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail: detail === undefined ? '' : String(detail) });
}

(async () => {
  const chrome = await launch({ profile: 'profile-smoke' });
  const evaluate = async (expression) => {
    const res = await chrome.send('Runtime.evaluate', { expression, returnByValue: true });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      const desc = (d.exception && (d.exception.description || d.exception.value)) || d.text;
      throw new Error(desc + ' | wyrazenie: ' + expression.slice(0, 120));
    }
    return res.result.value;
  };

  async function key(code, type) {
    await chrome.send('Input.dispatchKeyEvent', {
      type,
      code,
      key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code,
      windowsVirtualKeyCode: KEYS[code],
      nativeVirtualKeyCode: KEYS[code],
    });
  }

  async function tap(code) {
    await key(code, 'rawKeyDown');
    await key(code, 'keyUp');
    await delay(130);
  }

  const hud = () =>
    evaluate(
      '({' +
        ' screen: [...document.querySelectorAll(".screen")].filter((s) => !s.hidden).map((s) => s.dataset.screen).join(),' +
        ' level: document.getElementById("hud-level").textContent,' +
        ' time: document.getElementById("hud-time").textContent,' +
        ' moves: Number(document.getElementById("hud-moves").textContent),' +
        ' paused: !document.getElementById("pause-overlay").hidden' +
        '})'
    );

  try {
    await chrome.send('Page.enable');
    await chrome.send('Runtime.enable');
    await chrome.send('Emulation.setDeviceMetricsOverride', {
      width: 1000,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await chrome.send('Page.navigate', {
      url: pathToFileURL(path.resolve(root, 'index.html')).href + '?level=1',
    });
    await delay(1200);

    const start = await hud();
    check('start: ekran gry, poziom 1, zero ruchow, zegar stoi',
      start.screen === 'game' && start.level === '1' && start.moves === 0 && start.time === '0:00.0',
      JSON.stringify(start));

    // Ruch: kazdy kierunek po kolei, zeby trafic w otwarte przejscie.
    for (const dir of ['ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowDown']) await tap(dir);
    const moved = await hud();
    check('ruch: licznik rosnie i zegar rusza',
      moved.moves > 0 && moved.time !== '0:00.0', JSON.stringify(moved));

    // Pauza zatrzymuje zegar.
    await tap('Escape');
    const paused = await hud();
    await delay(500);
    const stillPaused = await hud();
    check('pauza: nakladka widoczna', paused.paused, JSON.stringify(paused));
    check('pauza: zegar stoi', paused.time === stillPaused.time, paused.time + ' -> ' + stillPaused.time);

    // Ruch w pauzie jest ignorowany.
    await tap('ArrowRight');
    const inPause = await hud();
    check('pauza: ruch ignorowany', inPause.moves === paused.moves, inPause.moves + ' vs ' + paused.moves);

    await tap('Escape');
    const resumed = await hud();
    check('pauza: wznowienie chowa nakladke', !resumed.paused, JSON.stringify(resumed));

    // Nowa plansza: ten sam poziom, zerowy licznik.
    await tap('KeyN');
    const fresh = await hud();
    check('nowa plansza: ten sam poziom, zero ruchow',
      fresh.level === '1' && fresh.moves === 0 && !fresh.paused, JSON.stringify(fresh));

    // Przejscie poziomu: eksploracja DFS. Licznik ruchow mowi, czy ruch sie udal,
    // wiec sciany poznajemy w trakcie, a pozycje liczymy z udanych ruchow.
    const STEP = { ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowUp: [0, -1] };
    const BACK = { ArrowRight: 'ArrowLeft', ArrowDown: 'ArrowUp', ArrowLeft: 'ArrowRight', ArrowUp: 'ArrowDown' };
    const size = 8;
    let pos = [0, 0];
    let moves = fresh.moves;
    const visited = new Set(['0,0']);
    const trail = [];
    let done = null;

    async function step(dir) {
      await key(dir, 'rawKeyDown');
      await key(dir, 'keyUp');
      await delay(115);
      const now = await hud();
      if (now.screen === 'done') {
        done = now;
        return true;
      }
      const ok = now.moves > moves;
      moves = now.moves;
      if (ok) pos = [pos[0] + STEP[dir][0], pos[1] + STEP[dir][1]];
      return ok;
    }

    for (let guard = 0; guard < 400 && !done; guard++) {
      const options = Object.keys(STEP).filter((dir) => {
        const nx = pos[0] + STEP[dir][0];
        const ny = pos[1] + STEP[dir][1];
        return nx >= 0 && ny >= 0 && nx < size && ny < size && !visited.has(nx + ',' + ny);
      });
      let advanced = false;
      for (const dir of options) {
        const nx = pos[0] + STEP[dir][0];
        const ny = pos[1] + STEP[dir][1];
        visited.add(nx + ',' + ny);
        if (await step(dir)) {
          if (done) break;
          trail.push(dir);
          advanced = true;
          break;
        }
        visited.delete(nx + ',' + ny);
        visited.add('sciana:' + pos + dir);
      }
      if (done || advanced) continue;
      if (trail.length === 0) break;
      await step(BACK[trail.pop()]);
    }

    check('ukonczenie poziomu: pokazuje sie ekran konca', Boolean(done), JSON.stringify(done));

    if (done) {
      const result = await evaluate(
        '({' +
          ' level: document.getElementById("done-level").textContent,' +
          ' time: document.getElementById("done-time").textContent,' +
          ' moves: document.getElementById("done-moves").textContent,' +
          ' record: document.getElementById("done-record").textContent,' +
          ' saved: window.localStorage.getItem("labirynt.v1")' +
          '})'
      );
      const saved = JSON.parse(result.saved || '{}');
      check('ukonczenie: ekran pokazuje poziom 1 i niezerowy czas',
        result.level === '1' && result.time !== '0:00.0' && Number(result.moves) > 0,
        JSON.stringify(result));
      check('ukonczenie: rekord zapisany raz, poziom 2 odblokowany',
        saved.unlocked === 2 && Object.keys(saved.best || {}).length === 1,
        result.saved);
      check('ukonczenie: napis o rekordzie', result.record.length > 0, result.record);

      // Menu -> Rekordy: jeden wiersz.
      await evaluate(`document.querySelector('[data-action=menu]').click()`);
      await delay(150);
      const continueVisible = await evaluate('!document.getElementById("continue-btn").hidden');
      check('menu: przycisk Kontynuuj widoczny po ukonczeniu poziomu', continueVisible);
      await evaluate(`document.querySelector('[data-action=records]').click()`);
      await delay(150);
      const rows = await evaluate('document.getElementById("records-body").children.length');
      check('rekordy: jeden wiersz', rows === 1, 'wierszy: ' + rows);

      // Czyszczenie rekordow pyta o potwierdzenie, wiec podstawiamy odpowiedz.
      await evaluate('window.confirm = () => true');
      await evaluate(`document.querySelector('[data-action=clearRecords]').click()`);
      await delay(150);
      const afterClear = await evaluate(
        '({ rows: document.getElementById("records-body").children.length,' +
          ' saved: window.localStorage.getItem("labirynt.v1") })'
      );
      const cleared = JSON.parse(afterClear.saved || '{}');
      check('rekordy: czyszczenie usuwa wiersze i zostawia odblokowanie',
        afterClear.rows === 0 && Object.keys(cleared.best || {}).length === 0 && cleared.unlocked === 2,
        afterClear.saved);

      // Motyw: przelacznik zmienia atrybut i zapis.
      await evaluate(`document.querySelector('[data-action=back]').click()`);
      await delay(100);
      await evaluate(`document.querySelector('[data-action=toggleTheme]').click()`);
      await delay(100);
      const theme = await evaluate(
        '({ attr: document.documentElement.dataset.theme,' +
          ' label: document.getElementById("theme-btn").textContent,' +
          ' saved: JSON.parse(window.localStorage.getItem("labirynt.v1")).theme })'
      );
      check('motyw: przelacznik ustawia jasny i zapisuje wybor',
        theme.attr === 'light' && theme.saved === 'light' && theme.label.indexOf('jasny') !== -1,
        JSON.stringify(theme));
    }
  } finally {
    chrome.stop();
  }

  let failed = 0;
  for (const c of checks) {
    if (c.ok) {
      console.log('PASS ' + c.name);
    } else {
      failed++;
      console.log('FAIL ' + c.name + (c.detail ? ': ' + c.detail : ''));
    }
  }
  console.log('\n' + (checks.length - failed) + '/' + checks.length + ' zaliczonych');
  process.exitCode = failed > 0 ? 1 : 0;
})().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
