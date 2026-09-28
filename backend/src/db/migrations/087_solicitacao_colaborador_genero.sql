-- Genero (opcional) do novo colaborador - usado so para flexionar corretamente o texto
-- do cartao de boas-vindas gerado automaticamente (ex.: "bem-vindo"/"bem-vinda"). Quando
-- nao informado, a geracao automatica cai para redacao neutra ("bem-vindo(a)").
-- Idempotente: o migrate reexecuta os .sql.

SET @col_genero := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'solicitacoes_colaborador' AND COLUMN_NAME = 'genero'
);
SET @sql_genero := IF(
  @col_genero = 0,
  'ALTER TABLE solicitacoes_colaborador ADD COLUMN genero ENUM(''M'',''F'') NULL AFTER sobrenome',
  'SELECT 1'
);
PREPARE stmt_genero FROM @sql_genero;
EXECUTE stmt_genero;
DEALLOCATE PREPARE stmt_genero;
