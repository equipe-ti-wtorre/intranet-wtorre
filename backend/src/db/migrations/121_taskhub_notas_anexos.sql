-- Notas do TaskHub: texto formatado (corpo maior) e anexos de qualquer tipo.
-- Idempotente: o migrate reexecuta os .sql

ALTER TABLE th_personal_notes MODIFY body MEDIUMTEXT NOT NULL;

CREATE TABLE IF NOT EXISTS th_personal_note_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  note_id INT NOT NULL,
  uploaded_by INT NULL,
  name VARCHAR(180) NOT NULL,
  mime VARCHAR(120) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  container VARCHAR(63) NOT NULL,
  `blob` VARCHAR(200) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_th_pnf_note (note_id),
  CONSTRAINT fk_th_pnf_note FOREIGN KEY (note_id) REFERENCES th_personal_notes(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_pnf_user FOREIGN KEY (uploaded_by) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
