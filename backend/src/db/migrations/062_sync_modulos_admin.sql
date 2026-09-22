INSERT IGNORE INTO modulos_admin (codigo, nome, ordem)
SELECT 'agenda_rh', 'Agenda RH', ordem FROM modulos_admin WHERE codigo = 'cipa';

INSERT IGNORE INTO modulos_admin (codigo, nome, ordem)
VALUES ('agenda_rh', 'Agenda RH', 19);

INSERT IGNORE INTO perfil_modulos (perfil_id, modulo_codigo)
SELECT perfil_id, 'agenda_rh' FROM perfil_modulos WHERE modulo_codigo = 'cipa';

INSERT IGNORE INTO usuario_modulos_extra (usuario_id, modulo_codigo)
SELECT usuario_id, 'agenda_rh' FROM usuario_modulos_extra WHERE modulo_codigo = 'cipa';

DELETE FROM perfil_modulos WHERE modulo_codigo = 'cipa';
DELETE FROM usuario_modulos_extra WHERE modulo_codigo = 'cipa';
DELETE FROM modulos_admin WHERE codigo = 'cipa';

UPDATE menu_items
SET url = '/agenda_rh', label = 'Agenda RH'
WHERE url = '/cipa';

INSERT INTO modulos_admin (codigo, nome, ordem) VALUES
  ('menu', 'Gestão do Menu', 1),
  ('rodape', 'Rodapé', 2),
  ('documentos', 'Documentos', 3),
  ('treinamentos', 'Treinamentos', 4),
  ('containers', 'Containers', 5),
  ('tenants', 'Tenants Azure', 6),
  ('colaboradores', 'Sincronização AD', 7),
  ('configuracoes', 'Configurações', 8),
  ('paginas', 'Páginas', 9),
  ('camarotes', 'Gestão de Camarotes', 10),
  ('solicitacao-colaborador', 'Solicitação de Colaborador', 11),
  ('comunicados', 'Comunicados', 12),
  ('eventos', 'Eventos', 13),
  ('powerbi', 'Power BI', 14),
  ('salas', 'Reservas de Salas', 15),
  ('followup-suprimentos', 'Follow-up de Suprimentos', 16),
  ('rustdesk', 'Rust Desk', 17),
  ('nao-se-cale', 'Não se Cale', 18),
  ('agenda_rh', 'Agenda RH', 19)
ON DUPLICATE KEY UPDATE nome = VALUES(nome), ordem = VALUES(ordem);
