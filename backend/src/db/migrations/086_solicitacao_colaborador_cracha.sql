-- Cracha gerado automaticamente (geracao integrada com a ferramenta Cracha & Boas-vindas).
-- Idempotente: o migrate reexecuta os .sql.

SET @col_cracha := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'solicitacoes_colaborador' AND COLUMN_NAME = 'cracha_url'
);
SET @sql_cracha := IF(
  @col_cracha = 0,
  'ALTER TABLE solicitacoes_colaborador ADD COLUMN cracha_url VARCHAR(500) NULL AFTER boas_vindas_url',
  'SELECT 1'
);
PREPARE stmt_cracha FROM @sql_cracha;
EXECUTE stmt_cracha;
DEALLOCATE PREPARE stmt_cracha;
