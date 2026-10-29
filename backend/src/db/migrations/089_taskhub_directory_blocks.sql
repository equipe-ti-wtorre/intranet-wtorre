-- Contas do AD que o administrador desativou ou excluiu.
-- A sincronização não recria nem reativa esses identificadores.

CREATE TABLE IF NOT EXISTS th_directory_blocks (
  entra_oid VARCHAR(64) NOT NULL PRIMARY KEY,
  motivo VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
