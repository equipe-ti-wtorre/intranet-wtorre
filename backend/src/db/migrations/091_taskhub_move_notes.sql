-- Motivo escrito ao mudar a tarefa de etapa (coluna do Kanban).
-- O texto só é devolvido a quem escreveu, ao responsável e à gestão do projeto.

CREATE TABLE IF NOT EXISTS th_task_activity_notes (
  activity_id INT PRIMARY KEY,
  body TEXT NOT NULL,
  CONSTRAINT fk_th_tan_activity FOREIGN KEY (activity_id) REFERENCES th_task_activity(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
