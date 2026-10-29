-- Fases dos projetos (cartões do quadro): cada equipe define a lista dela; team_id NULL é a lista padrão da empresa.
-- Cada projeto está em uma fase e cada tarefa pertence a uma fase.
-- board_position é a ordem do projeto dentro da coluna do Kanban (a linha do tempo usa project_sections.position).
-- duration_days: dias úteis previstos na fase (0 = não ocupa a pista, ex.: Concluído).
-- Idempotente: o migrate reexecuta os .sql
-- Desenvolvimento recebeu uma versão anterior com fases por setor (th_sector_phases). Para trocar, uma vez:
--   DROP TABLE th_task_phase, th_work_phase, th_sector_phases;
-- e depois aplicar só este arquivo.
-- Produção (tabela já existia sem duration_days):
--   ALTER TABLE th_team_phases ADD COLUMN duration_days INT NOT NULL DEFAULT 5;
--   UPDATE th_team_phases SET duration_days = 0 WHERE name = 'Concluído';
--   UPDATE th_team_phases SET duration_days = 2 WHERE name = 'A iniciar' AND duration_days = 5;
--   UPDATE th_team_phases SET duration_days = 8 WHERE name = 'Em andamento' AND duration_days = 5;

CREATE TABLE IF NOT EXISTS th_team_phases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NULL,
  name VARCHAR(60) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#8b93a1',
  position INT NOT NULL DEFAULT 0,
  duration_days INT NOT NULL DEFAULT 5,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_th_tph_team (team_id, position),
  CONSTRAINT fk_th_tph_team FOREIGN KEY (team_id) REFERENCES th_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_work_phase (
  work_id INT PRIMARY KEY,
  phase_id INT NOT NULL,
  board_position DOUBLE NOT NULL DEFAULT 0,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by INT NULL,
  KEY idx_th_wp_phase (phase_id),
  CONSTRAINT fk_th_wp_work FOREIGN KEY (work_id) REFERENCES th_project_sections(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_wp_phase FOREIGN KEY (phase_id) REFERENCES th_team_phases(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_wp_user FOREIGN KEY (changed_by) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_task_phase (
  task_id INT PRIMARY KEY,
  phase_id INT NOT NULL,
  KEY idx_th_tp_phase (phase_id),
  CONSTRAINT fk_th_tp_task FOREIGN KEY (task_id) REFERENCES th_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_tp_phase FOREIGN KEY (phase_id) REFERENCES th_team_phases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO th_team_phases (team_id, name, color, position, duration_days)
SELECT NULL, d.name, d.color, d.position, d.duration_days FROM (
  SELECT 'A iniciar' AS name, '#8b93a1' AS color, 0 AS position, 2 AS duration_days
  UNION ALL SELECT 'Em andamento', '#4c8dff', 1, 8
  UNION ALL SELECT 'Homologação', '#f59e0b', 2, 5
  UNION ALL SELECT 'Concluído', '#22c55e', 3, 0
) d
WHERE NOT EXISTS (SELECT 1 FROM th_team_phases WHERE team_id IS NULL);
