SET @dbname = DATABASE();

SET @q1 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='cipa_eventos' AND column_name='imagem_tamanho') = 0,
  'ALTER TABLE cipa_eventos ADD COLUMN imagem_tamanho DECIMAL(5,2) NOT NULL DEFAULT 100 AFTER imagem_zoom',
  'SELECT 1'
);
PREPARE stmt1 FROM @q1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;
