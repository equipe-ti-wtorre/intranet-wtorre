-- Punição por falta: N sessões bloqueadas (idempotente: o migrate reexecuta os .sql)

SET @col_sessoes := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_config'
    AND COLUMN_NAME = 'sessoes_punicao'
);
SET @sql_sessoes := IF(
    @col_sessoes = 0,
    'ALTER TABLE massagem_config ADD COLUMN sessoes_punicao INT NOT NULL DEFAULT 1',
    'SELECT 1'
);
PREPARE stmt_sessoes FROM @sql_sessoes;
EXECUTE stmt_sessoes;
DEALLOCATE PREPARE stmt_sessoes;

CREATE TABLE IF NOT EXISTS massagem_punicoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  email VARCHAR(255) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  reserva_id INT NULL,
  evento_id INT NULL,
  data_falta DATE NOT NULL,
  sessoes_aplicadas INT NOT NULL DEFAULT 1,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_massagem_punicao_email (email),
  KEY idx_massagem_punicao_data (data_falta),
  CONSTRAINT fk_massagem_punicao_evento
    FOREIGN KEY (evento_id) REFERENCES massagem_eventos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
