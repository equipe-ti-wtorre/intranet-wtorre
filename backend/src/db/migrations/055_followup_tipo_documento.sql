-- TipoDocumento na solicitação + chave natural inclui tipo e nº pedido/contrato
SET @dbname = DATABASE();

SET @q1 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='followup_solicitacoes' AND column_name='tipo_documento') = 0,
  'ALTER TABLE followup_solicitacoes ADD COLUMN tipo_documento VARCHAR(80) NULL AFTER status_geral',
  'SELECT 1'
);
PREPARE stmt1 FROM @q1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @q2 = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=@dbname AND table_name='followup_solicitacoes' AND index_name='uk_followup_rm_filial') > 0,
  'ALTER TABLE followup_solicitacoes DROP INDEX uk_followup_rm_filial',
  'SELECT 1'
);
PREPARE stmt2 FROM @q2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SET @q3 = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=@dbname AND table_name='followup_solicitacoes' AND index_name='uk_followup_rm_filial_tipo_pc') = 0,
  'ALTER TABLE followup_solicitacoes ADD UNIQUE KEY uk_followup_rm_filial_tipo_pc (n_requisicao, cod_filial, tipo_documento, pedido_contrato)',
  'SELECT 1'
);
PREPARE stmt3 FROM @q3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

SET @q4 = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=@dbname AND table_name='followup_solicitacoes' AND index_name='idx_followup_tipo_documento') = 0,
  'ALTER TABLE followup_solicitacoes ADD KEY idx_followup_tipo_documento (tipo_documento)',
  'SELECT 1'
);
PREPARE stmt4 FROM @q4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

SET @q5 = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema=@dbname AND table_name='followup_solicitacoes' AND index_name='idx_followup_pedido_contrato') = 0,
  'ALTER TABLE followup_solicitacoes ADD KEY idx_followup_pedido_contrato (pedido_contrato)',
  'SELECT 1'
);
PREPARE stmt5 FROM @q5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;
