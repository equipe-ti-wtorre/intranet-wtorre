const STATUS_FAMILIA = {
  'Pedido Atendido': 'ok',
  'Aditivo/Contrato Aprovado': 'ok',
  'Requisição Aprovada': 'ok',
  'Pedido Aberto': 'wait',
  'Saldo em aberto': 'wait',
  'Em cotação': 'wait',
  'Mapa em aprovação': 'wait',
  'Mapa Pendente de encerramento': 'wait',
  'Requisição em aprovação do(a) Gestor(a) da area': 'wait',
  'Requisição em Aprovação da Controladoria': 'wait',
  'Aditivo/Contrato em aprovação': 'wait',
  'Requisição Devolvida': 'bad',
  'Requisição Reprovada': 'bad',
  'Pedido Reprovado': 'bad',
  'Aditivo/Contrato Reprovado': 'bad',
  Erro: 'bad',
};

function familiaStatus(statusGeral) {
  return STATUS_FAMILIA[String(statusGeral || '').trim()] || 'info';
}

/** Classifica Solicitação / Contrato / Pedido.
 *  Pedido e Contrato vêm da aba Pedido.Contrato.Aditivo (TipoDocumento).
 *  Sem TipoDocumento = linha da aba Requisição → Solicitação.
 */
function tipoFollowup(tipoDocumento, statusGeral) {
  const tipo = String(tipoDocumento || '')
    .trim()
    .toUpperCase();
  if (tipo.includes('ADITIVO') || tipo.includes('CONTRATO')) return 'contrato';
  if (tipo.includes('PEDIDO')) return 'pedido';
  return 'solicitacao';
}

module.exports = { STATUS_FAMILIA, familiaStatus, tipoFollowup };
