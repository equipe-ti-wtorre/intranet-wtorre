-- Código público do evento CIPA. Idempotente: o migrate reexecuta os .sql.
SET @dbname = DATABASE();

SET @q1 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='cipa_eventos' AND column_name='codigo') = 0,
  'ALTER TABLE cipa_eventos ADD COLUMN codigo VARCHAR(24) NULL AFTER id',
  'SELECT 1'
);
PREPARE stmt1 FROM @q1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

UPDATE cipa_eventos
SET codigo = LOWER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 24))
WHERE codigo IS NULL OR codigo = '';

SET @q2 = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=@dbname AND table_name='cipa_eventos' AND index_name='uk_cipa_eventos_codigo') = 0,
  'ALTER TABLE cipa_eventos MODIFY codigo VARCHAR(24) NOT NULL, ADD UNIQUE KEY uk_cipa_eventos_codigo (codigo)',
  'SELECT 1'
);
PREPARE stmt2 FROM @q2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
