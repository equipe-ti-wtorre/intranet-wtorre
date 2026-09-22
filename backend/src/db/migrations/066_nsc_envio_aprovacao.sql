SET @dbname = DATABASE();

SET @q1 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='nsc_envio' AND column_name='aprovacao') = 0,
  'ALTER TABLE nsc_envio ADD COLUMN aprovacao VARCHAR(20) NOT NULL DEFAULT ''aprovado'' AFTER nome_lido',
  'SELECT 1'
);
PREPARE stmt1 FROM @q1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @q2 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='nsc_envio' AND column_name='motivo_rejeicao') = 0,
  'ALTER TABLE nsc_envio ADD COLUMN motivo_rejeicao VARCHAR(500) NULL AFTER aprovacao',
  'SELECT 1'
);
PREPARE stmt2 FROM @q2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SET @q3 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='nsc_envio' AND column_name='aprovado_por') = 0,
  'ALTER TABLE nsc_envio ADD COLUMN aprovado_por VARCHAR(200) NULL AFTER motivo_rejeicao',
  'SELECT 1'
);
PREPARE stmt3 FROM @q3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

SET @q4 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='nsc_envio' AND column_name='aprovado_em') = 0,
  'ALTER TABLE nsc_envio ADD COLUMN aprovado_em TIMESTAMP NULL AFTER aprovado_por',
  'SELECT 1'
);
PREPARE stmt4 FROM @q4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

SET @q5 = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=@dbname AND table_name='nsc_envio' AND index_name='idx_nsc_envio_aprovacao') = 0,
  'ALTER TABLE nsc_envio ADD KEY idx_nsc_envio_aprovacao (aprovacao, enviado_em)',
  'SELECT 1'
);
PREPARE stmt5 FROM @q5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;
