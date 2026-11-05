-- O painel da equipe abre para todo membro, com o que cada um pode ver. Tira a chave dos JSON gravados.
-- Idempotente: o migrate reexecuta os .sql

UPDATE th_access_profiles
   SET permissions = JSON_REMOVE(permissions, JSON_UNQUOTE(JSON_SEARCH(permissions, 'one', 'ver_painel_equipe')))
 WHERE JSON_CONTAINS(permissions, '"ver_painel_equipe"');

UPDATE th_users
   SET permissions = JSON_REMOVE(permissions, JSON_UNQUOTE(JSON_SEARCH(permissions, 'one', 'ver_painel_equipe')))
 WHERE JSON_CONTAINS(permissions, '"ver_painel_equipe"');
