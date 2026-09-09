-- Renomeia o template padrão de disparo (idempotente: o migrate reexecuta os .sql)
UPDATE massagem_email_templates
SET nome = 'Disparo novo evento'
WHERE codigo = 'disparo_evento' AND nome = 'Disparo de sessão';
