-- Um projeto da equipe pode continuar outro do mesmo quadro (uma V2, por exemplo).
-- work_id continua related_id. Os dois lados se leem a partir desta tabela.
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS th_work_links (
  work_id INT NOT NULL,
  related_id INT NOT NULL,
  PRIMARY KEY (work_id, related_id),
  KEY idx_th_wlink_related (related_id),
  CONSTRAINT fk_th_wlink_work FOREIGN KEY (work_id) REFERENCES th_project_sections(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_wlink_related FOREIGN KEY (related_id) REFERENCES th_project_sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
