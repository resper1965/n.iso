import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML } from '../ui.js';

// Visão do encarregado (fatia 8 do núcleo): o que está atrasado ou faltando no projeto, numa tela. Só leitura: a regra e as contas são do
// servidor (`GET /projects/:id/encarregado`); aqui só se mostra e se leva à tela de cada coisa. Todo texto é escapado.

const NIVEL = { alta: ['Alta', 'danger'], media: ['Média', 'warning'] };
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const n = (v) => escapeHTML(String(v ?? 0));
const cor = (q, ruim = 'var(--danger)') => (q > 0 ? ruim : '#34c759');

async function renderEncarregado(c, h, a) {
    h.textContent = 'Encarregado';
    a.innerHTML = '';
    const proj = projetoAtivo();
    if (!proj) {
        c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>';
        return;
    }
    let v;
    try { v = await api('GET', `/api/v1/projects/${proj.id}/encarregado`); } catch (e) {
        c.innerHTML = '<div class="empty-state fade-in"><h3>Não foi possível montar a visão</h3><p>Tente de novo em instantes.</p></div>';
        return;
    }
    const pt = v.pedidos_titular || {}, inc = v.incidentes || {}, tr = v.tratamentos || {}, te = v.terceiros || {}, ev = v.evidencias || {}, lg = v.lgpd || {};
    const pendTrat = (tr.sem_base_legal || 0) + (tr.dpia_pendente || 0) + (tr.lia_pendente || 0);
    const cartoes = window.renderStatCards([
        { label: 'Pedidos do titular', value: pt.abertos || 0, color: cor(pt.atrasados), subtext: `${n(pt.atrasados)} atrasados · ${n(pt.vencem_em_7_dias)} vencem em 7 dias` },
        { label: 'Incidentes abertos', value: inc.abertos || 0, color: cor(inc.comunicacoes_atrasadas), subtext: `${n(inc.comunicacoes_atrasadas)} comunicações atrasadas` },
        { label: 'Tratamentos com pendência', value: pendTrat, color: cor(pendTrat, '#ffcc00'), subtext: `de ${n(tr.total)} no RoPA` },
        { label: 'Terceiros vencidos', value: te.vencidos || 0, color: cor(te.vencidos), subtext: `${n(te.pendentes)} nunca avaliados · ${n(te.reprovados)} reprovados` },
        { label: 'Evidências vencidas', value: ev.vencidas || 0, color: cor(ev.vencidas, '#ffcc00'), subtext: `${n(ev.vencem_em_7_dias)} vencem em 7 dias` },
        lg.carregada
            ? { label: 'LGPD coberta', value: `${lg.cobertos || 0}/${lg.total || 0}`, color: cor(lg.lacunas, '#ffcc00'), subtext: `${n(lg.parciais)} parciais · ${n(lg.lacunas)} lacunas` }
            : { label: 'LGPD', value: '—', color: 'var(--text-dim)', subtext: 'Catálogo ainda não carregado' },
    ]);
    const prioridades = Array.isArray(v.prioridades) ? v.prioridades : [];
    const tabela = window.renderDataTable(['Prioridade', 'O que fazer', 'Ações'], prioridades.map((p) => {
        const [rotulo, tom] = NIVEL[p.nivel] || [p.nivel, 'neutral'];
        return [window.renderStatusBadge(rotulo, tom), escapeHTML(p.texto), `<button class="btn btn-ghost btn-sm" data-action="navigate" data-args='${args(p.tela)}'>Abrir</button>`];
    }), { emptyState: 'Nada atrasado ou faltando. Os prazos legais e o catálogo de requisitos estão em dia.' });
    c.innerHTML = `${cartoes}<h3 style="margin:1.5rem 0 0.5rem">O que fazer</h3>${tabela}`;
}

window.renderEncarregado = renderEncarregado;
