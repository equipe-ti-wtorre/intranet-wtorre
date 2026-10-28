-- Tarefa como registro de reunião/alinhamento.
-- th_task_contacts: "Alinhado com" (quem participou ou pediu). Só registro: não avisa nem dá acesso à tarefa.
-- th_task_alignment: data do alinhamento (por padrão o dia em que a tarefa foi criada).
-- th_subtask_quiet: etapas cujo responsável não deve ser avisado (nem quando chegar a vez dele).
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS th_task_contacts (
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (task_id, user_id),
  KEY idx_th_tcon_user (user_id),
  CONSTRAINT fk_th_tcon_task FOREIGN KEY (task_id) REFERENCES th_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_tcon_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_task_alignment (
  task_id INT PRIMARY KEY,
  aligned_on DATE NOT NULL,
  CONSTRAINT fk_th_talg_task FOREIGN KEY (task_id) REFERENCES th_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_subtask_quiet (
  subtask_id INT PRIMARY KEY,
  CONSTRAINT fk_th_squiet_sub FOREIGN KEY (subtask_id) REFERENCES th_subtasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
