CREATE TABLE IF NOT EXISTS nsc_departamento_gestor (
  id INT AUTO_INCREMENT PRIMARY KEY,
  departamento_ou VARCHAR(200) NOT NULL,
  ad_object_id VARCHAR(64) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_nsc_depto_gestor (departamento_ou, ad_object_id),
  KEY idx_nsc_depto_gestor_ou (departamento_ou),
  KEY idx_nsc_depto_gestor_ad (ad_object_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
