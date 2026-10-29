-- TaskHub: Setor > Equipe > Projeto > Tarefa.
-- Cada equipe tem um quadro (um registro em th_projects, que não aparece como projeto).
-- Os projetos da equipe são os registros de th_project_sections desse quadro.

CREATE TABLE IF NOT EXISTS th_team_boards (
  team_id INT NOT NULL PRIMARY KEY,
  project_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_th_team_boards_project (project_id),
  CONSTRAINT fk_th_tb_team FOREIGN KEY (team_id) REFERENCES th_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_tb_project FOREIGN KEY (project_id) REFERENCES th_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
