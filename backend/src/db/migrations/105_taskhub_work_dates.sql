-- Datas dos projetos da equipe: o planejado (combinado na criação ou em edição manual) e o histórico de mudanças.
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS th_work_baseline (
  work_id INT NOT NULL PRIMARY KEY,
  start_date DATE NULL,
  due_date DATE NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INT NULL,
  KEY idx_th_wbl_user (updated_by),
  CONSTRAINT fk_th_wbl_work FOREIGN KEY (work_id) REFERENCES th_project_sections(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_wbl_user FOREIGN KEY (updated_by) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_work_date_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_id INT NOT NULL,
  kind VARCHAR(12) NOT NULL,
  old_start DATE NULL,
  new_start DATE NULL,
  old_due DATE NULL,
  new_due DATE NULL,
  reason VARCHAR(500) NULL,
  cause_work_id INT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_th_wdl_work (work_id, created_at),
  KEY idx_th_wdl_cause (cause_work_id),
  KEY idx_th_wdl_user (created_by),
  CONSTRAINT fk_th_wdl_work FOREIGN KEY (work_id) REFERENCES th_project_sections(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_wdl_cause FOREIGN KEY (cause_work_id) REFERENCES th_project_sections(id) ON DELETE SET NULL,
  CONSTRAINT fk_th_wdl_user FOREIGN KEY (created_by) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Projetos que já existiam: o planejado começa igual às datas atuais.
INSERT IGNORE INTO th_work_baseline (work_id, start_date, due_date)
SELECT s.id, ws.start_date, s.due_date
  FROM th_project_sections s
  LEFT JOIN th_work_schedule ws ON ws.work_id = s.id
 WHERE ws.start_date IS NOT NULL OR s.due_date IS NOT NULL;
