-- RG como identificação do convidado (além de CPF/CNPJ e e-mail).
-- Idempotente: o migrate reexecuta os .sql.

SET @col_rg_hash := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_convidados' AND COLUMN_NAME = 'rg_hash'
);
SET @sql_rg_hash := IF(
  @col_rg_hash = 0,
  'ALTER TABLE pesquisas_convidados ADD COLUMN rg_hash CHAR(64) NULL',
  'SELECT 1'
);
PREPARE stmt_rg_hash FROM @sql_rg_hash;
EXECUTE stmt_rg_hash;
DEALLOCATE PREPARE stmt_rg_hash;

SET @col_rg_mask := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_convidados' AND COLUMN_NAME = 'rg_mascara'
);
SET @sql_rg_mask := IF(
  @col_rg_mask = 0,
  'ALTER TABLE pesquisas_convidados ADD COLUMN rg_mascara VARCHAR(24) NULL',
  'SELECT 1'
);
PREPARE stmt_rg_mask FROM @sql_rg_mask;
EXECUTE stmt_rg_mask;
DEALLOCATE PREPARE stmt_rg_mask;

SET @idx_rg := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_convidados'
    AND INDEX_NAME = 'idx_pesquisas_conv_rg_hash'
);
SET @sql_idx_rg := IF(
  @idx_rg = 0,
  'ALTER TABLE pesquisas_convidados ADD KEY idx_pesquisas_conv_rg_hash (rg_hash)',
  'SELECT 1'
);
PREPARE stmt_idx_rg FROM @sql_idx_rg;
EXECUTE stmt_idx_rg;
DEALLOCATE PREPARE stmt_idx_rg;

SET @col_chave_rg := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formulario_base' AND COLUMN_NAME = 'chave_rg'
);
SET @sql_chave_rg := IF(
  @col_chave_rg = 0,
  'ALTER TABLE pesquisas_formulario_base ADD COLUMN chave_rg CHAR(64) NULL',
  'SELECT 1'
);
PREPARE stmt_chave_rg FROM @sql_chave_rg;
EXECUTE stmt_chave_rg;
DEALLOCATE PREPARE stmt_chave_rg;

SET @idx_base_rg := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_formulario_base'
    AND INDEX_NAME = 'idx_pesquisas_base_rg'
);
SET @sql_idx_base_rg := IF(
  @idx_base_rg = 0,
  'ALTER TABLE pesquisas_formulario_base ADD KEY idx_pesquisas_base_rg (formulario_id, chave_rg)',
  'SELECT 1'
);
PREPARE stmt_idx_base_rg FROM @sql_idx_base_rg;
EXECUTE stmt_idx_base_rg;
DEALLOCATE PREPARE stmt_idx_base_rg;
