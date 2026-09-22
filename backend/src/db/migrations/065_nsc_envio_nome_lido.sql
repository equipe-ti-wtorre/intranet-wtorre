SET @dbname = DATABASE();

SET @q1 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='nsc_envio' AND column_name='nome_lido') = 0,
  'ALTER TABLE nsc_envio ADD COLUMN nome_lido VARCHAR(255) NULL AFTER validade',
  'SELECT 1'
);
PREPARE stmt1 FROM @q1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;
