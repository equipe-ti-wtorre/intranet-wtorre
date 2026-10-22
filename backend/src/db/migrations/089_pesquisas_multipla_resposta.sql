-- Permite mais de um envio por pessoa quando multipla_resposta = 1
-- Idempotente: o migrate reexecuta os .sql

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_formularios'
    AND COLUMN_NAME = 'multipla_resposta'
);
SET @sql_col := IF(
    @col = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN multipla_resposta TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt_col FROM @sql_col;
EXECUTE stmt_col;
DEALLOCATE PREPARE stmt_col;

SET @uk_user := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND INDEX_NAME = 'uk_pesquisas_resposta_user'
);
SET @sql_uk_user := IF(
    @uk_user > 0,
    'ALTER TABLE pesquisas_respostas DROP INDEX uk_pesquisas_resposta_user',
    'SELECT 1'
);
PREPARE stmt_uk_user FROM @sql_uk_user;
EXECUTE stmt_uk_user;
DEALLOCATE PREPARE stmt_uk_user;

SET @uk_conv := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND INDEX_NAME = 'uk_pesquisas_resposta_conv'
);
SET @sql_uk_conv := IF(
    @uk_conv > 0,
    'ALTER TABLE pesquisas_respostas DROP INDEX uk_pesquisas_resposta_conv',
    'SELECT 1'
);
PREPARE stmt_uk_conv FROM @sql_uk_conv;
EXECUTE stmt_uk_conv;
DEALLOCATE PREPARE stmt_uk_conv;

SET @idx_user := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND INDEX_NAME = 'idx_pesquisas_resposta_user'
);
SET @sql_idx_user := IF(
    @idx_user = 0,
    'ALTER TABLE pesquisas_respostas ADD INDEX idx_pesquisas_resposta_user (formulario_id, usuario_id)',
    'SELECT 1'
);
PREPARE stmt_idx_user FROM @sql_idx_user;
EXECUTE stmt_idx_user;
DEALLOCATE PREPARE stmt_idx_user;

SET @idx_conv := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND INDEX_NAME = 'idx_pesquisas_resposta_conv'
);
SET @sql_idx_conv := IF(
    @idx_conv = 0,
    'ALTER TABLE pesquisas_respostas ADD INDEX idx_pesquisas_resposta_conv (formulario_id, convidado_id)',
    'SELECT 1'
);
PREPARE stmt_idx_conv FROM @sql_idx_conv;
EXECUTE stmt_idx_conv;
DEALLOCATE PREPARE stmt_idx_conv;
