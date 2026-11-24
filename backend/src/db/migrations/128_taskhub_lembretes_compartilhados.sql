-- Lembretes compartilhados: o dono escolhe pessoas que também veem e recebem o aviso.
CREATE TABLE IF NOT EXISTS th_reminder_members (
  reminder_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reminder_id, user_id),
  KEY idx_th_remmem_user (user_id),
  CONSTRAINT fk_th_remmem_rem FOREIGN KEY (reminder_id) REFERENCES th_reminders(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_remmem_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
