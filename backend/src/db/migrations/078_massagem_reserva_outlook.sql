-- Compromisso Outlook vinculado à reserva de massagem (Graph event id)

CREATE TABLE IF NOT EXISTS massagem_reserva_outlook (
  reserva_id INT NOT NULL PRIMARY KEY,
  graph_event_id VARCHAR(512) NOT NULL,
  graph_user_id VARCHAR(255) NOT NULL,
  tenant_id INT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_massagem_reserva_outlook_tenant (tenant_id),
  CONSTRAINT fk_massagem_reserva_outlook_reserva
    FOREIGN KEY (reserva_id) REFERENCES massagem_reservas(id) ON DELETE CASCADE,
  CONSTRAINT fk_massagem_reserva_outlook_tenant
    FOREIGN KEY (tenant_id) REFERENCES azure_tenants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
