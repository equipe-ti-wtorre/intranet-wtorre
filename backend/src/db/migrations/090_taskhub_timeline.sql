-- Data inicial e duração (dias úteis) de cada trabalho na linha do tempo do projeto.
-- A data final do trabalho continua em th_project_sections.due_date.

CREATE TABLE IF NOT EXISTS th_work_schedule (
  work_id INT PRIMARY KEY,
  start_date DATE NULL,
  duration_days INT NOT NULL DEFAULT 5,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_th_wsch_work FOREIGN KEY (work_id) REFERENCES th_project_sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
