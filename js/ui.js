(function (L) {
  'use strict';

  let doc = null;
  let el = null;

  function formatTime(ms) {
    const tenths = Math.floor(Math.max(0, ms) / 100);
    const minutes = Math.floor(tenths / 600);
    const seconds = Math.floor((tenths % 600) / 10);
    return minutes + ':' + String(seconds).padStart(2, '0') + '.' + (tenths % 10);
  }

  function recordText(newBestTime, newBestMoves) {
    if (newBestTime && newBestMoves) return 'Nowy rekord czasu i ruchów!';
    if (newBestTime) return 'Nowy rekord czasu!';
    if (newBestMoves) return 'Nowy rekord ruchów!';
    return '';
  }

  function recordRows(progress) {
    return Object.keys(progress.best)
      .map(Number)
      .sort((a, b) => a - b)
      .map((level) => ({
        level,
        time: formatTime(progress.best[level].timeMs),
        moves: String(progress.best[level].moves),
      }));
  }

  function init(documentRef, handlers) {
    doc = documentRef;
    const byId = (id) => doc.getElementById(id);
    el = {
      continueBtn: byId('continue-btn'),
      themeBtn: byId('theme-btn'),
      hudLevel: byId('hud-level'),
      hudTime: byId('hud-time'),
      hudMoves: byId('hud-moves'),
      pauseOverlay: byId('pause-overlay'),
      resumeBtn: byId('resume-btn'),
      doneLevel: byId('done-level'),
      doneTime: byId('done-time'),
      doneMoves: byId('done-moves'),
      doneRecord: byId('done-record'),
      recordsTable: byId('records-table'),
      recordsBody: byId('records-body'),
      recordsEmpty: byId('records-empty'),
      boardWrap: byId('board-wrap'),
    };
    for (const button of doc.querySelectorAll('[data-action]')) {
      const handler = handlers[button.dataset.action];
      if (typeof handler === 'function') button.addEventListener('click', () => handler());
    }
  }

  function show(name) {
    for (const screen of doc.querySelectorAll('.screen')) screen.hidden = screen.dataset.screen !== name;
    if (doc.activeElement && doc.activeElement !== doc.body) doc.activeElement.blur();
    const target = doc.querySelector(`.screen[data-screen="${name}"] [data-autofocus]`);
    if (target) target.focus();
  }

  function setContinueVisible(visible) {
    el.continueBtn.hidden = !visible;
  }

  function applyTheme(theme) {
    doc.documentElement.dataset.theme = theme;
    el.themeBtn.textContent = 'Motyw: ' + (theme === 'light' ? 'jasny' : 'ciemny');
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function updateHud(hud) {
    setText(el.hudLevel, String(hud.level));
    setText(el.hudTime, formatTime(hud.timeMs));
    setText(el.hudMoves, String(hud.moves));
  }

  function setPaused(paused) {
    el.pauseOverlay.hidden = !paused;
    if (paused) el.resumeBtn.focus();
    else if (doc.activeElement === el.resumeBtn) el.resumeBtn.blur();
  }

  function showDone(result) {
    el.doneLevel.textContent = String(result.level);
    el.doneTime.textContent = formatTime(result.timeMs);
    el.doneMoves.textContent = String(result.moves);
    const text = recordText(result.newBestTime, result.newBestMoves);
    el.doneRecord.textContent = text;
    el.doneRecord.hidden = text === '';
  }

  function renderRecords(progress) {
    const rows = recordRows(progress).map((row) => {
      const tr = doc.createElement('tr');
      for (const value of [String(row.level), row.time, row.moves]) {
        const td = doc.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      }
      return tr;
    });
    el.recordsBody.replaceChildren(...rows);
    el.recordsTable.hidden = rows.length === 0;
    el.recordsEmpty.hidden = rows.length > 0;
  }

  function showCanvasError() {
    const message = doc.createElement('p');
    message.className = 'board-error';
    message.textContent =
      'Ta przeglądarka nie obsługuje rysowania planszy (Canvas). Użyj aktualnej wersji Chrome, Edge, Firefox lub Safari.';
    el.boardWrap.replaceChildren(message);
  }

  L.ui = {
    formatTime,
    recordText,
    recordRows,
    init,
    show,
    setContinueVisible,
    applyTheme,
    updateHud,
    setPaused,
    showDone,
    renderRecords,
    showCanvasError,
  };
})(window.Labirynt = window.Labirynt || {});
