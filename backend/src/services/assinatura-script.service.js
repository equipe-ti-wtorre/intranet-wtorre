const fs = require('fs');
const path = require('path');
const { env } = require('../config/env');
const { isDominioMapeado, isEmailPermitido } = require('../utils/assinatura-domains');
const configService = require('./assinatura-config.service');

function isLoopbackBase(url) {
  try {
    const parsed = new URL(String(url || ''));
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return true;
  }
}

function resolverBasePublica(publicBaseUrl) {
  const candidata = String(publicBaseUrl || '').replace(/\/+$/, '');
  if (candidata && !isLoopbackBase(candidata)) return candidata;
  if (env.publicAppUrl && !isLoopbackBase(env.publicAppUrl)) return env.publicAppUrl;
  return 'https://intranet.nubankparque.com';
}

const TEMPLATE_PATH = path.join(
  __dirname,
  '..',
  'templates',
  'instalar-assinaturas-base.ps1.template'
);

function validarAssinaturas(assinaturas) {
  if (!Array.isArray(assinaturas) || assinaturas.length === 0) {
    throw new Error('Informe ao menos uma assinatura.');
  }

  for (const sig of assinaturas) {
    if (!sig?.email || typeof sig.email !== 'string') {
      throw new Error('Cada assinatura deve ter um e-mail válido.');
    }
    if (!isEmailPermitido(sig.email)) {
      throw new Error(`E-mail não permitido para assinatura: ${sig.email}`);
    }
    const tipo = sig.tipo === 'compartilhada' ? 'compartilhada' : 'pessoal';
    if (!isDominioMapeado(sig.email)) {
      throw new Error(`Domínio não mapeado para o e-mail: ${sig.email}`);
    }
    if (tipo === 'pessoal' && !sig.nome?.trim()) {
      throw new Error(`Nome obrigatório para assinatura pessoal: ${sig.email}`);
    }
  }
}

function caminhoTemplateBase() {
  return TEMPLATE_PATH;
}

function lerTemplateBaseBytes() {
  const raw = fs.readFileSync(TEMPLATE_PATH);
  const hasBom = raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
  if (hasBom) return raw;
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), raw]);
}

function lerTemplateBase() {
  return lerTemplateBaseBytes().toString('utf8');
}

function embutirBase64(label, bytes) {
  const b64 = Buffer.from(bytes).toString('base64');
  const linhas = b64.match(/.{1,76}/g) || [];
  return linhas.map((linha) => `::${label}::${linha}`).join('\r\n');
}

function validarEmailPadrao(assinaturas, emailPadrao) {
  if (!emailPadrao || typeof emailPadrao !== 'string') {
    throw new Error('Selecione a assinatura padrao do Outlook.');
  }
  const alvo = emailPadrao.trim().toLowerCase();
  const ok = assinaturas.some((sig) => sig.email?.trim().toLowerCase() === alvo);
  if (!ok) {
    throw new Error('A assinatura padrao deve estar entre as selecionadas.');
  }
}

function gerarLauncher(assinaturas, emailPadrao, publicBaseUrl) {
  validarAssinaturas(assinaturas);
  validarEmailPadrao(assinaturas, emailPadrao);

  const email = emailPadrao.trim().toLowerCase();
  const token = configService.create(assinaturas, email);
  const configUrl = `${resolverBasePublica(publicBaseUrl)}/api/v1/assinaturas/config/${token}`;
  const payload = configService.toResponsePayload({
    assinaturas,
    emailPadrao: email,
  });
  const scriptEmbutido = embutirBase64('B64', lerTemplateBaseBytes());
  const configEmbutida = embutirBase64('CFG', Buffer.from(JSON.stringify(payload), 'utf8'));

  // PS1 e JSON embutidos em base64 para o instalador funcionar sem callback HTTP
  return `@echo off
chcp 65001 >nul
setlocal
set "CONFIG_URL=${configUrl}"
echo.
echo  Instalador de Assinaturas
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$src='%~f0'; $utf8=New-Object System.Text.UTF8Encoding $true; $ps1=Join-Path $env:TEMP 'Instalar-Assinaturas.ps1'; $cfg=Join-Path $env:TEMP 'Instalar-Assinaturas.json'; $b64=(Select-String -LiteralPath $src -Pattern '^::B64::(.*)$' | ForEach-Object { $_.Matches.Groups[1].Value }) -join ''; $cfgB64=(Select-String -LiteralPath $src -Pattern '^::CFG::(.*)$' | ForEach-Object { $_.Matches.Groups[1].Value }) -join ''; [IO.File]::WriteAllText($ps1, $utf8.GetString([Convert]::FromBase64String($b64)).TrimStart([char]0xFEFF), $utf8); if ($cfgB64) { [IO.File]::WriteAllText($cfg, $utf8.GetString([Convert]::FromBase64String($cfgB64)), $utf8) }; & $ps1 -ConfigUrl $env:CONFIG_URL -ConfigJsonPath $cfg"
if errorlevel 1 (
  echo.
  echo  ERRO na instalacao. Verifique sua conexao e tente novamente.
  pause
  exit /b 1
)
echo.
pause
goto :eof
${scriptEmbutido}
${configEmbutida}
`;
}

module.exports = {
  gerarLauncher,
  caminhoTemplateBase,
  lerTemplateBase,
  validarAssinaturas,
};
