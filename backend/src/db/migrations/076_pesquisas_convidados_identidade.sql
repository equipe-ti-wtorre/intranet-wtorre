-- Índices para o portal do convidado (busca por identidade em todos os eventos)
-- Idempotente: o migrate reexecuta os .sql

SET @idx_hash := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_convidados'
    AND INDEX_NAME = 'idx_pesquisas_conv_cpf_hash'
);
SET @sql_idx_hash := IF(
    @idx_hash = 0,
    'ALTER TABLE pesquisas_convidados ADD KEY idx_pesquisas_conv_cpf_hash (cpf_hash)',
    'SELECT 1'
);
PREPARE stmt_idx_hash FROM @sql_idx_hash;
EXECUTE stmt_idx_hash;
DEALLOCATE PREPARE stmt_idx_hash;

SET @idx_email := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_convidados'
    AND INDEX_NAME = 'idx_pesquisas_conv_email'
);
SET @sql_idx_email := IF(
    @idx_email = 0,
    'ALTER TABLE pesquisas_convidados ADD KEY idx_pesquisas_conv_email (email)',
    'SELECT 1'
);
PREPARE stmt_idx_email FROM @sql_idx_email;
EXECUTE stmt_idx_email;
DEALLOCATE PREPARE stmt_idx_email;
