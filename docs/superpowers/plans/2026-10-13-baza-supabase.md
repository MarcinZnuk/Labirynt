# Baza Supabase: wyniki i wznawianie gry - plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** gra zapisuje wyniki ukończonych poziomów i przerwaną rozgrywkę w bazie Supabase, a przycisk Kontynuuj wznawia przerwaną grę (ten sam labirynt, pozycja, ruchy, czas).

**Architecture:** nowy moduł `js/cloud.js` (`Labirynt.cloud`) rozmawia z REST API Supabase przez `fetch`: zakłada anonimowego gracza, odnawia sesję, zapisuje i czyta dane. `js/game.js` dostaje `toSave` i `fromSave`, a `js/main.js` wywołuje bazę w kilku punktach pętli gry. Baza jest dodatkiem: przy pustej konfiguracji, bez internetu albo z parametrem `?level=N` gra działa jak dotąd.

**Tech Stack:** czysty JavaScript (skrypty klasyczne, bez modułów ES i bez bibliotek), Supabase (Auth i PostgREST przez REST), testy jednostkowe we własnym harnessie (`tests/`, Node i Chrome), testy całej gry w Chrome bez okna przez CDP (`tools/`).

**Spec:** `docs/superpowers/specs/2026-09-29-labirynt-design.md`, głównie punkt 4.6 oraz 4.4, 6.1, 7, 8 i 10.

## Global Constraints

- Bez zależności zewnętrznych i kroku budowania; gra działa z `file://` i z GitHub Pages. Do bazy tylko `fetch`, bez supabase-js.
- Każdy plik `js/` to IIFE `(function (L) { 'use strict'; ... })(window.Labirynt = window.Labirynt || {});`, API w `window.Labirynt`, bez innych zmiennych globalnych.
- Identyfikatory po angielsku, komentarze i teksty dla gracza po polsku.
- Tylko krótki dywiz `-`, żadnych długich myślników ani znaku minus; sprawdza to `python tools/check-dashes.py`.
- W `js/cloud-config.js` tylko klucz publiczny (publishable albo anon). Nigdy klucz tajny (secret) ani `service_role`.
- Sesja gracza w `localStorage` pod kluczem `labirynt.cloud.v1`; limit czasu każdego zapytania do bazy: 8 s.
- Błędy bazy nigdy nie przerywają gry i nie są pokazywane graczowi; metody `Labirynt.cloud` nigdy nie odrzucają obietnicy.
- `?level=N` wyłącza bazę.
- Git: żadnych operacji git bez wyraźnej prośby użytkownika (także odczytu). Kroki "Zapis w repozytorium" wykonujemy tylko wtedy, gdy użytkownik na to pozwolił; inaczej je pomijamy i zgłaszamy.

## Review Focus

- Odnowienie sesji pada przez sieć, a nie przez odrzucenie tokenu: gracz nie może dostać nowego konta, bo straciłby przerwaną grę. Test w zadaniu 2 ("błąd sieci przy odnowieniu nie zakłada nowego konta").
- Zapis w bazie uszkodzony albo poprawiony ręcznie w panelu (pozycja poza planszą, ułamek, `null`, pozycja na wyjściu): Kontynuuj działa jak bez zapisu, bez błędu. Test w zadaniu 1 ("niepoprawny zapis daje null").
- Odpowiedź z bazy przychodzi, gdy gracz już zaczął grać: nie może podmienić przycisku Kontynuuj na starą grę. Test w zadaniu 3 (`tools/smoke-cloud.js`, krok 7).
- Przeglądarka nie wysyła zapytania z `keepalive` wymagającego zapytania wstępnego CORS: zapis gry ma pójść zwykłym zapytaniem, a nie przepaść. Test w zadaniu 2 ("gdy przeglądarka odrzuci keepalive...").
- Wznowienie po długiej przerwie: czas liczy się dalej od zapisanego, a przerwa nie jest doliczana. Test w zadaniu 1 ("po wznowieniu zapisu czas liczy się dalej").

---

### Task 1: Zapis i odczyt przerwanej gry w logice gry

**Files:**

- Modify: `js/game.js` (nowe funkcje przed `L.game = ...`, eksport)
- Test: `tests/game.test.js` (nowe testy przed testem "restart zachowuje labirynt")

**Interfaces:**

- Consumes: `createLevel(level, seed)`, `levelSize(level)`, `elapsed(state, nowMs)` z `js/game.js`.
- Produces: `L.game.toSave(state, nowMs) -> { level, seed, x, y, moves, timeMs }` (czas zaokrąglony do ms) oraz `L.game.fromSave(save) -> State | null` (stan w pauzie, `clockStarted = moves > 0`, `accumulatedMs = timeMs`).

- [ ] **Step 1: Napisz testy, które nie przechodzą**

W `tests/game.test.js`, przed `test('game: restart zachowuje labirynt i zeruje postęp', ...)`:

```js
  test('game: zapis i odczyt przerwanej gry odtwarzają labirynt, pozycję, ruchy i czas', () => {
    let s = G.createLevel(3, 21);
    solve(s.maze).slice(0, 5).forEach((dir, i) => {
      s = G.move(s, dir, 1000 + i * 100);
    });
    const save = G.toSave(s, 2000.4);
    assertEqual(save, { level: 3, seed: 21, x: s.x, y: s.y, moves: 5, timeMs: 1000 });
    const r = G.fromSave(save);
    assertEqual(r.maze.walls, s.maze.walls, 'ten sam labirynt');
    assertEqual([r.level, r.seed, r.x, r.y, r.moves, r.paused, r.finished], [3, 21, s.x, s.y, 5, true, false]);
    assertEqual(G.elapsed(r, 999999), 1000, 'w pauzie zegar stoi');
  });

  test('game: po wznowieniu zapisu czas liczy się dalej od zapisanego', () => {
    const r = G.resume(G.fromSave({ level: 1, seed: 7, x: 0, y: 0, moves: 4, timeMs: 5000 }), 10000);
    assertEqual(G.elapsed(r, 10250), 5250);
  });

  test('game: zapis bez ruchów nie uruchamia zegara po wznowieniu', () => {
    const r = G.resume(G.fromSave({ level: 2, seed: 9, x: 0, y: 0, moves: 0, timeMs: 0 }), 10000);
    assertEqual(G.elapsed(r, 20000), 0);
  });

  test('game: niepoprawny zapis daje null', () => {
    const ok = { level: 1, seed: 7, x: 3, y: 4, moves: 4, timeMs: 5000 };
    const broken = [
      null,
      'zapis',
      {},
      Object.assign({}, ok, { level: 0 }),
      Object.assign({}, ok, { level: 1.5 }),
      Object.assign({}, ok, { seed: -1 }),
      Object.assign({}, ok, { seed: 4294967296 }),
      Object.assign({}, ok, { x: 8 }),
      Object.assign({}, ok, { y: -1 }),
      Object.assign({}, ok, { x: '3' }),
      Object.assign({}, ok, { moves: 1.5 }),
      Object.assign({}, ok, { timeMs: -1 }),
      Object.assign({}, ok, { timeMs: null }),
      Object.assign({}, ok, { x: 7, y: 7 }),
    ];
    assert(G.fromSave(ok) !== null, 'poprawny zapis');
    broken.forEach((save, i) => assert(G.fromSave(save) === null, 'zapis nr ' + i));
  });
```

- [ ] **Step 2: Uruchom testy i sprawdź, że nowe nie przechodzą**

Run: `node tests/run-node.js | grep -E "FAIL|zaliczonych"`
Expected: 4 wiersze `FAIL game: ...` z komunikatem `G.toSave is not a function` albo `G.fromSave is not a function`.

- [ ] **Step 3: Napisz kod**

W `js/game.js` zamień wiersz `L.game = { MAX_SIZE, levelSize, createLevel, elapsed, move, pause, resume, restart, stars };` na:

```js
  function isCount(value) {
    return Number.isInteger(value) && value >= 0;
  }

  // Zapis przerwanej gry: labirynt odtwarza się z poziomu i ziarna, więc ścian nie zapisujemy.
  function toSave(state, nowMs) {
    return {
      level: state.level,
      seed: state.seed,
      x: state.x,
      y: state.y,
      moves: state.moves,
      timeMs: Math.round(elapsed(state, nowMs)),
    };
  }

  // Stan z zapisu, w pauzie. Zapis spoza zasad gry (np. poprawiony ręcznie w bazie) daje null.
  function fromSave(save) {
    if (save === null || typeof save !== 'object') return null;
    const { level, seed, x, y, moves, timeMs } = save;
    if (!Number.isInteger(level) || level < 1) return null;
    if (!isCount(seed) || seed > 0xffffffff) return null;
    if (!isCount(moves) || !isCount(timeMs)) return null;
    const size = levelSize(level);
    if (!isCount(x) || !isCount(y) || x >= size || y >= size) return null;
    if (x === size - 1 && y === size - 1) return null;
    return Object.assign(createLevel(level, seed), {
      x,
      y,
      moves,
      accumulatedMs: timeMs,
      clockStarted: moves > 0,
      paused: true,
    });
  }

  L.game = { MAX_SIZE, levelSize, createLevel, elapsed, move, pause, resume, restart, stars, toSave, fromSave };
```

- [ ] **Step 4: Uruchom testy i sprawdź, że przechodzą**

Run: `node tests/run-node.js | grep -E "FAIL|zaliczonych"`
Expected: brak `FAIL`, `77/77 zaliczonych`.

- [ ] **Step 5: Zapis w repozytorium (tylko za zgodą użytkownika)**

```bash
git add js/game.js tests/game.test.js
git commit -m "Dodaj zapis i odczyt przerwanej gry w logice gry"
```

---

### Task 2: Moduł bazy `Labirynt.cloud`

**Files:**

- Modify: `tests/harness.js` (testy asynchroniczne), `tests/test.html`, `tests/run-node.js`
- Create: `js/cloud.js`
- Test: `tests/cloud.test.js` (nowy), dopisany do `tests/test.html`
- Modify: `docs/superpowers/specs/2026-09-29-labirynt-design.md` (punkt 4.6, zapasowy zapis bez keepalive)

**Interfaces:**

- Consumes: nic z innych modułów gry.
- Produces: `L.cloud.SESSION_KEY` (`'labirynt.cloud.v1'`) i `L.cloud.create({ url, key, fetch, storage, now }) -> Cloud | null`, gdzie `fetch(url, init) -> Promise<{ ok, status, json() }>`, `storage() -> { getItem, setItem }` (może rzucić), `now() -> ms od 1970`. `Cloud`: `saveResult({ level, seed, timeMs, moves, shortest }) -> Promise<boolean>`, `clearResults() -> Promise<boolean>`, `saveGame({ level, seed, x, y, moves, timeMs }) -> Promise<boolean>`, `loadGame() -> Promise<{ level, seed, x, y, moves, timeMs } | null>`, `deleteGame() -> Promise<boolean>`. Żadna obietnica nie jest odrzucana.

- [ ] **Step 1: Harness obsługuje testy asynchroniczne**

W `tests/harness.js` zamień funkcję `run`:

```js
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
```

W `tests/test.html` zamień skrypt na końcu na:

```html
  <script>
    (function () {
      window.T.run().then(function (results) {
        const failed = results.filter((r) => !r.ok).length;
        const summary = document.getElementById('summary');
        summary.textContent = (results.length - failed) + '/' + results.length + ' zaliczonych';
        summary.dataset.failed = String(failed);
        summary.className = failed ? 'fail' : 'pass';
        const list = document.getElementById('results');
        for (const r of results) {
          const li = document.createElement('li');
          li.className = r.ok ? 'pass' : 'fail';
          li.textContent = (r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : ': ' + r.error);
          list.appendChild(li);
        }
      });
    })();
  </script>
```

W `tests/run-node.js` zamień wszystko od `const results = window.T.run();` do końca na:

```js
window.T.run().then((results) => {
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
});
```

- [ ] **Step 2: Sprawdź, że dotychczasowe testy dalej przechodzą w Node i w Chrome**

Run: `node tests/run-node.js | tail -1 && bash tools/chrome.sh tests`
Expected: `77/77 zaliczonych` w obu, kod wyjścia 0. Testy w tym pliku zależą tylko od obietnic rozwiązanych od razu, więc kończą się przed zdarzeniem `load`, a Chrome zrzuca stronę z wynikiem.

- [ ] **Step 3: Napisz testy modułu bazy**

Utwórz `tests/cloud.test.js`:

```js
(function () {
  'use strict';

  const { test, assert, assertEqual } = window.T;
  const C = window.Labirynt.cloud;

  const BASE = 'https://projekt.supabase.co';
  const KEY = 'sb_publishable_test';
  const NOW_S = 1760000000;
  const SAVE = { level: 1, seed: 1, x: 0, y: 0, moves: 0, timeMs: 0 };

  function memoryStorage(initial) {
    const data = Object.assign({}, initial);
    return {
      data,
      getItem: (k) => (Object.hasOwn(data, k) ? data[k] : null),
      setItem: (k, v) => {
        data[k] = String(v);
      },
    };
  }

  function tokens(id, expiresAt) {
    return { access_token: 'at-' + id, refresh_token: 'rt-' + id, expires_in: 3600, expires_at: expiresAt, user: { id } };
  }

  function storedSession(id, expiresAt) {
    return JSON.stringify({ access_token: 'at-' + id, refresh_token: 'rt-' + id, expires_at: expiresAt, user: { id } });
  }

  // Sztuczny serwer: route(call) zwraca { status, body } albo rzuca wyjątek (błąd sieci).
  function setup(route, options) {
    const calls = [];
    const storage = (options && options.storage) || memoryStorage();
    const fetch = (url, init) => {
      const call = {
        path: url.slice(BASE.length),
        method: init.method,
        headers: init.headers || {},
        body: init.body === undefined ? null : JSON.parse(init.body),
        keepalive: init.keepalive === true,
      };
      calls.push(call);
      try {
        const { status, body } = route(call);
        return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
      } catch (err) {
        return Promise.reject(err);
      }
    };
    const cloud = C.create({ url: BASE, key: KEY, fetch, storage: () => storage, now: () => NOW_S * 1000 });
    return { cloud, calls, storage };
  }

  // Domyślne trasy: konto anonimowe u1, odnowienie daje u1b, dane bez błędów.
  function happy(call) {
    if (call.path === '/auth/v1/signup') return { status: 200, body: tokens('u1', NOW_S + 3600) };
    if (call.path.startsWith('/auth/v1/token')) return { status: 200, body: tokens('u1b', NOW_S + 3600) };
    if (call.method === 'GET') return { status: 200, body: [] };
    return { status: 201, body: null };
  }

  const authCalls = (calls) => calls.filter((c) => c.path.startsWith('/auth/'));
  const isData = (call) => call.path.startsWith('/rest/');

  test('cloud: bez adresu albo klucza baza jest wyłączona', () => {
    const opts = { fetch: () => Promise.reject(new Error('sieć')), storage: () => memoryStorage(), now: () => 0 };
    assertEqual(C.create(Object.assign({ url: '', key: KEY }, opts)), null);
    assertEqual(C.create(Object.assign({ url: BASE, key: '' }, opts)), null);
    assertEqual(C.create(undefined), null);
  });

  test('cloud: bez sesji zakłada konto anonimowe i zapisuje wynik', async () => {
    const { cloud, calls, storage } = setup(happy);
    const ok = await cloud.saveResult({ level: 2, seed: 77, timeMs: 41300.6, moves: 87, shortest: 64 });
    assertEqual(ok, true);
    assertEqual(calls.map((c) => c.method + ' ' + c.path), ['POST /auth/v1/signup', 'POST /rest/v1/results']);
    assertEqual(calls[0].body, { data: {} });
    assertEqual([calls[0].headers.apikey, calls[1].headers.apikey], [KEY, KEY]);
    assertEqual(calls[1].headers.Authorization, 'Bearer at-u1');
    assertEqual(calls[1].body, { level: 2, seed: 77, time_ms: 41301, moves: 87, shortest: 64 });
    assertEqual(JSON.parse(storage.data[C.SESSION_KEY]).user.id, 'u1', 'sesja zapamiętana');
  });

  test('cloud: równoczesne wywołania zakładają jedno konto', async () => {
    const { cloud, calls } = setup(happy);
    await Promise.all([cloud.loadGame(), cloud.saveGame(SAVE), cloud.deleteGame()]);
    assertEqual(authCalls(calls).length, 1);
  });

  test('cloud: ważna sesja z magazynu jest używana bez logowania', async () => {
    const storage = memoryStorage({ [C.SESSION_KEY]: storedSession('u7', NOW_S + 600) });
    const { cloud, calls } = setup(happy, { storage });
    await cloud.loadGame();
    assertEqual(authCalls(calls).length, 0);
    assertEqual(calls[0].headers.Authorization, 'Bearer at-u7');
  });

  test('cloud: wygasła sesja jest odnawiana tokenem odświeżania', async () => {
    const storage = memoryStorage({ [C.SESSION_KEY]: storedSession('u7', NOW_S + 30) });
    const { cloud, calls } = setup(happy, { storage });
    await cloud.loadGame();
    assertEqual(calls[0].path, '/auth/v1/token?grant_type=refresh_token');
    assertEqual(calls[0].body, { refresh_token: 'rt-u7' });
    assertEqual(calls[1].headers.Authorization, 'Bearer at-u1b');
    assertEqual(JSON.parse(storage.data[C.SESSION_KEY]).refresh_token, 'rt-u1b');
  });

  test('cloud: odrzucone odnowienie zakłada nowe konto', async () => {
    const storage = memoryStorage({ [C.SESSION_KEY]: storedSession('u7', NOW_S - 10) });
    const route = (call) =>
      call.path.startsWith('/auth/v1/token') ? { status: 400, body: { error: 'invalid_grant' } } : happy(call);
    const { cloud, calls } = setup(route, { storage });
    await cloud.loadGame();
    assertEqual(authCalls(calls).map((c) => c.path), ['/auth/v1/token?grant_type=refresh_token', '/auth/v1/signup']);
    assertEqual(calls.find(isData).headers.Authorization, 'Bearer at-u1');
  });

  test('cloud: błąd sieci przy odnowieniu nie zakłada nowego konta', async () => {
    const storage = memoryStorage({ [C.SESSION_KEY]: storedSession('u7', NOW_S - 10) });
    const route = (call) => {
      if (call.path.startsWith('/auth/v1/token')) throw new TypeError('Failed to fetch');
      return happy(call);
    };
    const { cloud, calls } = setup(route, { storage });
    assertEqual(await cloud.saveGame(SAVE), false);
    assertEqual(calls.map((c) => c.path), ['/auth/v1/token?grant_type=refresh_token']);
    assertEqual(JSON.parse(storage.data[C.SESSION_KEY]).user.id, 'u7', 'stare konto zostaje');
  });

  test('cloud: uszkodzona sesja w magazynie oznacza nowe konto', async () => {
    const storage = memoryStorage({ [C.SESSION_KEY]: '{zepsute' });
    const { cloud, calls } = setup(happy, { storage });
    await cloud.loadGame();
    assertEqual(authCalls(calls).map((c) => c.path), ['/auth/v1/signup']);
  });

  test('cloud: zablokowany magazyn nie przeszkadza, sesja żyje w pamięci', async () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    const { cloud, calls } = setup(happy, { storage: blocked });
    assertEqual([await cloud.deleteGame(), await cloud.deleteGame()], [true, true]);
    assertEqual(authCalls(calls).length, 1);
  });

  test('cloud: zapis gry to upsert z keepalive i identyfikatorem gracza', async () => {
    const { cloud, calls } = setup(happy);
    const ok = await cloud.saveGame({ level: 3, seed: 4294967295, x: 5, y: 2, moves: 17, timeMs: 12345.5 });
    const call = calls.find(isData);
    assertEqual(ok, true);
    assertEqual([call.method, call.path, call.keepalive], ['POST', '/rest/v1/saved_games', true]);
    assert(call.headers.Prefer.includes('resolution=merge-duplicates'), call.headers.Prefer);
    assertEqual(call.body, { user_id: 'u1', level: 3, seed: 4294967295, x: 5, y: 2, moves: 17, time_ms: 12346 });
  });

  test('cloud: gdy przeglądarka odrzuci keepalive, zapis gry idzie zwykłym zapytaniem', async () => {
    const route = (call) => {
      if (call.keepalive) throw new TypeError('Preflight request for request with keepalive specified is currently not supported');
      return happy(call);
    };
    const { cloud, calls } = setup(route);
    assertEqual(await cloud.saveGame(SAVE), true);
    assertEqual(calls.filter(isData).map((c) => c.keepalive), [true, false]);
  });

  test('cloud: odczyt zapisu zamienia kolumny bazy na zapis gry', async () => {
    const row = { level: 3, seed: 99, x: 5, y: 2, moves: 17, time_ms: 12345 };
    const { cloud, calls } = setup((call) => (call.method === 'GET' ? { status: 200, body: [row] } : happy(call)));
    assertEqual(await cloud.loadGame(), { level: 3, seed: 99, x: 5, y: 2, moves: 17, timeMs: 12345 });
    assertEqual(calls.find(isData).path, '/rest/v1/saved_games?select=level,seed,x,y,moves,time_ms&limit=1');
  });

  test('cloud: brak zapisu w bazie daje null', async () => {
    const { cloud } = setup(happy);
    assertEqual(await cloud.loadGame(), null);
  });

  test('cloud: usuwanie dotyczy tylko wierszy gracza', async () => {
    const { cloud, calls } = setup(happy);
    assertEqual([await cloud.deleteGame(), await cloud.clearResults()], [true, true]);
    assertEqual(calls.filter(isData).map((c) => c.method + ' ' + c.path), [
      'DELETE /rest/v1/saved_games?user_id=eq.u1',
      'DELETE /rest/v1/results?user_id=eq.u1',
    ]);
  });

  test('cloud: błąd sieci i odpowiedź z błędem dają false albo null bez wyjątku', async () => {
    const down = setup((call) => {
      if (call.path.startsWith('/auth/')) return happy(call);
      throw new TypeError('Failed to fetch');
    }).cloud;
    const failing = setup((call) => (call.path.startsWith('/auth/') ? happy(call) : { status: 500, body: {} })).cloud;
    const noAuth = setup(() => ({ status: 503, body: null })).cloud;
    for (const cloud of [down, failing, noAuth]) {
      assertEqual(
        [
          await cloud.saveResult({ level: 1, seed: 1, timeMs: 1, moves: 14, shortest: 14 }),
          await cloud.saveGame(SAVE),
          await cloud.loadGame(),
          await cloud.deleteGame(),
          await cloud.clearResults(),
        ],
        [false, false, null, false, false]
      );
    }
  });
})();
```

W `tests/test.html` po wierszu `<script src="storage.test.js"></script>` dopisz:

```html
  <script src="../js/cloud.js"></script>
  <script src="cloud.test.js"></script>
```

- [ ] **Step 4: Uruchom testy i sprawdź, że nowe nie przechodzą**

Run: `node tests/run-node.js | grep -E "FAIL|zaliczonych|Error"`
Expected: błąd ładowania `js/cloud.js` (brak pliku). Moduł jeszcze nie istnieje.

- [ ] **Step 5: Napisz moduł**

Utwórz `js/cloud.js`:

```js
(function (L) {
  'use strict';

  const SESSION_KEY = 'labirynt.cloud.v1';
  const TIMEOUT_MS = 8000;
  // Token odnawiamy z zapasem, żeby nie wygasł w drodze do serwera.
  const REFRESH_MARGIN_S = 60;

  function isSession(value) {
    return (
      value !== null &&
      typeof value === 'object' &&
      typeof value.access_token === 'string' &&
      typeof value.refresh_token === 'string' &&
      Number.isFinite(value.expires_at) &&
      value.user !== null &&
      typeof value.user === 'object' &&
      typeof value.user.id === 'string'
    );
  }

  function create(options) {
    const url = options && typeof options.url === 'string' ? options.url.replace(/\/+$/, '') : '';
    const key = options && typeof options.key === 'string' ? options.key : '';
    if (!url || !key) return null;
    const doFetch = options.fetch;
    const getStorage = options.storage;
    const now = options.now;

    let session = null;
    let pending = null;

    // Każde zapytanie ma limit czasu; po nim fetch odrzuca obietnicę.
    async function request(path, init) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
      try {
        return await doFetch(url + path, controller ? Object.assign({}, init, { signal: controller.signal }) : init);
      } finally {
        if (timer !== null) clearTimeout(timer);
      }
    }

    function readSession() {
      try {
        const raw = getStorage().getItem(SESSION_KEY);
        const parsed = raw === null ? null : JSON.parse(raw);
        return isSession(parsed) ? parsed : null;
      } catch (err) {
        return null;
      }
    }

    function keepSession(value) {
      session = value;
      try {
        getStorage().setItem(SESSION_KEY, JSON.stringify(value));
      } catch (err) {
        // Bez magazynu sesja żyje tylko do zamknięcia karty.
      }
    }

    // Logowanie: sesja albo informacja, czy serwer odrzucił dane (a nie np. padła sieć).
    async function auth(path, body) {
      const res = await request(path, {
        method: 'POST',
        headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { session: null, rejected: res.status === 400 || res.status === 401 };
      const data = await res.json();
      const expiresAt = Number.isFinite(data.expires_at)
        ? data.expires_at
        : Math.floor(now() / 1000) + data.expires_in;
      const value = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: expiresAt,
        user: { id: data.user && data.user.id },
      };
      return { session: isSession(value) ? value : null, rejected: false };
    }

    async function obtainSession() {
      const current = session || readSession();
      if (current && current.expires_at - REFRESH_MARGIN_S > now() / 1000) {
        session = current;
        return current;
      }
      if (current) {
        const refreshed = await auth('/auth/v1/token?grant_type=refresh_token', {
          refresh_token: current.refresh_token,
        });
        if (refreshed.session) {
          keepSession(refreshed.session);
          return refreshed.session;
        }
        // Błąd serwera: zostajemy przy starym koncie i spróbujemy przy następnym wywołaniu.
        if (!refreshed.rejected) return null;
      }
      const created = await auth('/auth/v1/signup', { data: {} });
      if (created.session) keepSession(created.session);
      return created.session;
    }

    // Równoczesne wywołania czekają na tę samą obietnicę: jedno konto, jedno odnowienie.
    // Błąd sieci (wyjątek) daje null, więc stare konto zostaje.
    function ensureSession() {
      if (!pending) {
        pending = obtainSession()
          .catch(() => null)
          .finally(() => {
            pending = null;
          });
      }
      return pending;
    }

    // Zapytanie o dane w imieniu gracza. Każdy błąd daje wartość zastępczą, nigdy wyjątek.
    async function withSession(fallback, fn) {
      try {
        const current = await ensureSession();
        if (!current) return fallback;
        return await fn(current.user.id, { apikey: key, Authorization: 'Bearer ' + current.access_token });
      } catch (err) {
        return fallback;
      }
    }

    function saveResult(result) {
      return withSession(false, async (userId, headers) => {
        const res = await request('/rest/v1/results', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, headers),
          body: JSON.stringify({
            level: result.level,
            seed: result.seed,
            time_ms: Math.round(result.timeMs),
            moves: result.moves,
            shortest: result.shortest,
          }),
        });
        return res.ok;
      });
    }

    function clearResults() {
      return withSession(false, async (userId, headers) => {
        const res = await request('/rest/v1/results?user_id=eq.' + encodeURIComponent(userId), {
          method: 'DELETE',
          headers,
        });
        return res.ok;
      });
    }

    // keepalive: zapis ma dojść także wtedy, gdy karta właśnie się zamyka.
    function saveGame(save) {
      return withSession(false, async (userId, headers) => {
        const init = {
          method: 'POST',
          headers: Object.assign(
            { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
            headers
          ),
          body: JSON.stringify({
            user_id: userId,
            level: save.level,
            seed: save.seed,
            x: save.x,
            y: save.y,
            moves: save.moves,
            time_ms: Math.round(save.timeMs),
          }),
        };
        let res;
        try {
          res = await request('/rest/v1/saved_games', Object.assign({ keepalive: true }, init));
        } catch (err) {
          // Część przeglądarek nie wysyła keepalive z zapytaniem wstępnym CORS; wtedy zwykły zapis.
          res = await request('/rest/v1/saved_games', init);
        }
        return res.ok;
      });
    }

    function loadGame() {
      return withSession(null, async (userId, headers) => {
        const res = await request('/rest/v1/saved_games?select=level,seed,x,y,moves,time_ms&limit=1', {
          method: 'GET',
          headers,
        });
        if (!res.ok) return null;
        const rows = await res.json();
        const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (row === null || typeof row !== 'object') return null;
        return { level: row.level, seed: row.seed, x: row.x, y: row.y, moves: row.moves, timeMs: row.time_ms };
      });
    }

    function deleteGame() {
      return withSession(false, async (userId, headers) => {
        const res = await request('/rest/v1/saved_games?user_id=eq.' + encodeURIComponent(userId), {
          method: 'DELETE',
          headers,
        });
        return res.ok;
      });
    }

    return { saveResult, clearResults, saveGame, loadGame, deleteGame };
  }

  L.cloud = { SESSION_KEY, create };
})(window.Labirynt = window.Labirynt || {});
```

- [ ] **Step 6: Uruchom testy i sprawdź, że przechodzą**

Run: `node tests/run-node.js | grep -E "FAIL|zaliczonych" && bash tools/chrome.sh tests`
Expected: brak `FAIL`, `92/92 zaliczonych` w Node i w Chrome.

- [ ] **Step 7: Dopisz zapasowy zapis do specyfikacji**

W `docs/superpowers/specs/2026-09-29-labirynt-design.md`, punkt 4.6, zamień zdanie
`Zapis gry zawsze idzie z opcją `keepalive`, żeby przetrwał zamknięcie karty.` na:

```markdown
Zapis gry zawsze idzie z opcją `keepalive`, żeby przetrwał zamknięcie karty. Gdy przeglądarka
odrzuci takie zapytanie, zapis idzie zwykłym zapytaniem.
```

- [ ] **Step 8: Sprawdź myślniki**

Run: `python tools/check-dashes.py && echo brak`
Expected: `brak`.

- [ ] **Step 9: Zapis w repozytorium (tylko za zgodą użytkownika)**

```bash
git add tests/harness.js tests/test.html tests/run-node.js tests/cloud.test.js js/cloud.js docs/superpowers/specs/2026-09-29-labirynt-design.md
git commit -m "Dodaj moduł bazy Supabase: sesja anonimowa, wyniki i zapis gry"
```

---

### Task 3: Podłączenie bazy do gry

**Files:**

- Create: `js/cloud-config.js`, `tools/smoke-cloud.js`
- Modify: `js/ui.js` (`setContinueVisible` zastąpione przez `setContinue` i `continueLabel`), `js/main.js` (całość poniżej), `index.html` (dwa skrypty), `tools/chrome.sh` (polecenie `smoke-cloud`)
- Test: `tests/ui.test.js`, `tools/smoke-cloud.js`
- Modify: `docs/superpowers/specs/2026-09-29-labirynt-design.md` (punkty 4.6 i 8.1)

**Interfaces:**

- Consumes: `L.game.toSave`, `L.game.fromSave` (zadanie 1), `L.cloud.create` i metody `Cloud` (zadanie 2), `L.maze.shortestPathLength`, `L.game.stars`.
- Produces: `L.cloudConfig = { url, key }` (konfiguracja ustawiona wcześniej, np. przez test, ma pierwszeństwo), `L.ui.continueLabel(level | null) -> string`, `L.ui.setContinue(visible, level | null)`.

- [ ] **Step 1: Napisz test napisu przycisku**

W `tests/ui.test.js` przed testem `'ui: recordRows sortuje poziomy liczbowo'`:

```js
  test('ui: continueLabel pokazuje poziom przerwanej gry', () => {
    assertEqual([U.continueLabel(null), U.continueLabel(3)], ['Kontynuuj', 'Kontynuuj: poziom 3']);
  });
```

Run: `node tests/run-node.js | grep -E "FAIL|zaliczonych"`
Expected: `FAIL ui: continueLabel pokazuje poziom przerwanej gry: U.continueLabel is not a function`.

- [ ] **Step 2: Zmień przycisk Kontynuuj w `js/ui.js`**

Przed funkcją `recordRows` dodaj:

```js
  function continueLabel(level) {
    return level ? 'Kontynuuj: poziom ' + level : 'Kontynuuj';
  }
```

Zamień funkcję `setContinueVisible` na:

```js
  // level: poziom przerwanej gry do wznowienia albo null.
  function setContinue(visible, level) {
    el.continueBtn.hidden = !visible;
    el.continueBtn.textContent = continueLabel(level);
  }
```

W obiekcie `L.ui = { ... }` zamień `setContinueVisible,` na `setContinue,` i dopisz `continueLabel,` po `starsText,`.

Run: `node tests/run-node.js | grep -E "FAIL|zaliczonych"`
Expected: brak `FAIL`, `93/93 zaliczonych`.

- [ ] **Step 3: Utwórz `js/cloud-config.js`**

```js
(function (L) {
  'use strict';

  // Adres projektu Supabase i klucz publiczny (publishable albo anon) z panelu Supabase.
  // Klucz publiczny jest jawny z założenia, dane chronią reguły RLS z supabase/schema.sql.
  // Nigdy nie wpisuj tu klucza tajnego (secret) ani service_role. Puste wartości wyłączają bazę.
  // Konfiguracja ustawiona przed załadowaniem strony (test tools/smoke-cloud.js) ma pierwszeństwo.
  L.cloudConfig = L.cloudConfig || { url: '', key: '' };
})(window.Labirynt = window.Labirynt || {});
```

W `index.html` po `<script src="js/storage.js"></script>` dopisz:

```html
  <script src="js/cloud-config.js"></script>
  <script src="js/cloud.js"></script>
```

- [ ] **Step 4: Napisz test gry z bazą (sztuczny Supabase w stronie)**

Utwórz `tools/smoke-cloud.js`:

```js
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
  const fake = Object.assign({ savedLevel: 1, delayMs: 0 }, JSON.parse(sessionStorage.getItem('fake') || '{}'));
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
    if (url.endsWith('/auth/v1/signup')) {
      return Promise.resolve(reply(200, {
        access_token: 'at-smoke',
        refresh_token: 'rt-smoke',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'u-smoke' },
      }));
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
```

W `tools/chrome.sh`:

- w komentarzu na górze, pod wierszem `tools/chrome.sh smoke ...`, dopisz:
  `#   tools/chrome.sh smoke-cloud                     - test gry z bazą (sztuczny Supabase w stronie)`
- w `case` po bloku `smoke)` dopisz:

```bash
  smoke-cloud)
    node tools/smoke-cloud.js
    ;;
```

- w komunikacie użycia zamień `tests | smoke | shot` na `tests | smoke | smoke-cloud | shot`.

- [ ] **Step 5: Uruchom test gry z bazą i sprawdź, że nie przechodzi**

Run: `bash tools/chrome.sh smoke-cloud`
Expected: `FAIL menu: Kontynuuj pokazuje poziom przerwanej gry` oraz kolejne `FAIL`; `main.js` jeszcze nie korzysta z bazy (a stare wywołanie `setContinueVisible` rzuca wyjątek).

- [ ] **Step 6: Podłącz bazę w `js/main.js`**

Zamień całą zawartość `js/main.js` na:

```js
(function (L) {
  'use strict';

  const MOVE_MS = 100;

  const canvas = document.getElementById('board');
  const boardWrap = document.getElementById('board-wrap');
  const ctx = canvas.getContext ? canvas.getContext('2d') : null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const store = L.storage.create(() => window.localStorage);

  // ?level=N: pomoc przy testach ręcznych. Nie zmienia zapisanego postępu i wyłącza bazę,
  // żeby test nie nadpisał przerwanej gry.
  const startLevelParam = Number(new URLSearchParams(window.location.search).get('level'));
  const testMode = Number.isInteger(startLevelParam) && startLevelParam >= 1;
  const config = L.cloudConfig || {};
  const cloud = testMode
    ? null
    : L.cloud.create({
        url: config.url,
        key: config.key,
        fetch: (input, init) => window.fetch(input, init),
        storage: () => window.localStorage,
        now: () => Date.now(),
      });

  let progress = store.load();
  let screen = 'menu';
  let state = null;
  let view = null;
  let anim = null; // { fromX, fromY, start }: trwająca animacja ruchu
  let queued = null; // jedno polecenie ruchu wydane w trakcie animacji
  let finishHandled = false;
  let savedGame = null; // przerwana gra do wznowienia przyciskiem Kontynuuj
  let started = false; // gracz zaczął grać w tej sesji, więc spóźniony zapis z bazy jest pomijany

  const input = L.input.bind({
    dpad: document.getElementById('dpad'),
    swipeArea: canvas,
    onCommand,
    isEnabled: () => screen === 'game',
  });

  function setScreen(name) {
    screen = name;
    input.releaseAll();
    L.ui.show(name);
  }

  function fit() {
    if (!state || !ctx || screen !== 'game') return;
    const dpr = window.devicePixelRatio || 1;
    view = L.render.fitCanvas(canvas, boardWrap.clientWidth, boardWrap.clientHeight, state.maze, dpr);
  }

  function resetMotion() {
    anim = null;
    queued = null;
    finishHandled = false;
  }

  function refreshContinue() {
    L.ui.setContinue(progress.unlocked > 1 || savedGame !== null, savedGame ? savedGame.level : null);
  }

  // Zapis przerwanej gry: w pamięci od razu (dla przycisku Kontynuuj), w bazie w tle.
  function saveGame() {
    if (!cloud || !state || state.finished) return;
    savedGame = L.game.toSave(state, performance.now());
    cloud.saveGame(savedGame);
  }

  function startLevel(level) {
    started = true;
    state = L.game.createLevel(level, L.rng.randomSeed());
    resetMotion();
    L.ui.setPaused(false);
    setScreen('game');
    fit();
    saveGame();
  }

  // Wznowienie zapisu: ten sam labirynt, pozycja, ruchy i czas; gra startuje w pauzie.
  function resumeGame(resumed) {
    started = true;
    state = resumed;
    resetMotion();
    setScreen('game');
    fit();
    L.ui.setPaused(true);
    saveGame();
  }

  function doMove(dir) {
    const now = performance.now();
    const next = L.game.move(state, dir, now);
    if (next === state) return;
    anim = reducedMotion.matches ? null : { fromX: state.x, fromY: state.y, start: now };
    state = next;
  }

  function onCommand(cmd) {
    if (screen !== 'game' || !state) return;
    if (cmd === 'pause') {
      togglePause();
      return;
    }
    if (cmd === 'newMaze') {
      newMaze();
      return;
    }
    if (state.paused || state.finished) return;
    if (anim) {
      queued = cmd;
      return;
    }
    doMove(cmd);
  }

  // Ten sam poziom, nowe ziarno; rekordy i odblokowanie bez zmian.
  function newMaze() {
    if (!state || state.finished) return;
    startLevel(state.level);
  }

  function togglePause() {
    if (!state || state.finished) return;
    const now = performance.now();
    state = state.paused ? L.game.resume(state, now) : L.game.pause(state, now);
    if (state.paused) {
      input.releaseAll();
      queued = null;
      saveGame();
    }
    L.ui.setPaused(state.paused);
  }

  function finishLevel(now) {
    finishHandled = true;
    const timeMs = L.game.elapsed(state, now);
    const shortest = L.maze.shortestPathLength(state.maze);
    const result = L.storage.recordResult(progress, state.level, timeMs, state.moves);
    progress = result.progress;
    store.save(progress);
    if (cloud) {
      cloud.saveResult({ level: state.level, seed: state.seed, timeMs, moves: state.moves, shortest });
      cloud.deleteGame();
    }
    savedGame = null;
    refreshContinue();
    L.ui.showDone({
      level: state.level,
      timeMs,
      moves: state.moves,
      shortest,
      stars: L.game.stars(state.moves, shortest),
      newBestTime: result.newBestTime,
      newBestMoves: result.newBestMoves,
    });
    setScreen('done');
  }

  function frame() {
    requestAnimationFrame(frame);
    if (screen !== 'game' || !state || !view) return;
    // Jeden zegar dla ruchu i HUD: znacznik rAF bywa wcześniejszy niż performance.now() z obsługi klawisza.
    const now = performance.now();
    let px = state.x;
    let py = state.y;
    if (anim) {
      const t = Math.min(1, (now - anim.start) / MOVE_MS);
      px = anim.fromX + (state.x - anim.fromX) * t;
      py = anim.fromY + (state.y - anim.fromY) * t;
      if (t >= 1) {
        anim = null;
        const next = queued;
        queued = null;
        if (next && !state.paused && !state.finished) doMove(next);
      }
    }
    L.render.draw(ctx, view, state.maze, { x: px, y: py }, progress.theme);
    L.ui.updateHud({ level: state.level, timeMs: L.game.elapsed(state, now), moves: state.moves });
    if (state.finished && !anim && !finishHandled) finishLevel(now);
  }

  const handlers = {
    newGame: () => startLevel(1),
    continue: () => {
      const resumed = savedGame && L.game.fromSave(savedGame);
      if (resumed) resumeGame(resumed);
      else startLevel(progress.unlocked);
    },
    records: () => {
      L.ui.renderRecords(progress);
      setScreen('records');
    },
    toggleTheme: () => {
      progress = Object.assign({}, progress, { theme: progress.theme === 'dark' ? 'light' : 'dark' });
      store.save(progress);
      L.ui.applyTheme(progress.theme);
    },
    pause: () => togglePause(),
    newMaze: () => newMaze(),
    resume: () => togglePause(),
    restart: () => {
      if (!state) return;
      state = L.game.restart(state);
      resetMotion();
      L.ui.setPaused(false);
    },
    menu: () => {
      saveGame();
      state = null;
      L.ui.setPaused(false);
      refreshContinue();
      setScreen('menu');
    },
    next: () => startLevel(state.level + 1),
    clearRecords: () => {
      if (!window.confirm('Wyczyścić wszystkie rekordy?')) return;
      progress = L.storage.clearRecords(progress);
      store.save(progress);
      if (cloud) cloud.clearResults();
      L.ui.renderRecords(progress);
    },
    back: () => setScreen('menu'),
  };

  L.ui.init(document, handlers);
  L.ui.applyTheme(progress.theme);
  refreshContinue();
  if (!ctx) L.ui.showCanvasError();

  window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    input.releaseAll();
    if (screen === 'game' && state && !state.paused && !state.finished) togglePause();
  });

  if (testMode) startLevel(startLevelParam);
  else setScreen('menu');

  // Przerwana gra z bazy. Gdy gracz zdążył już zacząć grać, odpowiedź jest pomijana.
  if (cloud) {
    cloud.loadGame().then((save) => {
      if (started || !L.game.fromSave(save)) return;
      savedGame = save;
      refreshContinue();
    });
  }

  requestAnimationFrame(frame);
})(window.Labirynt);
```

- [ ] **Step 7: Uruchom wszystkie testy**

Run: `node tests/run-node.js | grep -E "FAIL|zaliczonych" && bash tools/chrome.sh tests && bash tools/chrome.sh smoke && bash tools/chrome.sh smoke-cloud`
Expected: `93/93 zaliczonych` w Node i Chrome; `smoke`: `17/17 zaliczonych` (bez zmian, bo działa z `?level=1`, czyli bez bazy); `smoke-cloud`: `12/12 zaliczonych`.

- [ ] **Step 8: Uzupełnij specyfikację**

W `docs/superpowers/specs/2026-09-29-labirynt-design.md`:

- w punkcie 4.6, w akapicie **Konfiguracja**, po zdaniu kończącym się `Tak uruchamiane są testy automatyczne.` dopisz:
  `Konfiguracja ustawiona przed załadowaniem strony ma pierwszeństwo przed plikiem (korzysta z tego test `tools/smoke-cloud.js`).`
- w punkcie 8.1, po liście testów, dopisz akapit:

```markdown
Test gry z bazą: `tools/chrome.sh smoke-cloud` (`tools/smoke-cloud.js`) wstrzykuje do strony
sztuczny Supabase i sprawdza: przycisk "Kontynuuj: poziom N", wznowienie w pauzie z ruchami
i czasem, wysłanie wyniku i usunięcie zapisu po ukończeniu, zapis przy nowej grze, pauzie
i wyjściu do menu, usunięcie wyników przy czyszczeniu rekordów, jedno konto anonimowe oraz
pominięcie spóźnionej odpowiedzi z bazy.
```

- [ ] **Step 9: Sprawdź myślniki i Markdown**

Run: `python tools/check-dashes.py && echo brak && npx --yes markdownlint-cli2 "docs/superpowers/specs/2026-09-29-labirynt-design.md" 2>&1 | grep -E "MD004|MD029|MD032|MD033|MD058" || echo "brak istotnych uwag"`
Expected: `brak` i `brak istotnych uwag`.

- [ ] **Step 10: Zapis w repozytorium (tylko za zgodą użytkownika)**

```bash
git add js/cloud-config.js js/main.js js/ui.js index.html tests/ui.test.js tools/smoke-cloud.js tools/chrome.sh docs/superpowers/specs/2026-09-29-labirynt-design.md
git commit -m "Podłącz bazę Supabase: zapis wyników i wznawianie przerwanej gry"
```

---

### Task 4: Prawdziwy projekt Supabase, sprawdzenie ręczne i publikacja

**Files:**

- Modify: `js/cloud-config.js` (adres i klucz publiczny od użytkownika)
- Add to repository: `supabase/schema.sql` (już istnieje lokalnie, uruchomiony w Supabase 13.10.2026)

**Interfaces:**

- Consumes: wszystko z zadań 1-3.
- Produces: działająca gra na `https://marcinznuk.github.io/Labirynt/` z zapisem w bazie.

- [ ] **Step 1: Użytkownik włącza logowanie anonimowe i podaje dane projektu**

Poproś użytkownika o:

1. włączenie w panelu Supabase: Authentication, Sign In / Providers, "Allow anonymous sign-ins", zapis,
2. adres projektu (Project URL, w postaci `https://<identyfikator>.supabase.co`),
3. klucz publiczny: "Publishable key" (`sb_publishable_...`) albo "anon public".

Nie proś o klucz tajny (secret, `service_role`) ani o hasło do bazy. Jeśli użytkownik poda klucz tajny, nie wpisuj go nigdzie i poproś o publiczny.

- [ ] **Step 2: Wpisz konfigurację**

W `js/cloud-config.js` zamień `{ url: '', key: '' }` na wartości od użytkownika, np.:

```js
  L.cloudConfig = L.cloudConfig || {
    url: 'https://abcdefghijklmnop.supabase.co',
    key: 'sb_publishable_...',
  };
```

- [ ] **Step 3: Testy automatyczne z prawdziwą konfiguracją**

Run: `node tests/run-node.js | tail -1 && bash tools/chrome.sh tests && bash tools/chrome.sh smoke && bash tools/chrome.sh smoke-cloud`
Expected: jak w zadaniu 3, krok 7. `smoke` nie łączy się z bazą (`?level=1`), a `smoke-cloud` podmienia konfigurację na sztuczną.

- [ ] **Step 4: Sprawdzenie ręczne z prawdziwą bazą (lista z punktu 8.2 specyfikacji)**

Otwórz `index.html` z dysku w Chrome i sprawdź po kolei, zaglądając w panelu Supabase do Table Editor:

1. Nowa gra, przejście poziomu 1: w `results` pojawia się wiersz z poziomem 1 i gwiazdkami.
2. Nowa gra, kilka ruchów, pauza (Esc): w `saved_games` jest wiersz z tymi ruchami.
3. Kilka ruchów, zamknięcie karty, ponowne otwarcie: przycisk "Kontynuuj: poziom 1"; po kliknięciu ten sam labirynt, pozycja, ruchy i czas, gra w pauzie.
4. Ukończenie wznowionego poziomu: wiersz w `saved_games` znika.
5. Rekordy, "Wyczyść rekordy": wiersze gracza w `results` znikają.
6. Narzędzia przeglądarki, karta Network, tryb Offline, odświeżenie strony: gra działa bez błędów, a menu pokazuje zwykłe "Kontynuuj" albo go nie pokazuje.

Wynik każdego punktu zgłoś użytkownikowi. Błąd naprawiaj według superpowers:systematic-debugging, zaczynając od odpowiedzi serwera w karcie Network.

- [ ] **Step 5: Publikacja (tylko za zgodą użytkownika)**

```bash
git add js/cloud-config.js supabase/schema.sql
git commit -m "Ustaw projekt Supabase i dołącz skrypt bazy"
git push origin master
```

Poczekaj na przebudowanie strony (`gh api repos/MarcinZnuk/Labirynt/pages/builds/latest --jq .status` daje `built`) i powtórz na `https://marcinznuk.github.io/Labirynt/` punkty 1-3 z kroku 4.
