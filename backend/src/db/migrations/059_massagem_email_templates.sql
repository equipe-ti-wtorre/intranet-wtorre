-- Templates de e-mail do módulo Massagem / Bem-estar

CREATE TABLE IF NOT EXISTS massagem_email_templates (
  id CHAR(36) PRIMARY KEY,
  codigo VARCHAR(40) NOT NULL,
  nome VARCHAR(120) NOT NULL,
  assunto VARCHAR(255) NOT NULL,
  html MEDIUMTEXT NOT NULL,
  texto TEXT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_massagem_email_templates_codigo (codigo),
  KEY idx_massagem_email_templates_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO massagem_email_templates (id, codigo, nome, assunto, html, texto, ativo)
SELECT s.id, s.codigo, s.nome, s.assunto, s.html, s.texto, s.ativo
FROM (
  SELECT
    'a1000001-0000-4000-8000-000000000001' AS id,
    'disparo_evento' AS codigo,
    'Disparo novo evento' AS nome,
    'Sessão de massagem disponível — reserve sua vaga' AS assunto,
    '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111827;background:#F7FAF8;padding:24px;"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:24px;"><div style="color:#1d54e6;font-weight:700;font-size:18px;margin-bottom:16px;">Bem-estar · Massagem</div><p>Olá!</p><p>Uma nova sessão de massagem está disponível:</p><p><strong>{{evento_nm}}</strong><br/>Data: {{data}}<br/>Local: {{local}}<br/>Massoterapeuta: {{masso}}</p><p><a href="{{url}}" style="display:inline-block;background:#1d54e6;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Reservar horário</a></p></div></body></html>' AS html,
    'Sessão disponível: {{evento_nm}} em {{data}}. Reserve: {{url}}' AS texto,
    1 AS ativo
  UNION ALL
  SELECT
    'a1000001-0000-4000-8000-000000000002',
    'reserva_confirmada',
    'Reserva confirmada',
    'Reserva confirmada — {{data}} às {{hora}}',
    '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111827;background:#F7FAF8;padding:24px;"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:24px;"><div style="color:#1d54e6;font-weight:700;font-size:18px;margin-bottom:16px;">Bem-estar · Massagem</div><p>Sua reserva foi confirmada.</p><p><strong>{{evento_nm}}</strong><br/>{{data}} às {{hora}}<br/>{{local}}</p></div></body></html>',
    'Reserva confirmada: {{data}} às {{hora}}',
    1
  UNION ALL
  SELECT
    'a1000001-0000-4000-8000-000000000003',
    'cancelamento',
    'Cancelamento de reserva',
    'Reserva cancelada',
    '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111827;background:#F7FAF8;padding:24px;"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:24px;"><div style="color:#1d54e6;font-weight:700;font-size:18px;margin-bottom:16px;">Bem-estar · Massagem</div><p>Sua reserva em <strong>{{data}}</strong> às <strong>{{hora}}</strong> foi cancelada.</p></div></body></html>',
    'Reserva cancelada: {{data}} às {{hora}}',
    1
  UNION ALL
  SELECT
    'a1000001-0000-4000-8000-000000000004',
    'fila_vaga',
    'Vaga na fila',
    'Vaga disponível — reserve agora',
    '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111827;background:#F7FAF8;padding:24px;"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:24px;"><div style="color:#1d54e6;font-weight:700;font-size:18px;margin-bottom:16px;">Bem-estar · Massagem</div><p>Uma vaga abriu na sessão de massagem.</p><p>Horário liberado: <strong>{{data}} às {{hora}}</strong></p><p>Todos na fila receberam este alerta. <strong>Quem reservar o horário primeiro garante a sessão.</strong></p><p><a href="{{url}}" style="display:inline-block;background:#1d54e6;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Ver horários e reservar</a></p></div></body></html>',
    'Vaga disponível {{data}} às {{hora}}. Reserve: {{url}}',
    1
  UNION ALL
  SELECT
    'a1000001-0000-4000-8000-000000000005',
    'falta_admin',
    'Falta registrada (admin)',
    'Falta registrada — {{nome}} não compareceu',
    '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111827;background:#F7FAF8;padding:24px;"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:24px;"><div style="color:#1d54e6;font-weight:700;font-size:18px;margin-bottom:16px;">Bem-estar · Massagem</div><p>Falta registrada no tablet.</p><p><strong>{{nome}}</strong> não compareceu em {{data}} às {{hora}}.</p><p>{{fila_texto}}</p></div></body></html>',
    'Falta: {{nome}} em {{data}} às {{hora}}. {{fila_texto}}',
    1
  UNION ALL
  SELECT
    'a1000001-0000-4000-8000-000000000006',
    'lembrete',
    'Lembrete 1 hora',
    'Lembrete: sua massagem é daqui a 1 hora',
    '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111827;background:#F7FAF8;padding:24px;"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:24px;"><div style="color:#1d54e6;font-weight:700;font-size:18px;margin-bottom:16px;">Bem-estar · Massagem</div><p>Lembrete: sua sessão de massagem é em aproximadamente 1 hora.</p><p><strong>{{evento_nm}}</strong><br/>{{data}} às {{hora}}<br/>{{local}}</p></div></body></html>',
    'Lembrete massagem: {{data}} às {{hora}}',
    1
) s
WHERE NOT EXISTS (
  SELECT 1 FROM massagem_email_templates t WHERE t.codigo = s.codigo
);
