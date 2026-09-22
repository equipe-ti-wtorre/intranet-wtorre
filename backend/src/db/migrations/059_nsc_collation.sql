-- Alinha as tabelas NSC à collation do restante do banco (utf8mb4_general_ci).
-- Sem isso, JOIN com colaboradores.ad_id / departamento falha:
-- Illegal mix of collations (utf8mb4_0900_ai_ci vs utf8mb4_general_ci).
ALTER TABLE nsc_envio CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE nsc_certificacao CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE nsc_regra_departamento CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE nsc_config CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE nsc_notificacao_log CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
