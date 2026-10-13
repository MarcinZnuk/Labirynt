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

    async function obtainSession(retried) {
      // Magazyn przed pamięcią: inna karta mogła już odnowić sesję, a stary token jest wtedy nieważny.
      const current = readSession() || session;
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
        // Odrzucony token: inna karta mogła go właśnie odnowić. Jej sesja jest lepsza niż nowe konto.
        const latest = readSession();
        if (!retried && latest && latest.refresh_token !== current.refresh_token) return obtainSession(true);
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

    // Sesja gotowa z wyprzedzeniem (np. po wyjściu z pauzy), żeby zapis przy zamykaniu karty
    // nie musiał najpierw czekać na odnowienie tokenu, którego przeglądarka już nie dokończy.
    function ready() {
      return ensureSession().then(Boolean);
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

    return { ready, saveResult, clearResults, saveGame, loadGame, deleteGame };
  }

  L.cloud = { SESSION_KEY, create };
})(window.Labirynt = window.Labirynt || {});
