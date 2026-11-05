-- Pausas de projetos da equipe: quando um projeto novo entra no meio de um já iniciado.
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS th_work_pauses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  cause_work_id INT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_th_wpa_work (work_id, end_date),
  KEY idx_th_wpa_cause (cause_work_id),
  KEY idx_th_wpa_user (created_by),
  CONSTRAINT fk_th_wpa_work FOREIGN KEY (work_id) REFERENCES th_project_sections(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_wpa_cause FOREIGN KEY (cause_work_id) REFERENCES th_project_sections(id) ON DELETE SET NULL,
  CONSTRAINT fk_th_wpa_user FOREIGN KEY (created_by) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
