ALTER TABLE solicitacoes_colaborador
  MODIFY COLUMN tipo ENUM('novo','reposicao','mudanca','efetivacao') NOT NULL;
