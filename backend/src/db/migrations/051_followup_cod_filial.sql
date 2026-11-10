-- CodFilial na solicitação + chave natural (n_requisicao, cod_filial)
SET @dbname = DATABASE();

SET @q1 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='followup_solicitacoes' AND column_name='cod_filial') = 0,
  'ALTER TABLE followup_solicitacoes ADD COLUMN cod_filial VARCHAR(40) NOT NULL DEFAULT \'\' AFTER nome_filial',
  'SELECT 1'
);
PREPARE stmt1 FROM @q1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @q2 = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=@dbname AND table_name='followup_solicitacoes' AND index_name='uk_followup_n_requisicao') > 0,
  'ALTER TABLE followup_solicitacoes DROP INDEX uk_followup_n_requisicao',
  'SELECT 1'
);
PREPARE stmt2 FROM @q2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- A 055 troca esta chave pela uk_followup_rm_filial_tipo_pc. No reexecute do migrate
-- a chave antiga já não existe e há RM+filial repetidos; não recriar se a nova já está lá.
SET @q3 = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=@dbname AND table_name='followup_solicitacoes' AND index_name='uk_followup_rm_filial') = 0
  AND (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=@dbname AND table_name='followup_solicitacoes' AND index_name='uk_followup_rm_filial_tipo_pc') = 0,
  'ALTER TABLE followup_solicitacoes ADD UNIQUE KEY uk_followup_rm_filial (n_requisicao, cod_filial)',
  'SELECT 1'
);
PREPARE stmt3 FROM @q3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

SET @q4 = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=@dbname AND table_name='followup_solicitacoes' AND index_name='idx_followup_cod_filial') = 0,
  'ALTER TABLE followup_solicitacoes ADD KEY idx_followup_cod_filial (cod_filial)',
  'SELECT 1'
);
PREPARE stmt4 FROM @q4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;
