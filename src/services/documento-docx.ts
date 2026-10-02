// Cópia de trabalho da proposta em Word. Sai do mesmo ConteudoDocumento congelado na geração
// (sem reler o banco), então reflete exatamente o documento gerado. O que vale para o aceite é a
// versão do n.iso com o hash, e o rodapé diz isso. A biblioteca escapa o XML; aqui só vai texto.
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, PageBreak, Footer,
  HeadingLevel, AlignmentType,
} from 'docx';
import { dataBr, type Bloco, type ConteudoDocumento } from './documento-proposta';

const COR_PADRAO = '00ADE8';
const TITULO = 'Montserrat';
const CORPO = 'Inter';
const TEXTO = '44506A';

/** Caractere de controle não existe em XML 1.0: o Word recusa o arquivo inteiro. A biblioteca só escapa < > &. */
const limpo = (t: unknown) => String(t ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** Linhas por "\n" viram quebras de linha dentro do mesmo parágrafo. */
function runs(texto: string, o: { bold?: boolean; color?: string; size?: number; font?: string } = {}): TextRun[] {
  return limpo(texto).split('\n').map((l, i) => new TextRun({ text: l, break: i ? 1 : 0, font: o.font ?? CORPO, ...o }));
}
const par = (texto: string, o: Parameters<typeof runs>[1] = {}, extra: { spacing?: number } = {}) =>
  new Paragraph({ children: runs(texto, { color: TEXTO, ...o }), spacing: { after: extra.spacing ?? 120 } });

function tabela(cab: string[], linhas: string[][], total?: string[]): Table {
  const larg = Math.max(cab.length, ...linhas.map((l) => l.length), 1);
  const celula = (t: string, bold = false) => new TableCell({ children: [par(t, { bold, color: bold ? '0F172A' : TEXTO, size: 19 }, { spacing: 40 })] });
  const linha = (l: string[], bold = false) => new TableRow({ children: Array.from({ length: larg }, (_, j) => celula(l[j] ?? '', bold || (!cab.length && j === 0))) });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [...(cab.length ? [linha(cab, true)] : []), ...linhas.map((l) => linha(l)), ...(total ? [linha(total, true)] : [])],
  });
}

function bloco(b: Bloco): (Paragraph | Table)[] {
  switch (b.t) {
    case 'p': return [par(b.texto)];
    case 'sub': return [new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 }, children: runs(b.texto, { bold: true, font: TITULO, size: 22, color: '0F172A' }) })];
    case 'lista': return b.itens.map((i) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: runs(i, { color: TEXTO }) }));
    case 'tabela': return [tabela(b.cab, b.linhas, b.total), par('')];
    case 'barras': return [tabela(['Domínio', 'Maturidade'], b.itens.map((i) => [i.rotulo, `${Math.round(Number(i.pct) || 0)}%`])), par('')];
    case 'gantt': return [tabela(['Fase', 'Semanas'], b.fases.map((f) => [f.rotulo, `${f.ini + 1}–${f.fim}`])), par('')];
    case 'kpis': return b.itens.length ? [tabela([], [b.itens.map((k) => `${k.valor}\n${k.rotulo}`)]), par('')] : [];
  }
}

export async function renderizarDocx(c: ConteudoDocumento, rodape: string): Promise<Uint8Array> {
  // ponytail: hex da organização validado; fora disso, o azul padrão
  const cor = /^#[0-9a-fA-F]{6}$/.test(c.org.cor) ? c.org.cor.slice(1).toUpperCase() : COR_PADRAO;
  const cap = c.capa;
  const numero = `${c.numero}${c.revisao > 1 ? ` rev. ${c.revisao}` : ''}`;
  const linhaCapa = (rotulo: string, valor: string) => par(`${rotulo}: ${valor}`, { size: 22 });

  const capa: Paragraph[] = [
    new Paragraph({ spacing: { after: 1800 }, children: runs(c.org.marcaNess ? 'ness.' : c.org.nome, { bold: true, font: TITULO, size: 44, color: '0F172A' }) }),
    par(`PROPOSTA COMERCIAL · ${numero}`, { bold: true, color: '0F172A', size: 18, font: TITULO }),
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 300 }, children: runs(cap.titulo, { bold: true, font: TITULO, size: 56, color: '0F172A' }) }),
    par(`Preparada para ${cap.cliente}`, { size: 24 }),
    ...(cap.cnpj ? [linhaCapa('CNPJ', cap.cnpj)] : []),
    ...(cap.pessoas != null ? [linhaCapa('Pessoas no escopo', String(cap.pessoas))] : []),
    linhaCapa('Emitida em', dataBr(c.emitidaEm)),
    linhaCapa('Válida até', dataBr(c.validaAte)),
    ...(cap.duracao ? [linhaCapa('Duração', cap.duracao)] : []),
    linhaCapa('Investimento', cap.investimento),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const corpo = c.secoes.flatMap((s) => [
    new Paragraph({
      heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 },
      children: [
        ...(s.numero ? [new TextRun({ text: `${s.numero}  `, font: TITULO, bold: true, size: 28, color: cor })] : []),
        new TextRun({ text: s.titulo, font: TITULO, bold: true, size: 28, color: '0F172A' }),
      ],
    }),
    ...s.blocos.flatMap(bloco),
  ]);

  const nota = (t: string) => new Paragraph({ alignment: AlignmentType.LEFT, children: runs(t, { size: 16, color: '8A94A6' }) });
  const doc = new Document({
    creator: limpo(c.org.nome), title: limpo(`Proposta ${numero} · ${cap.cliente}`),
    styles: { default: { document: { run: { font: CORPO, size: 20 } } } },
    sections: [{
      footers: { default: new Footer({ children: [nota(rodape)] }) },
      children: [...capa, ...corpo, nota(rodape)],
    }],
  });
  return Packer.pack(doc, 'uint8array');
}
