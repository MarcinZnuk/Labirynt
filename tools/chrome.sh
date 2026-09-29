#!/usr/bin/env bash
# Chrome bez okna do testów i zrzutów ekranu.
#   tools/chrome.sh tests                           - uruchamia tests/test.html, kod wyjścia 0 gdy wszystko przechodzi
#   tools/chrome.sh smoke                           - test petli gry (ruch, pauza, ukonczenie poziomu)
#   tools/chrome.sh shot <plik[?query]> <nazwa> [SZER,WYS] - zapisuje zrzut do .shots/<nazwa>.png
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"

file_url() {
  local file="${1%%\?*}" query=""
  if [[ "$1" == *\?* ]]; then query="?${1#*\?}"; fi
  echo "file:///$(cygpath -m "$PWD/$file" | sed 's/ /%20/g')$query"
}

case "${1:-}" in
  tests)
    dom="$("$CHROME" --headless=new --disable-gpu --dump-dom "$(file_url tests/test.html)" 2>/dev/null)"
    echo "$dom" | grep -o '<li class="fail">[^<]*' | sed 's/<li class="fail">//' || true
    summary="$(echo "$dom" | grep -o 'id="summary"[^<]*' || true)"
    echo "$summary"
    [[ "$summary" == *'data-failed="0"'* ]]
    ;;
  smoke)
    node tools/smoke.js
    ;;
  shot)
    # Zrzut przez CDP: --window-size na Windows nie schodzi ponizej okolic 504 px.
    node tools/shot.js "$2" "$3" "${4:-390,844}"
    ;;
  *)
    echo "użycie: tools/chrome.sh tests | smoke | shot <plik[?query]> <nazwa> [SZER,WYS]" >&2
    exit 2
    ;;
esac
