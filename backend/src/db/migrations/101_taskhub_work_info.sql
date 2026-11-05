-- Dados extras do projeto da equipe (departamento solicitante).
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS th_work_info (
  work_id INT NOT NULL PRIMARY KEY,
  department VARCHAR(200) NULL,
  CONSTRAINT fk_th_wi_work FOREIGN KEY (work_id) REFERENCES th_project_sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
