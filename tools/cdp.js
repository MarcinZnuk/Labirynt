'use strict';

// Wspólne połączenie z Chrome bez okna przez protokół CDP.
// Używają go tools/shot.js (zrzuty ekranu) i tools/smoke.js (test pętli gry).

const { spawn } = require('child_process');
const path = require('path');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const root = path.resolve(__dirname, '..');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Emulacja i wejście działają tylko na karcie, więc potrzebny jest adres celu
// typu "page", a nie adres samej przeglądarki z /json/version.
async function pageEndpoint(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/list');
      const page = (await res.json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (err) {
      // Chrome jeszcze nie odpowiada, próbujemy dalej.
    }
    await delay(250);
  }
  throw new Error('Chrome nie wystartował na porcie ' + port);
}

function connect(url) {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message));
    else entry.resolve(msg.result);
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('błąd połączenia CDP')));
  });
  function send(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  return { ready, send, close: () => ws.close() };
}

async function launch(options) {
  const port = (options && options.port) || 9333;
  const profile = (options && options.profile) || 'profile';
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--user-data-dir=' + path.join(root, '.shots', profile),
      '--remote-debugging-port=' + port,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  const client = connect(await pageEndpoint(port));
  await client.ready;
  return {
    send: client.send,
    stop() {
      client.close();
      chrome.kill();
    },
  };
}

module.exports = { root, delay, launch };
