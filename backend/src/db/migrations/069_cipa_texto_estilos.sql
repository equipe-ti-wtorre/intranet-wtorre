SET @dbname = DATABASE();

SET @q1 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='cipa_eventos' AND column_name='texto_estilos') = 0,
  'ALTER TABLE cipa_eventos ADD COLUMN texto_estilos JSON NULL AFTER texto_alinhamento',
  'SELECT 1'
);
PREPARE stmt1 FROM @q1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;
