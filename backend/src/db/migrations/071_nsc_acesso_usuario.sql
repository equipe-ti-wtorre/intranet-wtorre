CREATE TABLE IF NOT EXISTS nsc_acesso_usuario (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ad_object_id VARCHAR(64) NOT NULL,
  nome VARCHAR(200) NULL,
  email VARCHAR(200) NULL,
  perfil VARCHAR(20) NOT NULL,
  departamentos_json TEXT NULL,
  empresas_json TEXT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_nsc_acesso_usuario_ad (ad_object_id),
  KEY idx_nsc_acesso_usuario_perfil (perfil)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
