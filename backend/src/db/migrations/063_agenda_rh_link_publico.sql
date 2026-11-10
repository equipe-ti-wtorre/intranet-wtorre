-- Link público da Agenda RH. Idempotente: o migrate reexecuta os .sql.
SET @dbname = DATABASE();

SET @q = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='cipa_eventos' AND column_name='link_publico') = 0,
  'ALTER TABLE cipa_eventos ADD COLUMN link_publico TINYINT(1) NOT NULL DEFAULT 0 AFTER oculto_lista',
  'SELECT 1'
);
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;
