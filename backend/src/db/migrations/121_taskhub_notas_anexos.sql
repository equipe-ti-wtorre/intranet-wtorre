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

-- Notas compartilhadas: o dono escolhe pessoas (de qualquer equipe) que veem e editam a mesma nota.
CREATE TABLE IF NOT EXISTS th_personal_note_members (
  note_id INT NOT NULL,
  user_id INT NOT NULL,
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (note_id, user_id),
  KEY idx_th_pnm_user (user_id),
  CONSTRAINT fk_th_pnm_note FOREIGN KEY (note_id) REFERENCES th_personal_notes(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_pnm_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Papel de quem recebe a nota: 'editor' (padrão) ou 'leitor' (somente leitura).
SET @existe := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'th_personal_note_members' AND column_name = 'role'
);
SET @sql := IF(@existe = 0, 'ALTER TABLE th_personal_note_members ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT ''editor''', 'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
