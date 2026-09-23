const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  temMarcadoresOficiais,
  extractNome,
  extractDataEmissao,
  nomeConfere,
  validarTextoCertificado,
} = require('./nsc-certificado-texto.util');

const MODELO = `
CERTIFICADO
Certificamos que, Daniel Lemes, concluiu o
Curso de Capacitação do Protocolo "Não se Cale", com a carga horária de 15h,
promovido pelo Governo do Estado de São Paulo, destinado a combater a violência
contra a mulher nos estabelecimentos regulamentados pelas Leis nº 17.621 e 17.635, de 2023.
UNIVESP PROCON SP Secretaria da Mulher
Data de emissão: 9/05/2025 16:46
`;

describe('nsc-certificado-texto', () => {
  it('reconhece o modelo oficial', () => {
    assert.equal(temMarcadoresOficiais(MODELO), true);
    assert.equal(temMarcadoresOficiais('apenas um pdf qualquer'), false);
    assert.equal(
      temMarcadoresOficiais(
        'Certificamos que Ana concluiu o Protocolo Não se Cale leis 17.621 Univesp'
      ),
      true
    );
  });

  it('limpa pontuação residual do OCR no nome', () => {
    const ocr = `
      Certificamos que, Daniel Lemes ; concluiu o
      Curso de Capacitação do Protocolo "Não se Cale"
      Leis nº 17.621 Univesp
      Data de emissão: 9/05/2025 16:46
    `;
    assert.equal(extractNome(ocr), 'Daniel Lemes');
    assert.equal(temMarcadoresOficiais(ocr), true);
  });

  it('lê o nome e a data do modelo', () => {
    assert.equal(extractNome(MODELO), 'Daniel Lemes');
    assert.equal(extractDataEmissao(MODELO), '2025-05-09');
  });

  it('lê nome entre underscores e data colada pelo OCR', () => {
    const ocr = `
      CERTIFICADO Certificamos que,__________Danieliel Lemes__________,concluiu o
      Protocolo Nao se Calee Leis 17621 UNIVESP
      Data de emissão: 9/05/20252516:46
    `;
    assert.equal(extractNome(ocr), 'Danieliel Lemes');
    assert.equal(extractDataEmissao(ocr), '2025-05-09');
  });

  it('só confere se o certificado tiver todos os nomes do AD', () => {
    assert.equal(nomeConfere('Dani Lemes', 'Daniel Favareto Lemes'), false);
    assert.equal(nomeConfere('Daniel Lemes', 'Daniel Favareto Lemes'), false);
    assert.equal(nomeConfere('Daniel Favareto Lemes', 'Daniel Favareto Lemes'), true);
    assert.equal(nomeConfere('Daniel Favareto Lemes da Silva', 'Daniel Favareto Lemes'), true);
    assert.equal(nomeConfere('João Costa', 'Daniel Lemes'), false);
  });

  it('lê nome e data do PDF TCPDF (texto separado da arte)', () => {
    const tcpdf = `
      Daniel Lemes  Data de emissão:  9/05/2025 16:46  Powered by TCPDF
      Certificamos que, , concluiu o Curso de Capacitação do Protocolo "Não se Cale"
      Leis nº 17.621 e 17.635 UNIVESP
    `;
    assert.equal(extractNome(tcpdf), 'Daniel Lemes');
    assert.equal(extractDataEmissao(tcpdf), '2025-05-09');
    assert.equal(temMarcadoresOficiais(tcpdf), true);
  });

  it('lê data por extenso, com espaços e sem rótulo', () => {
    const oficial = `
      CERTIFICADO Certificamos que Ana Silva concluiu o Protocolo Não se Cale
      Leis 17.621 UNIVESP
    `;
    assert.equal(extractDataEmissao(`${oficial}\nEmitido em 9 de maio de 2025`), '2025-05-09');
    assert.equal(extractDataEmissao(`${oficial}\nData de emlssao: 9 / 05 / 2025 16:46`), '2025-05-09');
    assert.equal(extractDataEmissao(`${oficial}\nConclusão em 09.05.2025`), '2025-05-09');
    assert.equal(extractDataEmissao(`${oficial}\n9 05 2025`), '2025-05-09');
    assert.equal(extractDataEmissao(`${oficial}\n9 mai 2025`), '2025-05-09');
    assert.equal(extractDataEmissao(`${oficial}\n09/05/25`), '2025-05-09');
  });

  it('valida o texto completo e sinaliza nome divergente', () => {
    const ok = validarTextoCertificado(MODELO, 'Daniel Lemes', { hojeIso: '2026-09-14' });
    assert.equal(ok.ok, true);
    assert.equal(ok.nome_confere, true);
    assert.equal(ok.data_emissao, '2025-05-09');

    const parcial = validarTextoCertificado(MODELO, 'Daniel Favareto Lemes', { hojeIso: '2026-09-14' });
    assert.equal(parcial.ok, true);
    assert.equal(parcial.nome_confere, false);

    const outro = validarTextoCertificado(MODELO, 'Maria Souza', { hojeIso: '2026-09-14' });
    assert.equal(outro.ok, false);
    assert.match(outro.erro, /não coincide/);
  });

  it('lê o nome no PDF impresso (Print to PDF) com slot vazio', () => {
    const impresso = `
      Mauricio Stade Izidoro Microsoft: Print To PDF Custom Certificado
      Certificamos que, , concluiu o Curso de Capacitação do Protocolo "Não se Cale",
      com a carga horária de 15h, promovido pelo Governo do Estado de São Paulo,
      destinado a combater a violência contra a mulher nos estabelecimentos
      regulamentados pelas Leis nº 17.621 e 17.635, de 2023.
      UNIVESP PROCON SP Secretaria da Mulher
    `;
    assert.equal(extractNome(impresso), 'Mauricio Stade Izidoro');
    assert.equal(extractNome(impresso, 'Mauricio Stade Izidoro'), 'Mauricio Stade Izidoro');
    const r = validarTextoCertificado(impresso, 'Mauricio Stade Izidoro');
    assert.equal(r.nome, 'Mauricio Stade Izidoro');
    assert.equal(r.nome_confere, true);
    assert.match(r.erro, /data de emissão/);
  });

  it('ignora lixo binário do PDF e fica só com o nome', () => {
    const sujo = `
      IrqMXElýh Át/ED ü çñ i à8 Îë ÕGåH . =ü Mauricio Stade Izidoro Microsoft: Print To PDF
      Certificamos que, , concluiu o Curso de Capacitação do Protocolo "Não se Cale"
      Leis nº 17.621 e 17.635 UNIVESP
    `;
    assert.equal(extractNome(sujo), 'Mauricio Stade Izidoro');
  });

  it('devolve o nome quando só a data de emissão falta', () => {
    const semData = `
      CERTIFICADO
      Certificamos que, Jaine Almeida de Carvalho, concluiu o
      Curso de Capacitação do Protocolo "Não se Cale"
      Leis nº 17.621 e 17.635 UNIVESP
    `;
    const r = validarTextoCertificado(semData, 'Jaine Almeida de Carvalho');
    assert.equal(r.ok, false);
    assert.equal(r.nome, 'Jaine Almeida de Carvalho');
    assert.equal(r.nome_confere, true);
    assert.match(r.erro, /data de emissão/);
  });
});
