-- Logo configurável por fonte de eventos (badge na home).
-- Produção (manual, se necessário):
-- ALTER TABLE eventos_fontes ADD COLUMN logo_url VARCHAR(500) NULL AFTER config_json;

SET @dbname = DATABASE();

SET @q1 = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema=@dbname AND table_name='eventos_fontes' AND column_name='logo_url') = 0,
  'ALTER TABLE eventos_fontes ADD COLUMN logo_url VARCHAR(500) NULL AFTER config_json',
  'SELECT 1'
);
PREPARE stmt1 FROM @q1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;
