# Labirynt - specyfikacja gry w HTML

Data: 2026-09-29
Status: zaakceptowana, uzgodniona z planem prac `docs/superpowers/plans/2026-09-29-labirynt.md`
Zmiana 2026-10-13: najkrótsza droga i gwiazdki na koniec poziomu (punkty 4.2, 4.4, 6.1 i 8.1).
Zmiana 2026-10-13: zapis wyników i przerwanej gry w bazie Supabase (punkty 2, 4.4, 4.6, 5, 6, 7, 8
i 10).

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
| Baza danych | Supabase | użytkownik, 13.10.2026 |
| Zakres bazy | zapis wyników i wznawianie przerwanej gry | użytkownik, 13.10.2026 |
| Gracz w bazie | bez logowania, anonimowy użytkownik przypisany do przeglądarki | użytkownik, 13.10.2026 |

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
- Po ukończeniu poziomu gra wylicza długość najkrótszej drogi ze startu do wyjścia (liczba ruchów)
  i przyznaje ocenę: 3 gwiazdki za przejście najkrótszą drogą, 2 za drogę dłuższą najwyżej
  o połowę, 1 za każde inne przejście. Przykład dla najkrótszej drogi 64 ruchów: 64 ruchy dają
  3 gwiazdki, 65-96 ruchów 2 gwiazdki, 97 i więcej 1 gwiazdkę. Ocena nie jest zapisywana
  w rekordach.
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

1. **Menu:** tytuł, przyciski Nowa gra, Kontynuuj (widoczny tylko przy zapisanym postępie
   albo przerwanej grze w bazie), Rekordy oraz przełącznik motywu.
2. **Gra:** plansza, HUD, krzyżak na urządzeniach dotykowych, nakładka pauzy z przyciskami
   Wznów i Menu.
3. **Koniec poziomu:** ocena gwiazdkami, czas, liczba ruchów, długość najkrótszej drogi,
   oznaczenie nowego rekordu czasu lub ruchów, przyciski Dalej i Menu. Gwiazdki mają też opis
   tekstowy dla czytników ekranu, np. "Ocena: 2 z 3".
4. **Rekordy:** tabela poziomów z najlepszym czasem i najmniejszą liczbą ruchów, przycisk
   Wyczyść rekordy (z potwierdzeniem) i Wróć.

"Nowa gra" zaczyna od poziomu 1 i nie kasuje rekordów. "Kontynuuj" otwiera najwyższy
odblokowany poziom z nowym labiryntem, a gdy w bazie jest przerwana gra, wznawia ją (punkt 4.6).

Pomoc przy testach: parametr adresu `?level=N` (np. `index.html?level=10`) od razu uruchamia
poziom N. Nie odblokowuje poziomów i nie zmienia zapisanego postępu. Przy tym parametrze gra
nie łączy się z bazą.

### 4.5 Zapis

- Klucz `labirynt.v1` w `localStorage`, wartość JSON:
  `{ "unlocked": number, "best": { "<poziom>": { "timeMs": number, "moves": number } }, "theme": "dark" | "light" }`.
- Najlepszy czas i najmniejsza liczba ruchów są zapisywane niezależnie (mogą pochodzić z różnych
  przejść).
- Każdy odczyt i zapis jest w `try/catch`. Brak dostępu, brak danych albo niepoprawny JSON
  oznaczają stan domyślny (`unlocked: 1`, puste rekordy, motyw ciemny). Gra działa wtedy
  normalnie, tylko bez zapamiętywania.

### 4.6 Baza danych (Supabase)

Dodatek do zapisu z punktu 4.5, nie jego zamiennik. Gra działa w pełni bez bazy, a baza dokłada
zapis wyników i wznawianie przerwanej gry.

**Struktura bazy:** `supabase/schema.sql`, czyli tabele `results` i `saved_games`, widok `records`
i reguły dostępu (RLS): każdy gracz czyta i zmienia tylko swoje wiersze. Skrypt uruchomiony
w projekcie Supabase 13.10.2026. W ustawieniach projektu musi być włączone logowanie anonimowe
(Authentication, Sign In / Providers, "Allow anonymous sign-ins").

**Konfiguracja:** `js/cloud-config.js` z adresem projektu i kluczem publicznym (publishable albo
anon). Klucz publiczny jest jawny z założenia, dane chronią reguły RLS. W pliku nigdy nie trafia
klucz tajny (secret) ani `service_role`. Puste wartości wyłączają bazę i gra działa jak bez
internetu. Tak uruchamiane są testy automatyczne. Konfiguracja ustawiona przed załadowaniem
strony ma pierwszeństwo przed plikiem (korzysta z tego test `tools/smoke-cloud.js`).

**Gracz:** bez logowania. Przy pierwszym połączeniu gra zakłada w Supabase anonimowego
użytkownika i zapamiętuje jego sesję w `localStorage` pod kluczem `labirynt.cloud.v1`.
Równoczesne wywołania czekają na tę samą sesję, więc powstaje jedno konto. Wygasły
token dostępu odnawia tokenem odświeżania. Sesja z `localStorage` ma pierwszeństwo przed kopią
w pamięci, bo inna karta mogła ją już odnowić. Gdy serwer odrzuci token odświeżania, gra
najpierw sprawdza, czy w `localStorage` nie ma nowszej sesji z innej karty, a dopiero potem
zakłada nowego anonimowego użytkownika. Po wyjściu z pauzy gra odnawia wygasający token od razu,
żeby zapis przy zamknięciu karty nie musiał czekać na logowanie. Wyczyszczenie danych przeglądarki oznacza nowego gracza: stare
wiersze zostają w bazie, ale gra do nich nie trafia.

**Wyniki:** po ukończeniu poziomu gra wysyła do `results` poziom, ziarno, czas zaokrąglony do
milisekund, liczbę ruchów i długość najkrótszej drogi. Gwiazdki liczy baza. Ekran Rekordy dalej
korzysta z `localStorage`. "Wyczyść rekordy" usuwa też wyniki gracza w bazie.

**Przerwana gra:** jeden zapis na gracza w `saved_games`: poziom, ziarno, pozycja (x, y), liczba
ruchów i naliczony czas w pełnych milisekundach. Labirynt odtwarza się z poziomu i ziarna. Gra
nadpisuje zapis:

- przy rozpoczęciu poziomu (Nowa gra, Dalej, Kontynuuj, Nowa plansza),
- przy włączeniu pauzy, także automatycznej po ukryciu karty,
- przy wyjściu do menu.

Zapis gry zawsze idzie z opcją `keepalive`, żeby przetrwał zamknięcie karty. Gdy przeglądarka
odrzuci takie zapytanie, zapis idzie zwykłym zapytaniem.

Po ukończeniu poziomu zapis jest usuwany. Restart poziomu nie zapisuje od razu, zrobi to
najbliższa pauza albo wyjście do menu.

**Wznowienie:** przy starcie gra pobiera zapis z bazy. Menu pokazuje się od razu, a przycisk
Kontynuuj zmienia się, gdy nadejdzie odpowiedź. Poprawny zapis (poziom od 1, ziarno w zakresie
liczb 32-bitowych bez znaku, pozycja w granicach planszy, ruchy i czas nieujemne) zmienia napis
przycisku na "Kontynuuj: poziom N". Kliknięcie odtwarza ten sam labirynt, pozycję, ruchy i czas,
a gra startuje w pauzie z nakładką. Niepoprawny zapis jest pomijany, a Kontynuuj działa jak
w punkcie 4.4. Kliknięcie Kontynuuj przed odpowiedzią z bazy czeka na nią (najwyżej do limitu
czasu), żeby nie zastąpić przerwanej gry nowym poziomem.

**Błędy:** każde wywołanie bazy ma limit czasu 8 s. Błąd sieci, odpowiedź z błędem i brak
konfiguracji kończą się cicho: gra działa dalej, bez komunikatu. Nieudany zapis wyniku nie jest
ponawiany. Darmowy projekt Supabase może zostać wstrzymany po tygodniu bez ruchu; gra działa
wtedy jak bez internetu, a projekt wznawia się w panelu Supabase.

**Bez bibliotek:** komunikacja przez `fetch` z REST API Supabase, bez biblioteki supabase-js
(zgodnie z punktem 5). Sesja: `POST /auth/v1/signup` z ciałem `{ "data": {} }` (użytkownik
anonimowy) i `POST /auth/v1/token?grant_type=refresh_token`. Dane: `/rest/v1/results`,
`/rest/v1/saved_games` (zapis jako upsert z nagłówkiem `Prefer: resolution=merge-duplicates`).
Każde zapytanie ma nagłówek `apikey` z kluczem publicznym, a zapytania o dane także
`Authorization: Bearer` z tokenem dostępu gracza.

## 5. Wymagania niefunkcjonalne

- Bez zależności zewnętrznych, bez kroku budowania, działa offline i z `file://`. Baza
  z punktu 4.6 jest dodatkiem: bez internetu gra działa w pełni, tylko nie zapisuje w bazie.
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
js/cloud-config.js - Labirynt.cloudConfig: adres projektu Supabase i klucz publiczny
js/cloud.js       - Labirynt.cloud: sesja anonimowa i zapis w bazie Supabase
js/ui.js          - Labirynt.ui: przełączanie ekranów, HUD, motyw
js/main.js        - złożenie modułów, pętla gry
tests/test.html   - testy logiki w przeglądarce
tests/tests.js    - przypadki testowe
supabase/schema.sql - tabele, widok i reguły dostępu bazy (uruchamiany w panelu Supabase)
```

### 6.1 Odpowiedzialności i interfejsy

- **rng:** `create(seed) -> () => number` z przedziału [0, 1). Brak zależności.
- **maze:** `generate(width, height, rand) -> Maze`, gdzie `Maze` przechowuje szerokość,
  wysokość i ściany każdego pola (flagi N, E, S, W). `canMove(maze, x, y, dir) -> boolean`.
  `shortestPathLength(maze) -> number`: liczba ruchów najkrótszej drogi ze startu do wyjścia.
  Zależy tylko od funkcji `rand`.
- **game:** `createLevel(level, seed) -> State`, `move(state, dir, nowMs) -> State`,
  `elapsed(state, nowMs) -> ms`, `pause(state, nowMs)`, `resume(state, nowMs)`,
  `restart(state)`, `stars(moves, shortest) -> 1 | 2 | 3`. Zapis przerwanej gry:
  `toSave(state, nowMs) -> Save` oraz `fromSave(save) -> State | null`, gdzie `Save` to
  `{ level, seed, x, y, moves, timeMs }` z czasem w pełnych milisekundach; stan z zapisu jest
  w pauzie, a niepoprawny zapis daje `null`. Stan jest niezmienny, a `move` zwraca ten sam obiekt, gdy ruch jest niemożliwy. Zegar
  liczony na żądanie przez `elapsed`, bez cyklicznego `tick`. Czas przekazywany z zewnątrz,
  dzięki czemu logika jest testowalna bez zegara przeglądarki. Zależy od `maze` i `rng`.
- **input:** zamienia zdarzenia przeglądarki na polecenia `'up' | 'down' | 'left' | 'right'`
  i `'pause'`, przekazywane przez callback. Nie zna stanu gry.
- **render:** `fitCanvas(canvas, availWidth, availHeight, maze, dpr) -> view` oraz
  `draw(ctx, view, maze, pos, theme)`, gdzie `pos` to pozycja gracza (także pośrednia
  w trakcie animacji, wyliczana przez `main`). Tylko rysuje, niczego nie zmienia.
- **storage:** `load() -> Progress`, `save(progress)`, `recordResult(progress, level, timeMs,
  moves) -> { progress, newBestTime, newBestMoves }`.
- **cloud:** `create({ url, key, fetch, storage, now }) -> Cloud | null` (`null` przy pustej
  konfiguracji). Metody `Cloud` zwracają `Promise` i nigdy nie odrzucają: `ready() -> boolean`
  (sesja gotowa z wyprzedzeniem),
  `saveResult({ level, seed, timeMs, moves, shortest }) -> boolean`, `clearResults() -> boolean`,
  `saveGame(save) -> boolean`, `loadGame() -> Save | null`,
  `deleteGame() -> boolean`. Sesję zakłada i odnawia sam przy pierwszym potrzebnym wywołaniu.
  `fetch`, magazyn i zegar są podmienialne, więc moduł jest testowany bez sieci. Nie zna stanu
  gry ani DOM.
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
- Baza: jak w punkcie 4.6, błędy nigdy nie przerywają gry i nie są pokazywane graczowi.
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
- maze: najkrótsza droga idzie korytarzem (labirynt-wąż 3x3 ma drogę 8 ruchów, nie 4).
- game: ruch w ścianę nie zmienia pozycji ani licznika ruchów.
- game: ruch w otwarte przejście zmienia pozycję i zwiększa licznik o 1.
- game: zegar startuje przy pierwszym ruchu, a pauza zatrzymuje naliczanie.
- game: wejście na wyjście ustawia stan ukończenia i zatrzymuje zegar.
- game: rozmiar poziomu zgodny ze wzorem z punktu 4.1 (poziomy 1, 2, 9, 10, 50).
- game: gwiazdki zgodne z progami z punktu 4.2, także na granicach progów.
- storage: niepoprawny JSON i wyjątek magazynu dają stan domyślny.
- storage: `recordResult` aktualizuje osobno lepszy czas i lepszą liczbę ruchów oraz odblokowuje
  kolejny poziom.
- game: `toSave` i `fromSave` odtwarzają ten sam labirynt, pozycję, ruchy i czas, a stan
  z zapisu jest w pauzie; zapis z pozycją poza planszą, złym poziomem albo ziarnem daje `null`.
- cloud (z podstawionym `fetch` i magazynem): bez konfiguracji `create` zwraca `null`; bez
  sesji zakłada użytkownika anonimowego; równoczesne wywołania zakładają jedno konto; ważną
  sesję używa ponownie; wygasłą odnawia; `ready` odnawia ją z wyprzedzeniem; druga karta bierze
  nowszą sesję z magazynu zamiast starego tokenu z pamięci; po odrzuceniu tokenu najpierw
  sprawdza nowszą sesję z innej karty; po
  odrzuceniu odnowienia zakłada nowego użytkownika; nagłówki `apikey` i `Authorization`;
  czas zaokrąglony do milisekund; zapis gry jako upsert; błąd sieci i odpowiedź z błędem dają
  `false` albo `null` bez wyjątku.

Test gry z bazą: `tools/chrome.sh smoke-cloud` (`tools/smoke-cloud.js`) wstrzykuje do strony
sztuczny Supabase i sprawdza: przycisk "Kontynuuj: poziom N", wznowienie w pauzie z ruchami
i czasem, wysłanie wyniku i usunięcie zapisu po ukończeniu, zapis przy nowej grze, pauzie
i wyjściu do menu, usunięcie wyników przy czyszczeniu rekordów, jedno konto anonimowe,
pominięcie spóźnionej odpowiedzi z bazy, czekanie wczesnego kliknięcia Kontynuuj na odpowiedź
z bazy oraz odnowienie tokenu od razu po wyjściu z pauzy.

### 8.2 Ręczne (lista kontrolna)

- Przejście poziomów 1-3 klawiaturą (strzałki i WASD).
- Przytrzymanie klawisza, pauza przez Esc, P i przełączenie karty.
- Nowa plansza przyciskiem i klawiszem N: inny labirynt, ten sam poziom, czas i ruchy od zera,
  rekordy bez zmian.
- Telefon: krzyżak, gesty, obrót ekranu, brak przewijania strony podczas gry.
- Zamknięcie karty i ponowne otwarcie: działa Kontynuuj, rekordy są zachowane.
- Tryb prywatny lub zablokowany zapis: gra działa bez błędów.
- Przełączenie motywu i `prefers-reduced-motion`.
- Baza (prawdziwy projekt Supabase): ukończenie poziomu dodaje wiersz w `results`; pauza
  zapisuje grę w `saved_games`; zamknięcie karty w trakcie gry i ponowne otwarcie pokazuje
  "Kontynuuj: poziom N", a kliknięcie wznawia ten sam labirynt, pozycję, ruchy i czas;
  ukończenie poziomu usuwa zapis; "Wyczyść rekordy" usuwa wyniki w bazie.
- Bez internetu (tryb offline w narzędziach przeglądarki): gra działa bez błędów.

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

Poza zakresem bazy (punkt 4.6): logowanie kontem (GitHub, e-mail) i wznawianie gry na innym
urządzeniu, wspólny ranking graczy, rekordy czytane z bazy, wznowienie przerwanej gry bez
internetu, ponawianie nieudanych zapisów, ochrona przed masowym zakładaniem kont anonimowych
(CAPTCHA).
