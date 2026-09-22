SET @dbname = DATABASE();

SET @q1 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='cipa_eventos' AND column_name='imagem_altura') = 0,
  'ALTER TABLE cipa_eventos ADD COLUMN imagem_altura SMALLINT NOT NULL DEFAULT 0 AFTER imagem_tamanho',
  'SELECT 1'
);
PREPARE stmt1 FROM @q1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;
