const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isPerguntaIdentidade,
  temPerguntaIdentidade,
  incluirIdentidadeCadastro,
  incluirCobertura,
  formatarDataHora,
  rotuloAnexoValor,
  valorCelula,
  cabecalhoRespostas,
  montarAbaRespostas,
  montarAbaCobertura,
  nomeArquivoExport,
} = require('./pesquisas-export.util');

const perguntaNome = { id: 1, texto: 'Nome', blocoTipo: 'pergunta' };
const perguntaEmail = { id: 2, texto: 'E-mail', blocoTipo: 'pergunta' };
const perguntaCadeiras = { id: 3, texto: 'Cadeiras', blocoTipo: 'pergunta' };
const blocoTexto = { id: 4, texto: 'Leia isto', blocoTipo: 'texto' };
const perguntaAnexo = { id: 5, texto: 'Arquivo', blocoTipo: 'anexo' };

describe('isPerguntaIdentidade', () => {
  it('reconhece CPF, e-mail e RG; Nome sozinho não conta', () => {
    assert.equal(isPerguntaIdentidade('CPF'), true);
    assert.equal(isPerguntaIdentidade('E-mail'), true);
    assert.equal(isPerguntaIdentidade('RG'), true);
    assert.equal(isPerguntaIdentidade('Nome'), false);
    assert.equal(isPerguntaIdentidade('Nome completo'), false);
  });

  it('não trata título parecido como identidade', () => {
    assert.equal(isPerguntaIdentidade('E-mail do gestor'), false);
    assert.equal(isPerguntaIdentidade('CPF do filho'), false);
    assert.equal(isPerguntaIdentidade('Confirma sua identidade?'), false);
  });
});

describe('temPerguntaIdentidade', () => {
  it('ignora bloco de texto e Nome sozinho', () => {
    assert.equal(temPerguntaIdentidade([perguntaNome, perguntaCadeiras, blocoTexto]), false);
    assert.equal(temPerguntaIdentidade([perguntaEmail, perguntaCadeiras]), true);
  });
});

describe('incluirIdentidadeCadastro / cobertura', () => {
  it('interno sem pergunta de identidade inclui cadastro', () => {
    const form = { anonimo: false, publicoAlvo: 'todos' };
    assert.equal(incluirIdentidadeCadastro(form, [perguntaCadeiras]), true);
    assert.equal(incluirCobertura(form), true);
  });

  it('anônimo nunca inclui identidade nem cobertura', () => {
    const form = { anonimo: true, publicoAlvo: 'todos' };
    assert.equal(incluirIdentidadeCadastro(form, [perguntaCadeiras]), false);
    assert.equal(incluirCobertura(form), false);
  });

  it('pergunta de e-mail omite cadastro mas cobertura segue', () => {
    const form = { anonimo: false, publicoAlvo: 'todos' };
    assert.equal(incluirIdentidadeCadastro(form, [perguntaEmail]), false);
    assert.equal(incluirCobertura(form), true);
  });

  it('externo só com gate', () => {
    const comGate = { anonimo: false, publicoAlvo: 'externos', exigirIdentidade: true };
    const semGate = { anonimo: false, publicoAlvo: 'externos', exigirIdentidade: false };
    assert.equal(incluirIdentidadeCadastro(comGate, [perguntaCadeiras]), true);
    assert.equal(incluirCobertura(comGate), true);
    assert.equal(incluirIdentidadeCadastro(semGate, [perguntaCadeiras]), false);
    assert.equal(incluirCobertura(semGate), false);
  });
});

describe('formatarDataHora', () => {
  it('formata em America/Sao_Paulo com segundos', () => {
    assert.equal(formatarDataHora('2026-10-30T15:00:00.000Z'), '30/10/2026 12:00:00');
    assert.equal(formatarDataHora(null), '');
  });
});

describe('rotuloAnexoValor', () => {
  it('junta nomes dos arquivos', () => {
    const json = JSON.stringify([
      { nome: 'a.pdf', container: 'c', blob: 'b1' },
      { nome: 'b.png', container: 'c', blob: 'b2' },
    ]);
    assert.equal(rotuloAnexoValor(json), 'a.pdf; b.png');
  });
});

describe('valorCelula', () => {
  it('anexo usa nome; vazio não vira traço', () => {
    assert.equal(
      valorCelula(perguntaAnexo, JSON.stringify({ nome: 'x.pdf', container: 'c', blob: 'b' })),
      'x.pdf'
    );
    assert.equal(valorCelula(perguntaCadeiras, null), '');
    assert.equal(valorCelula(perguntaCadeiras, ''), '');
  });
});

describe('montarAbaRespostas', () => {
  const formExterno = {
    anonimo: false,
    publicoAlvo: 'externos',
    exigirIdentidade: true,
  };

  it('externo com gate: Data/hora, #, identidade e perguntas; omite bloco de texto', () => {
    const perguntas = [blocoTexto, perguntaCadeiras, perguntaAnexo];
    const header = cabecalhoRespostas(formExterno, perguntas);
    assert.deepEqual(header, ['Data/hora', '#', 'Nome', 'E-mail', 'CPF/CNPJ', 'RG', 'Cadeiras', 'Arquivo']);
    const rows = montarAbaRespostas(formExterno, perguntas, [
      {
        id: 9,
        convidadoId: 3,
        nome: 'Ana',
        email: 'ana@wtorre.com.br',
        cpfMascara: '***.788.**8-01',
        rgMascara: '',
        enviadoEm: '2026-10-30T15:00:00.000Z',
        itens: [{ perguntaId: 3, valor: '2' }],
      },
    ]);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1], [
      '30/10/2026 12:00:00',
      '1',
      'Ana',
      'ana@wtorre.com.br',
      '***.788.**8-01',
      '',
      '2',
      '',
    ]);
  });

  it('anônimo só Data/hora, # e perguntas', () => {
    const form = { anonimo: true, publicoAlvo: 'todos' };
    const header = cabecalhoRespostas(form, [perguntaCadeiras]);
    assert.deepEqual(header, ['Data/hora', '#', 'Cadeiras']);
  });

  it('interno: Nome e E-mail do colaborador', () => {
    const form = { anonimo: false, publicoAlvo: 'departamento' };
    const rows = montarAbaRespostas(form, [perguntaCadeiras], [
      {
        id: 1,
        usuarioId: 44,
        nome: 'João',
        email: 'joao@wtorre.com.br',
        enviadoEm: '2026-10-30T15:00:00.000Z',
        itens: [{ perguntaId: 3, valor: '1' }],
      },
    ]);
    assert.deepEqual(rows[0], ['Data/hora', '#', 'Nome', 'E-mail', 'Cadeiras']);
    assert.equal(rows[1][2], 'João');
    assert.equal(rows[1][3], 'joao@wtorre.com.br');
  });
});

describe('montarAbaCobertura', () => {
  it('externo com gate marca quem respondeu', () => {
    const form = { anonimo: false, publicoAlvo: 'externos', exigirIdentidade: true };
    const aba = montarAbaCobertura(
      form,
      [
        { id: 1, nome: 'Ana', email: 'ana@wtorre.com.br', cpfMascara: '***.001.**1-01', rgMascara: null },
        { id: 2, nome: '', email: 'bob@wtorre.com.br', cpfMascara: '', rgMascara: '' },
      ],
      [
        {
          convidadoId: 1,
          enviadoEm: '2026-10-30T15:00:00.000Z',
        },
      ]
    );
    assert.deepEqual(aba[0], ['Nome', 'E-mail', 'CPF/CNPJ', 'RG', 'Respondido', 'Data/hora']);
    assert.equal(aba[1][4], 'Sim');
    assert.equal(aba[1][5], '30/10/2026 12:00:00');
    assert.equal(aba[2][0], '');
    assert.equal(aba[2][4], 'Não');
    assert.equal(aba[2][5], '');
  });

  it('anônimo e externo sem gate não geram aba', () => {
    assert.equal(montarAbaCobertura({ anonimo: true, publicoAlvo: 'todos' }, [], []), null);
    assert.equal(
      montarAbaCobertura({ anonimo: false, publicoAlvo: 'externos', exigirIdentidade: false }, [], []),
      null
    );
  });
});

describe('nomeArquivoExport', () => {
  it('slug do título', () => {
    assert.equal(nomeArquivoExport('Cópia de teste'), 'Copia-de-teste-respostas.xlsx');
  });
});
