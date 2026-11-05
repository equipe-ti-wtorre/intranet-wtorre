-- Anexos dos projetos das equipes do TaskHub (Azure Blob ou disco local no nbpdev).
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS th_work_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_id INT NOT NULL,
  uploaded_by INT NULL,
  name VARCHAR(180) NOT NULL,
  mime VARCHAR(120) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  container VARCHAR(63) NOT NULL,
  `blob` VARCHAR(200) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_th_wf_work (work_id),
  KEY idx_th_wf_user (uploaded_by),
  CONSTRAINT fk_th_wf_work FOREIGN KEY (work_id) REFERENCES th_project_sections(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_wf_user FOREIGN KEY (uploaded_by) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
