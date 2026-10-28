-- Projetos (th_project_sections) com vários responsáveis e histórico de fases.
-- owner_id continua em th_project_sections e guarda o primeiro responsável (linha do tempo, painéis e filtros usam ele).
-- No quadro da equipe, th_work_members passa a significar "solicitantes": só acompanham a fase do projeto.
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS th_work_owners (
  work_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (work_id, user_id),
  KEY idx_th_wo_user (user_id),
  CONSTRAINT fk_th_wo_work FOREIGN KEY (work_id) REFERENCES th_project_sections(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_wo_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_work_phase_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_id INT NOT NULL,
  phase_id INT NOT NULL,
  changed_by INT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_th_wpl_work (work_id, changed_at),
  CONSTRAINT fk_th_wpl_work FOREIGN KEY (work_id) REFERENCES th_project_sections(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_wpl_phase FOREIGN KEY (phase_id) REFERENCES th_team_phases(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_wpl_user FOREIGN KEY (changed_by) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO th_work_owners (work_id, user_id)
SELECT id, owner_id FROM th_project_sections WHERE owner_id IS NOT NULL;

INSERT INTO th_work_phase_log (work_id, phase_id, changed_by, changed_at)
SELECT wp.work_id, wp.phase_id, wp.changed_by, wp.changed_at FROM th_work_phase wp
WHERE NOT EXISTS (SELECT 1 FROM th_work_phase_log l WHERE l.work_id = wp.work_id);
