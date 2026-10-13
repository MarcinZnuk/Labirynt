(function (L) {
  'use strict';

  // Adres projektu Supabase i klucz publiczny (publishable albo anon) z panelu Supabase.
  // Klucz publiczny jest jawny z założenia, dane chronią reguły RLS z supabase/schema.sql.
  // Nigdy nie wpisuj tu klucza tajnego (secret) ani service_role. Puste wartości wyłączają bazę.
  // Konfiguracja ustawiona przed załadowaniem strony (test tools/smoke-cloud.js) ma pierwszeństwo.
  L.cloudConfig = L.cloudConfig || {
    url: 'https://bndrorwmaveklqjtfkxw.supabase.co',
    key: 'sb_publishable_TKey4MH0Cy6lQ3fP1b56LA_-8l9KT0_',
  };
})(window.Labirynt = window.Labirynt || {});
