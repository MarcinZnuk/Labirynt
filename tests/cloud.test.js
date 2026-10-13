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

  test('cloud: ready odnawia wygasającą sesję z wyprzedzeniem', async () => {
    const storage = memoryStorage({ [C.SESSION_KEY]: storedSession('u7', NOW_S + 30) });
    const { cloud, calls } = setup(happy, { storage });
    assertEqual(await cloud.ready(), true);
    assertEqual(calls.map((c) => c.path), ['/auth/v1/token?grant_type=refresh_token']);
    await cloud.saveGame(SAVE);
    assertEqual(calls.slice(1).map((c) => c.path), ['/rest/v1/saved_games'], 'zapis bez czekania na logowanie');
  });

  // Serwer jak GoTrue po rotacji: ważny jest tylko najnowszy token odświeżania, starszy dostaje 400.
  function rotatingServer() {
    const server = { generation: 1, clock: NOW_S, calls: [], beforeRefresh: null };
    const session = (g) => ({
      access_token: 'at-' + g,
      refresh_token: 'rt-' + g,
      expires_in: 3600,
      expires_at: server.clock + 3600,
      user: { id: 'u1' },
    });
    server.session = session;
    server.fetch = (url, init) => {
      const path = url.slice(BASE.length);
      const body = init.body === undefined ? null : JSON.parse(init.body);
      server.calls.push({ path, body, headers: init.headers || {} });
      let status = 201;
      let data = null;
      if (path === '/auth/v1/signup') {
        status = 200;
        data = Object.assign(session(1), { access_token: 'at-nowy', user: { id: 'nowy' } });
      } else if (path.startsWith('/auth/v1/token')) {
        if (server.beforeRefresh) server.beforeRefresh();
        if (body.refresh_token === 'rt-' + server.generation) {
          server.generation++;
          status = 200;
          data = session(server.generation);
        } else {
          status = 400;
          data = { error_code: 'refresh_token_already_used' };
        }
      } else if (init.method === 'GET') {
        status = 200;
        data = [];
      }
      return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(data) });
    };
    server.create = (storage) =>
      C.create({ url: BASE, key: KEY, fetch: server.fetch, storage: () => storage, now: () => server.clock * 1000 });
    return server;
  }

  test('cloud: druga karta bierze nowszą sesję z magazynu zamiast starego tokenu z pamięci', async () => {
    const server = rotatingServer();
    const storage = memoryStorage({ [C.SESSION_KEY]: JSON.stringify(server.session(1)) });
    const tabA = server.create(storage);
    const tabB = server.create(storage);
    await tabA.loadGame();
    await tabB.loadGame();
    server.clock += 3600;
    await tabA.loadGame();
    server.clock += 3600;
    await tabA.loadGame();
    const before = server.calls.length;
    await tabB.loadGame();
    const fromB = server.calls.slice(before);
    assertEqual(fromB.map((c) => c.path), ['/rest/v1/saved_games?select=level,seed,x,y,moves,time_ms&limit=1']);
    assertEqual(fromB[0].headers.Authorization, 'Bearer at-3');
  });

  test('cloud: po odrzuceniu tokenu sprawdza nowszą sesję z innej karty, zanim założy konto', async () => {
    const server = rotatingServer();
    const storage = memoryStorage({ [C.SESSION_KEY]: JSON.stringify(server.session(1)) });
    const tab = server.create(storage);
    server.clock += 3600;
    // Inna karta odnawia sesję w chwili, gdy to zapytanie jest w drodze.
    server.beforeRefresh = () => {
      server.beforeRefresh = null;
      server.generation = 2;
      storage.setItem(C.SESSION_KEY, JSON.stringify(server.session(2)));
    };
    await tab.loadGame();
    assert(!server.calls.some((c) => c.path === '/auth/v1/signup'), 'bez nowego konta');
    assertEqual(server.calls[server.calls.length - 1].headers.Authorization, 'Bearer at-2');
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
