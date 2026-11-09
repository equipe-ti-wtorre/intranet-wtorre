-- Quadro individual: um registro em th_projects por pessoa, que não aparece como projeto.
-- Os projetos individuais são os registros de th_project_sections desse quadro.
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS th_personal_boards (
  user_id INT NOT NULL PRIMARY KEY,
  project_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_th_personal_boards_project (project_id),
  CONSTRAINT fk_th_pb_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_pb_project FOREIGN KEY (project_id) REFERENCES th_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
