SET @dbname = DATABASE();

SET @q1 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='cipa_eventos' AND column_name='imagem_zoom') = 0,
  'ALTER TABLE cipa_eventos ADD COLUMN imagem_zoom DECIMAL(5,2) NOT NULL DEFAULT 100 AFTER imagem',
  'SELECT 1'
);
PREPARE stmt1 FROM @q1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @q2 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='cipa_eventos' AND column_name='imagem_pos_x') = 0,
  'ALTER TABLE cipa_eventos ADD COLUMN imagem_pos_x DECIMAL(5,2) NOT NULL DEFAULT 50 AFTER imagem_zoom',
  'SELECT 1'
);
PREPARE stmt2 FROM @q2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SET @q3 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='cipa_eventos' AND column_name='imagem_pos_y') = 0,
  'ALTER TABLE cipa_eventos ADD COLUMN imagem_pos_y DECIMAL(5,2) NOT NULL DEFAULT 50 AFTER imagem_pos_x',
  'SELECT 1'
);
PREPARE stmt3 FROM @q3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

SET @q4 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='cipa_eventos' AND column_name='texto_tamanho') = 0,
  'ALTER TABLE cipa_eventos ADD COLUMN texto_tamanho SMALLINT NOT NULL DEFAULT 32 AFTER imagem_pos_y',
  'SELECT 1'
);
PREPARE stmt4 FROM @q4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

SET @q5 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='cipa_eventos' AND column_name='texto_alinhamento') = 0,
  'ALTER TABLE cipa_eventos ADD COLUMN texto_alinhamento VARCHAR(16) NOT NULL DEFAULT ''esquerda'' AFTER texto_tamanho',
  'SELECT 1'
);
PREPARE stmt5 FROM @q5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;
