ALTER TABLE cipa_eventos
  ADD COLUMN link_publico TINYINT(1) NOT NULL DEFAULT 0 AFTER oculto_lista;
