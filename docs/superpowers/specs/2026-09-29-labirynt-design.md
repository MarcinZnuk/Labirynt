# Labirynt - specyfikacja gry w HTML

Data: 2026-09-29
Status: zaakceptowana, uzgodniona z planem prac `docs/superpowers/plans/2026-09-29-labirynt.md`

## 1. Cel i kryterium sukcesu

Gra w przechodzenie labiryntu działająca w przeglądarce, tworzona dla siebie, z możliwością
pokazania innym. Nie wymaga instalacji ani serwera.

**Kryterium sukcesu:** użytkownik otwiera `index.html` na komputerze albo telefonie, przechodzi
kolejne poziomy, a gra zapamiętuje postęp i rekordy.

## 2. Ustalenia

| Obszar | Decyzja | Źródło |
|---|---|---|
| Labirynt | generowany losowo, rośnie z poziomem | użytkownik (opcja domyślna) |
| Platforma | desktop i telefon | użytkownik (opcja domyślna) |
| Widok | 2D z góry, cały labirynt widoczny na ekranie | użytkownik (opcja domyślna) |
| Cel | dla siebie, do pokazania innym | założenie zaakceptowane |
| Presja czasu | brak limitu, czas jest tylko mierzony | założenie zaakceptowane |
| Dźwięk | poza pierwszą wersją | założenie zaakceptowane |
| Nazwa | "Labirynt" | założenie zaakceptowane |
| Kolory | motyw ciemny domyślnie, jasny do wyboru | założenie zaakceptowane |
| Podpowiedź drogi | poza pierwszą wersją | założenie zaakceptowane |
| Maksymalny rozmiar | 25x25, bez przewijanej kamery | założenie zaakceptowane |

## 3. Podejście techniczne

Czysty JavaScript i Canvas 2D, kilka plików, bez zależności i bez kroku budowania.

- Skrypty ładowane zwykłymi znacznikami `<script>` w ustalonej kolejności. Moduły ES nie są
  używane, bo przeglądarki blokują je przy otwarciu pliku z dysku (`file://`).
- Każdy plik rejestruje swoje API w jednej globalnej przestrzeni nazw `window.Labirynt`
  (np. `Labirynt.maze`, `Labirynt.game`), bez innych zmiennych globalnych.
- Odrzucone warianty: jeden plik HTML (trudny w rozwoju i testowaniu) oraz silnik gier, np.
  Phaser (zbędna zależność przy siatce kratek). W razie potrzeby wersję jednoplikową do wysłania
  można złożyć na koniec z gotowych plików.

## 4. Wymagania funkcjonalne

### 4.1 Labirynt

- Algorytm "recursive backtracker" (DFS z cofaniem), wersja iteracyjna ze stosem, żeby przy
  25x25 nie przepełnić stosu wywołań.
- Labirynt jest doskonały: między dowolnymi dwoma polami istnieje dokładnie jedna droga.
- Generator przyjmuje ziarno (seed). To samo ziarno i rozmiar dają zawsze ten sam labirynt.
- Ziarno poziomu jest losowane przy pierwszym wejściu na poziom i zapamiętywane w stanie gry,
  więc restart poziomu daje ten sam labirynt.
- Start w polu (0, 0), czyli lewym górnym rogu. Wyjście w polu (szerokość-1, wysokość-1), czyli
  prawym dolnym rogu.
- Rozmiar poziomu N (numerowanie od 1): `min(8 + 2 * (N - 1), 25)` pól w każdym wymiarze, czyli
  8, 10, 12, ... 24, a od poziomu 10 stałe 25x25. Każdy poziom powyżej 9 ma nowy labirynt.
- Liczba poziomów nie jest ograniczona.

### 4.2 Rozgrywka

- Gracz porusza się o jedno pole w czterech kierunkach.
- Ruch w ścianę jest ignorowany: nie zmienia pozycji ani licznika ruchów.
- Ruch jest animowany przez 100 ms. Polecenie wydane w trakcie animacji jest zapamiętywane
  (jedno, ostatnie) i wykonywane po jej zakończeniu.
- Przytrzymanie klawisza lub przycisku krzyżaka powtarza ruch co 120 ms, pierwsze powtórzenie
  po 200 ms.
- Wejście na pole wyjścia kończy poziom i zatrzymuje zegar.
- Zegar startuje przy pierwszym udanym ruchu na poziomie, nie przy wyświetleniu planszy.
- HUD pokazuje: numer poziomu, czas (format `m:ss.d`), liczbę ruchów oraz przyciski Pauza,
  Restart i Nowa plansza.
- Restart poziomu przywraca gracza na start, zeruje czas i ruchy, zachowuje ten sam labirynt.
- Nowa plansza (przycisk w HUD albo klawisz N) losuje nowe ziarno dla tego samego poziomu
  i generuje nowy labirynt tego samego rozmiaru. Gracz wraca na start, czas i ruchy są zerowane,
  pauza zostaje wyłączona. Działa bez potwierdzenia, także w pauzie. Nie zmienia rekordów ani
  odblokowanych poziomów.
- Pauza: klawisz Esc albo P, przycisk w HUD oraz automatycznie, gdy karta przestaje być widoczna
  (`visibilitychange`). W pauzie zegar stoi, a ruch jest zablokowany. Wznowienie tym samym
  klawiszem lub przyciskiem.

### 4.3 Sterowanie

- Klawiatura: strzałki oraz W, A, S, D do ruchu, Esc i P do pauzy, N do nowej planszy. Klawisze rozpoznawane po `event.code` (fizyczne
  położenie), więc działają niezależnie od wielkości liter, Caps Lock i układu klawiatury.
- Klawisze sterujące nie przewijają strony (`preventDefault` dla strzałek i spacji w trakcie
  gry).
- Powtarzanie ruchu jest własne, nie systemowe. Przy dwóch trzymanych kierunkach aktywny jest
  ostatnio naciśnięty. Puszczenie go wraca do kierunku wciąż trzymanego. Utrata fokusu okna
  lub ukrycie karty zwalnia wszystkie klawisze.
- Urządzenia dotykowe (wykrywane regułą CSS `@media (pointer: coarse)`): krzyżak na ekranie
  pod planszą, obsługiwany zdarzeniami `pointer`, z powtarzaniem przy przytrzymaniu.
- Przesunięcie palcem po planszy o co najmniej 30 px wykonuje jeden krok w dominującym kierunku.

### 4.4 Ekrany

1. **Menu:** tytuł, przyciski Nowa gra, Kontynuuj (widoczny tylko przy zapisanym postępie),
   Rekordy oraz przełącznik motywu.
2. **Gra:** plansza, HUD, krzyżak na urządzeniach dotykowych, nakładka pauzy z przyciskami
   Wznów i Menu.
3. **Koniec poziomu:** czas, liczba ruchów, oznaczenie nowego rekordu czasu lub ruchów,
   przyciski Dalej i Menu.
4. **Rekordy:** tabela poziomów z najlepszym czasem i najmniejszą liczbą ruchów, przycisk
   Wyczyść rekordy (z potwierdzeniem) i Wróć.

"Nowa gra" zaczyna od poziomu 1 i nie kasuje rekordów. "Kontynuuj" otwiera najwyższy
odblokowany poziom z nowym labiryntem.

Pomoc przy testach: parametr adresu `?level=N` (np. `index.html?level=10`) od razu uruchamia
poziom N. Nie odblokowuje poziomów i nie zmienia zapisanego postępu.

### 4.5 Zapis

- Klucz `labirynt.v1` w `localStorage`, wartość JSON:
  `{ "unlocked": number, "best": { "<poziom>": { "timeMs": number, "moves": number } }, "theme": "dark" | "light" }`.
- Najlepszy czas i najmniejsza liczba ruchów są zapisywane niezależnie (mogą pochodzić z różnych
  przejść).
- Każdy odczyt i zapis jest w `try/catch`. Brak dostępu, brak danych albo niepoprawny JSON
  oznaczają stan domyślny (`unlocked: 1`, puste rekordy, motyw ciemny). Gra działa wtedy
  normalnie, tylko bez zapamiętywania.

## 5. Wymagania niefunkcjonalne

- Bez zależności zewnętrznych, bez kroku budowania, działa offline i z `file://`.
- Aktualne wersje Chrome, Edge, Firefox i Safari, także mobilne.
- Płynna animacja (pętla `requestAnimationFrame`, cel 60 klatek na sekundę).
- Plansza skaluje się do dostępnego miejsca przy zmianie rozmiaru okna i obrocie telefonu.
  Canvas uwzględnia `devicePixelRatio`, żeby linie były ostre.
- Przy 25x25 na ekranie o szerokości 360 px pole ma co najmniej 13 px.
- Kontrast ścian i tła co najmniej 4.5:1 w obu motywach.
- Przy `prefers-reduced-motion: reduce` ruch jest natychmiastowy, bez animacji.
- Całą grę da się obsłużyć samą klawiaturą, łącznie z menu (fokus i Enter).

## 6. Architektura

```
index.html        - struktura ekranów, ładowanie skryptów w kolejności
css/style.css     - wygląd, motywy, układ responsywny
js/rng.js         - Labirynt.rng: generator liczb losowych z ziarnem (mulberry32)
js/maze.js        - Labirynt.maze: generowanie labiryntu, sprawdzanie przejść
js/game.js        - Labirynt.game: stan poziomu, ruch, czas, ukończenie
js/input.js       - Labirynt.input: klawiatura, krzyżak, gesty -> polecenia ruchu
js/render.js      - Labirynt.render: rysowanie na Canvas, skalowanie
js/storage.js     - Labirynt.storage: odczyt i zapis postępu
js/ui.js          - Labirynt.ui: przełączanie ekranów, HUD, motyw
js/main.js        - złożenie modułów, pętla gry
tests/test.html   - testy logiki w przeglądarce
tests/tests.js    - przypadki testowe
```

### 6.1 Odpowiedzialności i interfejsy

- **rng:** `create(seed) -> () => number` z przedziału [0, 1). Brak zależności.
- **maze:** `generate(width, height, rand) -> Maze`, gdzie `Maze` przechowuje szerokość,
  wysokość i ściany każdego pola (flagi N, E, S, W). `canMove(maze, x, y, dir) -> boolean`.
  Zależy tylko od funkcji `rand`.
- **game:** `createLevel(level, seed) -> State`, `move(state, dir, nowMs) -> State`,
  `elapsed(state, nowMs) -> ms`, `pause(state, nowMs)`, `resume(state, nowMs)`,
  `restart(state)`. Stan jest niezmienny, a `move` zwraca ten sam obiekt, gdy ruch jest
  niemożliwy. Zegar liczony na żądanie przez `elapsed`, bez cyklicznego `tick`. Czas
  przekazywany z zewnątrz, dzięki czemu logika jest testowalna bez zegara przeglądarki.
  Zależy od `maze` i `rng`.
- **input:** zamienia zdarzenia przeglądarki na polecenia `'up' | 'down' | 'left' | 'right'`
  i `'pause'`, przekazywane przez callback. Nie zna stanu gry.
- **render:** `fitCanvas(canvas, availWidth, availHeight, maze, dpr) -> view` oraz
  `draw(ctx, view, maze, pos, theme)`, gdzie `pos` to pozycja gracza (także pośrednia
  w trakcie animacji, wyliczana przez `main`). Tylko rysuje, niczego nie zmienia.
- **storage:** `load() -> Progress`, `save(progress)`, `recordResult(progress, level, timeMs,
  moves) -> { progress, newBestTime, newBestMoves }`.
- **ui:** pokazuje i ukrywa ekrany, aktualizuje HUD, obsługuje przyciski, przekazuje akcje
  do `main`.
- **main:** tworzy stan, łączy wejście z logiką, uruchamia pętlę i obsługuje przejścia między
  ekranami.

### 6.2 Przepływ danych

`input` wydaje polecenie ruchu, `main` przekazuje je do `game.move`. `game` sprawdza przejście
w `maze` i zwraca nowy stan. `render` rysuje stan w każdej klatce, a `ui` odświeża HUD. Po
ukończeniu poziomu `main` wywołuje `storage.recordResult` i pokazuje ekran końca poziomu.

Moduły `rng`, `maze`, `game` i `storage` (z podmienialnym magazynem) nie dotykają DOM, więc są
testowane bez interfejsu.

## 7. Obsługa błędów

- Zapis: jak w punkcie 4.5, błędy nigdy nie przerywają gry.
- Brak obsługi Canvas: komunikat w miejscu planszy zamiast pustego ekranu.
- Nieznane klawisze i nieprawidłowe polecenia są ignorowane.
- Po powrocie z pauzy lub po przełączeniu karty czas nie nalicza okresu przerwy.

## 8. Testy

### 8.1 Automatyczne (`tests/test.html` w przeglądarce oraz `node tests/run-node.js`)

Minimalna własna funkcja asercji, wynik na stronie (liczba zaliczonych i lista błędów). Te same
testy uruchamia Node (tylko do testów, gra go nie potrzebuje) oraz Chrome bez okna przez
`tools/chrome.sh tests`. Lista plików testowych istnieje tylko w `tests/test.html`.

- rng: to samo ziarno daje ten sam ciąg, różne ziarna dają różne ciągi.
- maze: dla rozmiarów 2x2, 8x8 i 25x25 każde pole jest osiągalne ze startu.
- maze: liczba przejść równa się liczbie pól minus 1 (labirynt doskonały).
- maze: ściany są spójne (przejście z A do B oznacza przejście z B do A), krawędzie planszy
  zamknięte.
- maze: to samo ziarno i rozmiar dają identyczny labirynt.
- game: ruch w ścianę nie zmienia pozycji ani licznika ruchów.
- game: ruch w otwarte przejście zmienia pozycję i zwiększa licznik o 1.
- game: zegar startuje przy pierwszym ruchu, a pauza zatrzymuje naliczanie.
- game: wejście na wyjście ustawia stan ukończenia i zatrzymuje zegar.
- game: rozmiar poziomu zgodny ze wzorem z punktu 4.1 (poziomy 1, 2, 9, 10, 50).
- storage: niepoprawny JSON i wyjątek magazynu dają stan domyślny.
- storage: `recordResult` aktualizuje osobno lepszy czas i lepszą liczbę ruchów oraz odblokowuje
  kolejny poziom.

### 8.2 Ręczne (lista kontrolna)

- Przejście poziomów 1-3 klawiaturą (strzałki i WASD).
- Przytrzymanie klawisza, pauza przez Esc, P i przełączenie karty.
- Nowa plansza przyciskiem i klawiszem N: inny labirynt, ten sam poziom, czas i ruchy od zera,
  rekordy bez zmian.
- Telefon: krzyżak, gesty, obrót ekranu, brak przewijania strony podczas gry.
- Zamknięcie karty i ponowne otwarcie: działa Kontynuuj, rekordy są zachowane.
- Tryb prywatny lub zablokowany zapis: gra działa bez błędów.
- Przełączenie motywu i `prefers-reduced-motion`.

## 9. Etapy prac

| Etap | Zakres | Wynik do sprawdzenia |
|---|---|---|
| M0 | szkielet plików, Canvas, pętla, skalowanie | pusta plansza dopasowuje się do okna |
| M1 | rng, generator labiryntu, testy logiki | labirynt się rysuje, testy przechodzą |
| M2 | ruch, kolizje, wyjście, animacja | poziom da się przejść klawiaturą |
| M3 | poziomy, HUD, czas, ruchy, pauza, restart | kolejne poziomy rosną |
| M4 | ekrany menu, końca poziomu i rekordów | pełna pętla gry |
| M5 | krzyżak, gesty, układ mobilny | gra działa na telefonie |
| M6 | zapis postępu, rekordów i motywu | Kontynuuj i Rekordy działają |
| M7 | szlif: motywy, kontrast, reduced motion, obsługa menu klawiaturą | gotowe do pokazania |

## 10. Poza zakresem pierwszej wersji

Dźwięk, podpowiedź drogi, mgła wojny, przeciwnicy i klucze, przewijana kamera dla labiryntów
większych niż 25x25, tryb pseudo-3D, wersja jednoplikowa.
