'use strict';

// Test gry z bazą w Chrome bez okna. Zamiast Supabase strona dostaje sztuczny fetch,
// wstrzyknięty przed skryptami gry, który odpowiada jak Supabase i zapisuje wywołania.
// Ustawienia sztucznego serwera na następne załadowanie strony: sessionStorage 'fake'.
//
// Użycie: node tools/smoke-cloud.js

const path = require('path');
const { pathToFileURL } = require('url');
const { root, delay, launch } = require('./cdp');

const KEYS = { ArrowRight: 39, ArrowDown: 40, Escape: 27 };

const FAKE = `
(() => {
  const BASE = 'https://fake.supabase.test';
  window.Labirynt = { cloudConfig: { url: BASE, key: 'test-key' } };
  window.__calls = [];
  const fake = Object.assign(
    { savedLevel: 1, delayMs: 0, shortToken: false },
    JSON.parse(sessionStorage.getItem('fake') || '{}')
  );
  // shortToken: token ważny 30 s, czyli według gry już do odnowienia (zapas 60 s).
  const session = () => ({
    access_token: 'at-smoke',
    refresh_token: 'rt-smoke',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + (fake.shortToken ? 30 : 3600),
    user: { id: 'u-smoke' },
  });
  const reply = (status, body) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  window.fetch = (input, init) => {
    const url = String(input);
    const method = (init && init.method) || 'GET';
    window.__calls.push({
      method,
      path: url.replace(BASE, ''),
      body: init && init.body ? JSON.parse(init.body) : null,
      keepalive: Boolean(init && init.keepalive),
      auth: (init && init.headers && init.headers.Authorization) || null,
    });
    if (url.endsWith('/auth/v1/signup') || url.includes('/auth/v1/token')) {
      return Promise.resolve(reply(200, session()));
    }
    if (method === 'GET' && url.includes('/rest/v1/saved_games')) {
      // Pozycja tuż obok wyjścia, w otwartym przejściu: jeden ruch kończy poziom.
      const L = window.Labirynt;
      const size = L.game.levelSize(fake.savedLevel);
      const maze = L.maze.generate(size, size, L.rng.create(7));
      const above = L.maze.canMove(maze, size - 1, size - 2, 'down');
      window.__exitKey = above ? 'ArrowDown' : 'ArrowRight';
      const row = {
        level: fake.savedLevel,
        seed: 7,
        x: above ? size - 1 : size - 2,
        y: above ? size - 2 : size - 1,
        moves: 3,
        time_ms: 5000,
      };
      return new Promise((resolve) => setTimeout(() => resolve(reply(200, [row])), fake.delayMs));
    }
    return Promise.resolve(reply(method === 'POST' ? 201 : 204));
  };
})();
`;

const checks = [];

function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail: detail === undefined ? '' : String(detail) });
}

(async () => {
  const chrome = await launch({ profile: 'profile-smoke-cloud', port: 9335 });
  const evaluate = async (expression) => {
    const res = await chrome.send('Runtime.evaluate', { expression, returnByValue: true });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      const desc = (d.exception && (d.exception.description || d.exception.value)) || d.text;
      throw new Error(desc + ' | wyrazenie: ' + expression.slice(0, 120));
    }
    return res.result.value;
  };

  async function tap(code) {
    for (const type of ['rawKeyDown', 'keyUp']) {
      await chrome.send('Input.dispatchKeyEvent', {
        type,
        code,
        key: code,
        windowsVirtualKeyCode: KEYS[code],
        nativeVirtualKeyCode: KEYS[code],
      });
    }
    await delay(150);
  }

  const click = (action) => evaluate(`document.querySelector('[data-action=${action}]').click()`);
  const calls = () => evaluate('window.__calls');
  const ui = () =>
    evaluate(
      '({' +
        ' screen: [...document.querySelectorAll(".screen")].filter((s) => !s.hidden).map((s) => s.dataset.screen).join(),' +
        ' continueText: document.getElementById("continue-btn").textContent,' +
        ' continueHidden: document.getElementById("continue-btn").hidden,' +
        ' moves: document.getElementById("hud-moves").textContent,' +
        ' time: document.getElementById("hud-time").textContent,' +
        ' paused: !document.getElementById("pause-overlay").hidden' +
        '})'
    );

  try {
    await chrome.send('Page.enable');
    await chrome.send('Runtime.enable');
    await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false });
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE });
    const url = pathToFileURL(path.resolve(root, 'index.html')).href;

    // Czysty start: bez sesji, postępu i ustawień z poprzednich uruchomień.
    await chrome.send('Page.navigate', { url });
    await delay(800);
    await evaluate('localStorage.clear(); sessionStorage.clear()');
    await chrome.send('Page.navigate', { url });
    await delay(1200);

    // 1. Menu proponuje przerwaną grę z bazy.
    const menu = await ui();
    check('menu: Kontynuuj pokazuje poziom przerwanej gry',
      !menu.continueHidden && menu.continueText === 'Kontynuuj: poziom 1', JSON.stringify(menu));

    // 2. Kontynuuj wznawia w pauzie z zapisanymi ruchami i czasem.
    await click('continue');
    await delay(200);
    const resumed = await ui();
    check('wznowienie: gra w pauzie, ruchy 3, czas 0:05.0',
      resumed.screen === 'game' && resumed.paused && resumed.moves === '3' && resumed.time === '0:05.0',
      JSON.stringify(resumed));

    // 3. Jeden ruch do wyjścia kończy poziom: wynik w bazie, zapis gry usunięty.
    const exitKey = await evaluate('window.__exitKey');
    await tap('Escape');
    await tap(exitKey);
    await delay(400);
    const done = await ui();
    check('ukończenie: ekran końca poziomu', done.screen === 'done', JSON.stringify(done));
    const shortest = await evaluate(
      'Labirynt.maze.shortestPathLength(Labirynt.maze.generate(8, 8, Labirynt.rng.create(7)))'
    );
    const afterFinish = await calls();
    const resumeSave = afterFinish.find((c) => c.method === 'POST' && c.path === '/rest/v1/saved_games');
    check('wznowienie: stan zapisany od razu, z keepalive i identyfikatorem gracza',
      resumeSave && resumeSave.keepalive && resumeSave.body.user_id === 'u-smoke'
        && resumeSave.body.moves === 3 && resumeSave.body.time_ms === 5000,
      JSON.stringify(resumeSave));
    const result = afterFinish.find((c) => c.method === 'POST' && c.path === '/rest/v1/results');
    check('ukończenie: wynik wysłany z tokenem gracza',
      result && result.auth === 'Bearer at-smoke' && result.body.level === 1 && result.body.seed === 7
        && result.body.moves === 4 && result.body.shortest === shortest && result.body.time_ms >= 5000,
      JSON.stringify(result));
    check('ukończenie: zapis gry usunięty',
      afterFinish.some((c) => c.method === 'DELETE' && c.path === '/rest/v1/saved_games?user_id=eq.u-smoke'),
      JSON.stringify(afterFinish.map((c) => c.method + ' ' + c.path)));
    check('sesja: jedno konto anonimowe',
      afterFinish.filter((c) => c.path === '/auth/v1/signup').length === 1, '');

    // 4. Po ukończeniu Kontynuuj nie proponuje już przerwanej gry.
    await click('menu');
    await delay(150);
    const menu2 = await ui();
    check('menu po ukończeniu: zwykłe Kontynuuj',
      !menu2.continueHidden && menu2.continueText === 'Kontynuuj', JSON.stringify(menu2));

    // 5. Nowa gra, pauza i wyjście do menu zapisują grę; menu proponuje jej wznowienie.
    await click('newGame');
    await delay(200);
    await tap('Escape');
    await click('menu');
    await delay(150);
    const saves = (await calls()).filter((c) => c.method === 'POST' && c.path === '/rest/v1/saved_games');
    check('zapis gry: wznowienie, nowa gra, pauza i menu (4 zapisy)', saves.length === 4, saves.length);
    const menu3 = await ui();
    check('menu: Kontynuuj proponuje grę przerwaną w tej sesji',
      menu3.continueText === 'Kontynuuj: poziom 1', JSON.stringify(menu3));

    // 6. Wyczyść rekordy usuwa też wyniki w bazie.
    await click('records');
    await delay(100);
    await evaluate('window.confirm = () => true');
    await click('clearRecords');
    await delay(150);
    check('rekordy: czyszczenie usuwa wyniki gracza w bazie',
      (await calls()).some((c) => c.method === 'DELETE' && c.path === '/rest/v1/results?user_id=eq.u-smoke'), '');

    // 7. Spóźniona odpowiedź z bazy (poziom 3) nie zastępuje gry zaczętej w tej sesji (poziom 1).
    await evaluate(`sessionStorage.setItem('fake', JSON.stringify({ savedLevel: 3, delayMs: 2000 }))`);
    await chrome.send('Page.navigate', { url });
    await delay(500);
    await click('newGame');
    await delay(200);
    await click('menu');
    await delay(2000);
    const late = await ui();
    check('spóźniona odpowiedź z bazy jest pomijana',
      late.continueText === 'Kontynuuj: poziom 1', JSON.stringify(late));

    // 8. Powracający gracz klika Kontynuuj, zanim baza odpowie: gra czeka i wznawia przerwaną grę.
    await evaluate(
      `localStorage.setItem('labirynt.v1', JSON.stringify({ unlocked: 2, best: {}, theme: 'dark' }));` +
        `sessionStorage.setItem('fake', JSON.stringify({ savedLevel: 1, delayMs: 1500 }))`
    );
    await chrome.send('Page.navigate', { url });
    await delay(300);
    await click('continue');
    await delay(2200);
    const early = await ui();
    check('wczesne Kontynuuj czeka na bazę i wznawia przerwaną grę',
      early.screen === 'game' && early.paused && early.moves === '3', JSON.stringify(early));

    // 9. Po wyjściu z pauzy gra od razu odnawia wygasający token, a nie dopiero przy zamykaniu karty.
    await evaluate(`localStorage.clear(); sessionStorage.setItem('fake', JSON.stringify({ shortToken: true }))`);
    await chrome.send('Page.navigate', { url });
    await delay(1200);
    await click('continue');
    await delay(300);
    const beforeResume = (await calls()).length;
    await tap('Escape');
    await delay(300);
    const afterResume = (await calls()).slice(beforeResume).map((c) => c.path);
    check('wyjście z pauzy odnawia token z wyprzedzeniem',
      afterResume[0] === '/auth/v1/token?grant_type=refresh_token', JSON.stringify(afterResume));
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
