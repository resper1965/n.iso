import { describe, it, expect } from 'vitest';
import JSZip from 'jszip'; // vem como dependência do docx; só para ler o zip aqui
import { renderizarDocx } from '../src/services/documento-docx';
import { montarConteudo, type DadosDocumento } from '../src/services/documento-proposta';
import { precoPadrao, type ConfigOrg } from '../src/services/organizacao';
import { calcularItem, totais } from '../src/services/preco-proposta';
import type { Servico } from '../src/schemas/domain';

const preco = precoPadrao();
const base = { id: 's', orgId: 'org_ness', ativo: true, norma: '', descricao: '', premissas: [], exclusoes: [] };
const projeto = {
  ...base, nome: 'Implementação ISO 27001', norma: 'ISO/IEC 27001', tipo: 'projeto',
  diasPorFaixa: { '1': 60, '2': 90, '3': 140 },
  fases: [
    { nome: 'Diagnóstico e escopo', objetivo: 'Fechar o escopo.', atividades: 'Entrevistas.', entregaveis: 'Declaração.', criterioAceite: 'Escopo aprovado.', pct: 40, semanas: 2 },
    { nome: 'Implementação', objetivo: 'Operar.', atividades: 'Procedimentos.', entregaveis: 'Evidências.', criterioAceite: 'Controles ok.', pct: 60, semanas: 6 },
  ],
} as unknown as Servico;

const org: ConfigOrg = {
  id: 'org_ness', nome: 'ness.', cnpj: null, corDestaque: '#00ade8', seloNiso: true,
  prefixoProposta: 'NESS', proximoNumero: 1, preco, secoesDesligadas: [],
  textos: { sobre: 'A {org} é uma consultoria.', comoTrabalhamos: '- Evidência desde o primeiro dia.', equipe: '', termos: '## Obrigações\n\n- Executar os serviços.', premissas: '- A direção participa.', pagamentoPadrao: '40/30/30' },
};

function conteudo(editadas: Record<string, string> = {}, cliente = 'Empresa Exemplo Ltda.') {
  const itens = [{ servico: projeto, calc: calcularItem(projeto, {}, preco, '2', 120), textoCliente: '' }];
  const d: DadosDocumento = {
    org, numero: 'NESS-2026-014', revisao: 2, emitidaEm: '2026-10-02', validaAte: '2026-11-01',
    cliente: { nome: cliente, cnpj: '00.000.000/0001-00', pessoas: 120 },
    textos: { contexto: 'A empresa quer certificar.', escopo: 'Plataforma SaaS.', observacoes: '' },
    itens, totais: totais(itens.map((i) => i.calc)), pagamento: '40/30/30', diagnostico: null,
  };
  return montarConteudo(d, editadas);
}
const RODAPE = 'Cópia de trabalho. Vale a versão NESS-2026-014 rev. 2 do n.iso, hash abcd1234.';
async function xml(c = conteudo()) {
  const bytes = await renderizarDocx(c, RODAPE);
  const zip = await JSZip.loadAsync(bytes);
  return { bytes, doc: await zip.file('word/document.xml')!.async('string') };
}

describe('renderizarDocx', () => {
  it('devolve um zip', async () => {
    const { bytes } = await xml();
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
  });
  it('tem o título de cada seção, o investimento com o total e o rodapé', async () => {
    const c = conteudo();
    const { doc } = await xml(c);
    for (const s of c.secoes) expect(doc).toContain(s.titulo.replace(/&/g, '&amp;'));
    expect(doc).toContain('Total do projeto');
    expect(doc).toContain(c.capa.investimento);
    expect(doc).toContain(RODAPE);
  });
  it('traz o texto de uma seção editada', async () => {
    const { doc } = await xml(conteudo({ sobre: 'Texto reescrito pela consultoria.' }));
    expect(doc).toContain('Texto reescrito pela consultoria.');
  });
  it('caractere de controle não corrompe o Word', async () => {
    const bytes = await renderizarDocx(conteudo({ sumario: 'Antes\u000Cdepois\u0001.' }, 'Cli\u000Bente'), RODAPE);
    const zip = await JSZip.loadAsync(bytes);
    const ruim = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).toContain('Antesdepois.');
    expect(doc).toContain('Cliente');
    expect(doc).not.toMatch(ruim);
    expect(await zip.file('docProps/core.xml')!.async('string')).not.toMatch(ruim);
  });
  it('escapa < e & no XML', async () => {
    const { doc } = await xml(conteudo({ observacoes: 'a <b> & c' }, 'A & B <Ltda>'));
    expect(doc).toContain('a &lt;b&gt; &amp; c');
    expect(doc).toContain('A &amp; B &lt;Ltda&gt;');
    expect(doc).not.toContain('<b>');
  });
});
