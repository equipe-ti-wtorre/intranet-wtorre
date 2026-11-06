-- Início do TaskHub em produção: começa sem projetos e tarefas, e Vinicius Bomfim entra como admin e gestor.
-- ATENÇÃO: o migrate reexecuta todos os .sql a cada deploy. Cada passo aqui grava uma marca em
-- th_one_time_runs e só roda enquanto essa marca não existe, então a limpeza acontece UMA vez.

CREATE TABLE IF NOT EXISTS th_one_time_runs (
  run_key    VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1) Limpeza: tarefas, projetos e notificações. Os quadros das equipes (status, fases, membros) ficam.
--    Etapas, comentários, anexos, histórico, plano do dia etc. saem junto por ON DELETE CASCADE.
DELETE FROM th_notifications
 WHERE NOT EXISTS (SELECT 1 FROM th_one_time_runs WHERE run_key = '107_limpa_projetos_tarefas');

DELETE FROM th_tasks
 WHERE NOT EXISTS (SELECT 1 FROM th_one_time_runs WHERE run_key = '107_limpa_projetos_tarefas');

DELETE FROM th_project_sections
 WHERE NOT EXISTS (SELECT 1 FROM th_one_time_runs WHERE run_key = '107_limpa_projetos_tarefas');

-- Projetos individuais (os que não são quadro de equipe).
DELETE p FROM th_projects p
 WHERE NOT EXISTS (SELECT 1 FROM th_team_boards b WHERE b.project_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM th_one_time_runs WHERE run_key = '107_limpa_projetos_tarefas');

INSERT IGNORE INTO th_one_time_runs (run_key) VALUES ('107_limpa_projetos_tarefas');

-- 2) Perfil admin + gestor. Se o usuário ainda não existir (nunca entrou nem foi sincronizado),
--    a marca não é gravada e o passo roda de novo no próximo deploy, até encontrá-lo.
UPDATE th_users
   SET profiles = JSON_ARRAY('admin', 'gestor')
 WHERE LOWER(email) = 'vinicius.bomfim@wtorre.com.br'
   AND NOT EXISTS (SELECT 1 FROM th_one_time_runs WHERE run_key = '107_admin_vinicius');

INSERT IGNORE INTO th_one_time_runs (run_key)
SELECT '107_admin_vinicius' FROM th_users WHERE LOWER(email) = 'vinicius.bomfim@wtorre.com.br' LIMIT 1;
