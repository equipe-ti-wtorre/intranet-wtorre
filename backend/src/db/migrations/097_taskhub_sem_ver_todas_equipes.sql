-- Ninguém vê a empresa inteira por ver_todas_equipes. Tira a chave dos JSON gravados.
-- Idempotente: o migrate reexecuta os .sql

UPDATE th_access_profiles
   SET permissions = JSON_REMOVE(permissions, JSON_UNQUOTE(JSON_SEARCH(permissions, 'one', 'ver_todas_equipes')))
 WHERE JSON_CONTAINS(permissions, '"ver_todas_equipes"');

UPDATE th_users
   SET permissions = JSON_REMOVE(permissions, JSON_UNQUOTE(JSON_SEARCH(permissions, 'one', 'ver_todas_equipes')))
 WHERE JSON_CONTAINS(permissions, '"ver_todas_equipes"');
