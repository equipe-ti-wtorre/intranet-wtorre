-- Etapas simultâneas. A linha existe quando a tarefa NÃO segue a prioridade.
-- Sem linha, a etapa seguinte só conclui depois da anterior (padrão das tarefas já existentes).
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS th_task_parallel_steps (
  task_id INT PRIMARY KEY,
  CONSTRAINT fk_th_tpar_task FOREIGN KEY (task_id) REFERENCES th_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
