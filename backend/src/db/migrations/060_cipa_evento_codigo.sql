ALTER TABLE cipa_eventos
  ADD COLUMN codigo VARCHAR(24) NULL AFTER id;

UPDATE cipa_eventos
SET codigo = LOWER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 24))
WHERE codigo IS NULL OR codigo = '';

ALTER TABLE cipa_eventos
  MODIFY codigo VARCHAR(24) NOT NULL,
  ADD UNIQUE KEY uk_cipa_eventos_codigo (codigo);
