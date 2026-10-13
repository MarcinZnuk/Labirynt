-- Labirynt: baza wyników i zapisu przerwanej rozgrywki (Supabase, PostgreSQL).
--
-- Jak uruchomić: panel Supabase > projekt > SQL Editor > New query > wklej całość > Run.
-- Skrypt można uruchomić ponownie: niczego nie dubluje i nie kasuje danych.
--
-- Gracz to użytkownik Supabase Auth (anonimowy albo zalogowany). Każdy widzi i zmienia
-- tylko swoje wiersze, pilnują tego reguły dostępu (RLS) na końcu pliku.
-- Czas w grze jest ułamkowy (performance.now), więc przed zapisem trzeba go zaokrąglić do ms.

-- Wyniki ukończonych poziomów: jeden wiersz na każde przejście poziomu.
create table if not exists public.results (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  level integer not null check (level >= 1),
  seed bigint not null check (seed between 0 and 4294967295),
  time_ms integer not null check (time_ms >= 0),
  moves integer not null,
  shortest integer not null check (shortest >= 1),
  -- Te same progi co w grze (js/game.js, stars): 3 za najkrótszą drogę, 2 za najwyżej o połowę dłuższą.
  stars smallint generated always as (
    case when moves <= shortest then 3 when moves * 2 <= shortest * 3 then 2 else 1 end
  ) stored,
  finished_at timestamptz not null default now(),
  constraint results_moves_not_below_shortest check (moves >= shortest)
);

create index if not exists results_user_level_idx on public.results (user_id, level);

comment on table public.results is 'Labirynt: wyniki ukończonych poziomów, jeden wiersz na przejście';
comment on column public.results.seed is 'Ziarno labiryntu: ten sam poziom i ziarno dają ten sam labirynt';
comment on column public.results.time_ms is 'Czas przejścia w milisekundach';
comment on column public.results.shortest is 'Liczba ruchów najkrótszej drogi ze startu do wyjścia';
comment on column public.results.stars is 'Ocena 1-3, liczona przez bazę z ruchów i najkrótszej drogi';

-- Przerwana rozgrywka: najwyżej jeden zapis na gracza, nadpisywany przy każdym zapisie.
-- Labirynt odtwarza się z poziomu i ziarna, więc ścian nie trzeba zapisywać.
-- Zegar startuje przy pierwszym ruchu, więc moves = 0 oznacza, że zegar jeszcze nie ruszył.
create table if not exists public.saved_games (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  level integer not null check (level >= 1),
  seed bigint not null check (seed between 0 and 4294967295),
  x integer not null check (x >= 0),
  y integer not null check (y >= 0),
  moves integer not null default 0 check (moves >= 0),
  time_ms integer not null default 0 check (time_ms >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.saved_games is 'Labirynt: przerwana rozgrywka do wznowienia, jeden zapis na gracza';
comment on column public.saved_games.x is 'Kolumna gracza, 0 = lewa krawędź';
comment on column public.saved_games.y is 'Wiersz gracza, 0 = górna krawędź';
comment on column public.saved_games.time_ms is 'Czas naliczony do chwili zapisu, w milisekundach';

create or replace function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saved_games_touch on public.saved_games;
create trigger saved_games_touch
  before update on public.saved_games
  for each row execute function public.touch_updated_at();

-- Rekordy liczone z wyników, więc nie ma osobnej tabeli do pilnowania.
-- security_invoker: widok podlega tym samym regułom dostępu co tabela wyników.
create or replace view public.records with (security_invoker = true) as
select
  user_id,
  level,
  min(time_ms) as best_time_ms,
  min(moves) as best_moves,
  max(stars) as best_stars,
  count(*) as plays
from public.results
group by user_id, level;

comment on view public.records is 'Labirynt: rekordy gracza na poziom, liczone z wyników';

-- Reguły dostępu: tylko zalogowany gracz (także anonimowy) i tylko do swoich wierszy.
alter table public.results enable row level security;
alter table public.saved_games enable row level security;

revoke all on public.results, public.saved_games, public.records from anon;

drop policy if exists "Gracz czyta swoje wyniki" on public.results;
create policy "Gracz czyta swoje wyniki" on public.results
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Gracz dopisuje swoje wyniki" on public.results;
create policy "Gracz dopisuje swoje wyniki" on public.results
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- Usuwanie dla przycisku "Wyczyść rekordy". Brak reguły update: wyniku nie da się poprawić.
drop policy if exists "Gracz usuwa swoje wyniki" on public.results;
create policy "Gracz usuwa swoje wyniki" on public.results
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Gracz czyta swój zapis" on public.saved_games;
create policy "Gracz czyta swój zapis" on public.saved_games
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Gracz tworzy swój zapis" on public.saved_games;
create policy "Gracz tworzy swój zapis" on public.saved_games
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Gracz nadpisuje swój zapis" on public.saved_games;
create policy "Gracz nadpisuje swój zapis" on public.saved_games
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Gracz usuwa swój zapis" on public.saved_games;
create policy "Gracz usuwa swój zapis" on public.saved_games
  for delete to authenticated using ((select auth.uid()) = user_id);
