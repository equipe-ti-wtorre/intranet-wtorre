-- Pausas nomeadas e janela de horários do evento (idempotente: o migrate reexecuta os .sql)

SET @col_pausas := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_eventos'
    AND COLUMN_NAME = 'pausas'
);
SET @sql_pausas := IF(
    @col_pausas = 0,
    'ALTER TABLE massagem_eventos ADD COLUMN pausas JSON NULL',
    'SELECT 1'
);
PREPARE stmt_pausas FROM @sql_pausas;
EXECUTE stmt_pausas;
DEALLOCATE PREPARE stmt_pausas;

SET @col_ini := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_eventos'
    AND COLUMN_NAME = 'horario_inicio'
);
SET @sql_ini := IF(
    @col_ini = 0,
    'ALTER TABLE massagem_eventos ADD COLUMN horario_inicio VARCHAR(5) NULL',
    'SELECT 1'
);
PREPARE stmt_ini FROM @sql_ini;
EXECUTE stmt_ini;
DEALLOCATE PREPARE stmt_ini;

SET @col_fim := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_eventos'
    AND COLUMN_NAME = 'horario_fim'
);
SET @sql_fim := IF(
    @col_fim = 0,
    'ALTER TABLE massagem_eventos ADD COLUMN horario_fim VARCHAR(5) NULL',
    'SELECT 1'
);
PREPARE stmt_fim FROM @sql_fim;
EXECUTE stmt_fim;
DEALLOCATE PREPARE stmt_fim;
