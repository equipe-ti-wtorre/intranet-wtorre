-- Fases próprias de projetos sem equipe (projeto individual): as linhas ficam em th_team_phases
-- (team_id NULL) e esta tabela diz de qual projeto elas são. Sem ligação, team_id NULL é o roteiro padrão.
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS th_project_phases (
  phase_id INT NOT NULL PRIMARY KEY,
  project_id INT NOT NULL,
  KEY idx_th_pph_project (project_id),
  CONSTRAINT fk_th_pph_phase FOREIGN KEY (phase_id) REFERENCES th_team_phases(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_pph_project FOREIGN KEY (project_id) REFERENCES th_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
