-- Rótulo editável do tipo/prefixo (ex.: OUTRO) na home.
-- Produção (manual, se necessário):
-- ALTER TABLE eventos_fontes ADD COLUMN rotulo VARCHAR(60) NULL AFTER logo_url;

SET @dbname = DATABASE();

SET @q1 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='eventos_fontes' AND column_name='rotulo') = 0,
  'ALTER TABLE eventos_fontes ADD COLUMN rotulo VARCHAR(60) NULL AFTER logo_url',
  'SELECT 1'
);
PREPARE stmt1 FROM @q1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;
