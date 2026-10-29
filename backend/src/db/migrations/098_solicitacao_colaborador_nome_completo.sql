-- Nome completo informado pelo solicitante, alem de nome e sobrenome.
-- Idempotente: o migrate reexecuta os .sql.

SET @col_nome_completo := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'solicitacoes_colaborador' AND COLUMN_NAME = 'nome_completo'
);
SET @sql_nome_completo := IF(
  @col_nome_completo = 0,
  'ALTER TABLE solicitacoes_colaborador ADD COLUMN nome_completo VARCHAR(255) NULL AFTER sobrenome',
  'SELECT 1'
);
PREPARE stmt_nome_completo FROM @sql_nome_completo;
EXECUTE stmt_nome_completo;
DEALLOCATE PREPARE stmt_nome_completo;
