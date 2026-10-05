import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, escapeHTML } from '../ui.js';
import { navigate } from '../router.js';

// S2: wrappers para handlers com `this` como PRIMEIRO argumento (a delegação só
// ANEXA o elemento como último via data-arg-el). O dispatcher chama
// fn.apply(el, args), então aqui `this` === o elemento clicado.
window.__cmSelectNess = function (key, val) { window.selectNessOption(this, key, val); };
window.__cmToggleChip = function (key) { window.toggleWizardChip(this, key); };

    async function renderLeads(c, h, a) {
        h.textContent = 'Pipeline de Leads & Oportunidades';
        a.innerHTML = '<button class="btn btn-primary" data-action="openCreateLeadModal">+ Novo Lead</button>';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const leads = await api('GET', '/api/v1/leads').catch(() => []);
            const leadsArr = Array.isArray(leads) ? leads : [];
            
            // Status reais do banco (leads.status): New, Assessment, Proposal, Won, Lost.
            const conta = (s) => leadsArr.filter(l => (l.status || 'New') === s).length;
            const statsHtml = window.renderStatCards([
                { label: 'Total de Oportunidades', value: leadsArr.length, color: 'var(--accent)', subtext: 'Empresas no pipeline' },
                { label: 'Novos', value: conta('New'), color: '#34c759', subtext: 'Ainda sem diagnóstico' },
                { label: 'Em diagnóstico', value: conta('Assessment'), color: '#34c759', subtext: 'Assessment em andamento' },
                { label: 'Com proposta', value: conta('Proposal'), color: '#ffcc00', subtext: 'Contratos em pré-vendas' },
                { label: 'Ganhos', value: conta('Won'), color: '#34c759', subtext: 'Proposta aceita' },
                { label: 'Perdidos', value: conta('Lost'), color: '#ef4444', subtext: 'Recusados ou encerrados' }
            ]);

            const tableHtml = window.renderDataTable(
                ['Empresa / Razão Social', 'Contato Principal', 'CNPJ / Porte', 'Status', 'Ações'],
                leadsArr.map(l => [
                    `<strong>${escapeHTML(l.company_name || l.razao_social || 'Sem nome')}</strong>`,
                    escapeHTML(l.contact_name || l.email || '---'),
                    escapeHTML(l.cnpj || l.porte || '---'),
                    window.renderStatusBadge(l.status || 'New', l.status === 'Won' ? 'success' : l.status === 'Lost' ? 'danger' : 'info'),
                    `<button class="btn btn-ghost btn-sm" data-action="openLeadDetail" data-args='["${l.id}"]'>Ver Detalhes &rarr;</button>`
                ]),
                { emptyState: 'Nenhum lead comercial cadastrado no momento.' }
            );

            // Preço e motivo de perda: só quem a rota /funil admite (consultor comum leva 403).
            const funil = PAPEIS_FUNIL.includes(S.user?.role) ? `
                <section class="fn-bloco" id="fn-funil" aria-labelledby="fn-titulo">
                    <h2 class="fn-titulo" id="fn-titulo">Funil</h2>
                    <form class="fn-periodo" id="fn-form" data-action-submit="__fnAplicar" data-arg-event data-prevent novalidate>
                        <div class="fn-campo"><label class="fn-rotulo" for="fn-de">De</label><input class="form-input" type="date" id="fn-de"></div>
                        <div class="fn-campo"><label class="fn-rotulo" for="fn-ate">Até</label><input class="form-input" type="date" id="fn-ate"></div>
                        <button class="btn btn-primary btn-sm" type="submit">Aplicar</button>
                    </form>
                    <p class="fn-erro" id="fn-erro" role="alert"></p>
                    <div id="fn-corpo"><div class="loading"></div></div>
                </section>` : '';

            c.innerHTML = `
                ${statsHtml}
                ${tableHtml}
                ${funil}
            `;
            if (funil) carregarFunil('');
        } catch (e) {
            c.innerHTML = '<div class="error">Erro ao carregar leads: ' + escapeHTML(e.message) + '</div>';
        }
    }

    const PAPEIS_FUNIL = ['platform_admin', 'comercial', 'consultoria_admin'];
    const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const ROTULO_PROPOSTA = { rascunho: 'Rascunho', aguardando_aprovacao: 'Aguardando aprovação', gerada: 'Gerada', enviada: 'Enviada', visualizada: 'Visualizada', aceita: 'Aceita', recusada: 'Recusada', expirada: 'Expirada', substituida: 'Substituída' };

    async function carregarFunil(consulta) {
        const corpo = document.getElementById('fn-corpo');
        const erro = document.getElementById('fn-erro');
        if (!corpo) return;
        erro.textContent = '';
        try {
            const f = await api('GET', '/api/v1/funil' + consulta);
            document.getElementById('fn-de').value = f.periodo.de;
            document.getElementById('fn-ate').value = f.periodo.ate;
            const cartoes = window.renderStatCards([
                { label: 'Pipeline: projeto', value: brl(f.pipeline.totalProjeto), subtext: `${f.pipeline.propostas} proposta(s) em aberto` },
                { label: 'Pipeline: mensalidade', value: brl(f.pipeline.mensalidade), subtext: 'Recorrente, não somado ao projeto' },
                { label: 'Ganho: projeto', value: brl(f.ganho.totalProjeto), color: '#34c759', subtext: `${f.ganho.propostas} aceita(s) no período` },
                { label: 'Ganho: mensalidade', value: brl(f.ganho.mensalidade), color: '#34c759', subtext: 'Recorrente' },
                { label: 'Ciclo médio', value: f.cicloMedioDias == null ? '---' : `${String(f.cicloMedioDias).replace('.', ',')} dias`, subtext: 'Lead criado até aceite' }
            ]);
            const tabela = (cols, rows, vazio) => window.renderDataTable(cols, rows, { emptyState: vazio, dense: true });
            corpo.innerHTML = `
                ${cartoes}
                <div class="fn-tabelas">
                    <div><h3 class="fn-sub">Conversão</h3>${tabela(['Etapa', { label: 'Leads', align: 'right' }, { label: '% da anterior', align: 'right' }],
                        f.conversao.map(e => [escapeHTML(e.etapa), String(e.leads), `${String(e.percentualDaAnterior).replace('.', ',')}%`]), 'Sem dados no período.')}</div>
                    <div><h3 class="fn-sub">Motivos de perda</h3>${tabela(['Motivo', { label: 'Propostas', align: 'right' }],
                        f.perdas.map(p => [escapeHTML(p.motivo), String(p.quantidade)]), 'Nenhuma proposta recusada no período.')}</div>
                    <div><h3 class="fn-sub">Propostas por status</h3>${tabela(['Status', { label: 'Propostas', align: 'right' }],
                        Object.entries(f.propostasPorStatus).map(([s, n]) => [escapeHTML(ROTULO_PROPOSTA[s] || s), String(n)]), 'Sem propostas.')}</div>
                </div>`;
        } catch (e) {
            corpo.innerHTML = '';
            erro.textContent = e.message || 'Não foi possível carregar o funil.';
        }
    }

    window.__fnAplicar = () => {
        const de = document.getElementById('fn-de').value;
        const ate = document.getElementById('fn-ate').value;
        const q = new URLSearchParams({ ...(de && { de }), ...(ate && { ate }) }).toString();
        return carregarFunil(q ? '?' + q : '');
    };

    async function deleteLead(id) {
        if (!confirm('Deseja excluir este lead permanentemente?')) return;
        try {
            await api('DELETE', `/api/v1/leads/${id}`);
            showToast('Lead excluído com sucesso');
            loadAll();
            navigate('leads');
        } catch (e) { showToast('Erro ao excluir lead', 'error'); }
    }

    function openCreateLeadModal() {
        openModal(`<h3 style="margin-bottom:1rem">Novo Lead</h3>
            <div class="form-group"><label class="form-label">Empresa</label><input type="text" id="lead-company" class="form-input"></div>
            <div class="form-group"><label class="form-label">Contato</label><input type="text" id="lead-contact" class="form-input"></div>
            <div class="form-group"><label class="form-label">CNPJ</label>
                <div style="display:flex;gap:0.5rem">
                    <input type="text" id="lead-cnpj" class="form-input" placeholder="00.000.000/0001-00" style="flex:1" data-action-input="maskCnpj" data-arg-el>
                    <button class="btn" data-action="previewCnpj" style="white-space:nowrap">Consultar</button>
                </div>
                <div id="cnpj-preview" style="font-size:0.75rem;color:var(--muted);margin-top:0.3rem"></div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem">
                <button class="btn" data-action="closeModal">Cancelar</button>
                <button class="btn btn-primary" data-action="doCreateLead">Criar Lead</button>
            </div>`);
    }

    function maskCnpj(el) {
        let v = el.value.replace(/\D/g, '').slice(0, 14);
        if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
        else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
        else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
        else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3})/, '$1.$2');
        el.value = v;
    }

    async function previewCnpj() {
        const raw = (document.getElementById('lead-cnpj').value || '').replace(/\D/g, '');
        const el = document.getElementById('cnpj-preview');
        if (raw.length !== 14) { el.textContent = 'CNPJ deve ter 14 digitos'; return; }
        el.textContent = 'Consultando...';
        try {
            // Pelo backend, não direto na brasilapi: o CSP da página é
            // `connect-src 'self'` e bloquearia a chamada a terceiro. O servidor
            // já fazia essa consulta no enrich, e assim o IP de quem digita não
            // vai para fora.
            const d = await api('GET', '/api/v1/leads/consulta-cnpj/' + raw);
            el.innerHTML = '<span style="color:var(--accent)">'+escapeHTML(d.razao_social||'')+'</span> — '+escapeHTML(d.municipio||'')+'/'+escapeHTML(d.uf||'')+' — '+escapeHTML(d.descricao_situacao_cadastral||'');
            // auto-fill company name if empty
            const cn = document.getElementById('lead-company');
            if (!cn.value) cn.value = d.razao_social || d.nome_fantasia || '';
        } catch(e) { el.textContent = e.message; }
    }

    async function doCreateLead() {
        const company_name = document.getElementById('lead-company').value;
        const contact_name = document.getElementById('lead-contact').value;
        const cnpj = (document.getElementById('lead-cnpj').value || '').replace(/\D/g, '');
        if (!company_name) return;
        try {
            const lead = await api('POST', '/api/v1/leads', { company_name, contact_name, status: 'new' });
            // enrich CNPJ if provided
            if (cnpj.length === 14 && lead?.id) {
                try { await api('POST', '/api/v1/leads/' + lead.id + '/enrich-cnpj', { cnpj }); } catch(e) { console.warn('CNPJ enrich failed:', e); }
            }
            closeModal(); render();
        } catch(e) { alert('Erro: ' + e.message); }
    }

    async function openLeadDetail(id) {
        const l = await api('GET', '/api/v1/leads/' + id);
        const cnpjBadge = l.cnpj_fetched_at ? '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:rgba(0,173,232,0.12);color:var(--accent);margin-left:0.5rem">CNPJ Verificado</span>' : '';
        const cnpjInfo = l.razao_social ? `
            <div style="margin:1rem 0;padding:1rem;background:var(--surface);border:1px solid var(--border);border-radius:12px">
                <div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.5rem">Dados Receita Federal</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.85rem">
                    <div><strong>Razao Social:</strong> ${escapeHTML(l.razao_social)}</div>
                    <div><strong>CNPJ:</strong> ${escapeHTML(l.cnpj||'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')}</div>
                    <div><strong>Porte:</strong> ${escapeHTML(l.porte||'---')}</div>
                    <div><strong>CNAE:</strong> ${escapeHTML(l.cnae_fiscal_descricao||'---')}</div>
                    <div><strong>Municipio:</strong> ${escapeHTML(l.municipio||'---')}/${escapeHTML(l.uf||'')}</div>
                    <div><strong>Situação:</strong> ${escapeHTML(l.situacao_cadastral||'---')}</div>
                </div>
            </div>` : '';
        const enrichBtn = !l.cnpj_fetched_at ? `
            <div class="form-group" style="margin-top:1rem">
                <label class="form-label">Enriquecer via CNPJ</label>
                <div style="display:flex;gap:0.5rem">
                    <input type="text" id="lead-enrich-cnpj" class="form-input" placeholder="00.000.000/0001-00" style="flex:1" data-action-input="maskCnpj" data-arg-el>
                    <button class="btn btn-primary" data-action="enrichLeadCnpj" data-args='["${l.id}"]'>Consultar</button>
                </div>
            </div>` : '';
        openModal(`<div class="modal-header"><span class="modal-title">${escapeHTML(l.company_name)}${cnpjBadge}</span><button class="btn-ghost" data-action="forceCloseModal">\u2715</button></div>
            <p><strong>Contato:</strong> ${escapeHTML(l.contact_name||'---')}</p>
            <p><strong>Status:</strong> <span class="status-badge status-${l.status}">${l.status}</span></p>
            ${cnpjInfo}${enrichBtn}
            <div style="margin-top:1rem;display:flex;gap:0.5rem;justify-content:flex-end">
                <button class="btn btn-primary" data-action="createAssessmentFromLead" data-args='${escapeHTML(JSON.stringify([l.id, l.razao_social || l.company_name]))}'>Iniciar Levantamento</button>
                <button class="btn" data-action="forceCloseModal">Fechar</button>
            </div>`);
    }

    async function enrichLeadCnpj(id) {
        const cnpj = (document.getElementById('lead-enrich-cnpj').value||'').replace(/\D/g,'');
        if (cnpj.length !== 14) { showToast('CNPJ deve ter 14 digitos','error'); return; }
        try {
            showToast('Consultando CNPJ...');
            await api('POST', '/api/v1/leads/' + id + '/enrich-cnpj', { cnpj });
            showToast('CNPJ enriquecido com sucesso');
            openLeadDetail(id); // re-open with enriched data
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function renderAssessments(c, h, a) {
        h.textContent = 'Levantamentos de Escopo';
        a.innerHTML = '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const assessments = await api('GET', '/api/v1/assessments');
            const asArr = Array.isArray(assessments) ? assessments : [];
            S.assessments = asArr;

            const totalAs = asArr.length;
            const completedAs = asArr.filter(as => as.status === 'completed' || as.status === 'concluido').length;
            const activeAs = totalAs - completedAs;

            const statsHtml = window.renderStatCards([
                { label: 'Total Levantamentos', value: totalAs, color: 'var(--accent)', subtext: 'Pesquisas de escopo' },
                { label: 'Em Andamento', value: activeAs, color: '#ffcc00', subtext: 'Em preenchimento' },
                { label: 'Concluídos', value: completedAs, color: '#34c759', subtext: 'Prontos para proposta' }
            ]);

            const tableHtml = window.renderDataTable(
                ['Cliente / Empresa', 'Data de Criação', 'Status', 'Ações'],
                asArr.map(as => {
                    const date = as.created_at ? as.created_at.split(' ')[0] : '—';
                    const statusType = as.status === 'completed' || as.status === 'concluido' ? 'success' : 'warning';
                    return [
                        `<strong>${escapeHTML(as.client_name || 'Sem nome')}</strong>`,
                        date,
                        window.renderStatusBadge(as.status || 'Em andamento', statusType),
                        `<button class="btn btn-primary btn-sm" data-action="openAssessmentDetail" data-args='["${as.id}"]'>Gerenciar Levantamento &rarr;</button>`
                    ];
                }),
                { emptyState: 'Nenhum levantamento de escopo cadastrado.' }
            );

            c.innerHTML = `
                ${statsHtml}
                ${tableHtml}
            `;
        } catch (e) {
            console.error('Error rendering assessments:', e);
            c.innerHTML = '<div class="error">Erro ao carregar assessments: ' + escapeHTML(e.message) + '</div>';
        }
    }

    async function createAssessmentFromLead(leadId, clientName) {
        try {
            forceCloseModal();
            const res = await api('POST', '/api/v1/assessments', { client_name: clientName, lead_id: leadId });
            showToast('Levantamento criado para ' + clientName);
            openAssessmentDetail(res.id);
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function openAssessmentDetail(id) {
        S.currentBlock = 1; // reset to first block
        navigate('assessment-detail', { currentAssessmentId: id });
    }

    async function renderAssessmentDetail(c, h, a) {
        const id = S.currentAssessmentId;
        const currentIdx = (S.currentBlock || 1) - 1;
        const currentBlock = ASSESSMENT_BLOCKS[currentIdx];

        h.textContent = 'Levantamento';
        a.innerHTML = '<button class="btn" data-action="navigate" data-args=\'["assessments"]\'>&larr; Voltar</button>';
        c.innerHTML = '<div class="loading"></div>';
        
        try {
            const [as, answers] = await Promise.all([
                api('GET', `/api/v1/assessments/${id}`),
                api('GET', `/api/v1/assessments/${id}/answers`)
            ]);
            
            h.textContent = `${as.client_name || 'Levantamento'} — Bloco ${S.currentBlock}`;
            
            // Map answers for easy access
            const answerMap = {};
            (answers || []).forEach(ans => {
                if (!answerMap[ans.block]) answerMap[ans.block] = {};
                answerMap[ans.block][ans.question_key] = ans.answer;
            });

            // Sidebar HTML
            const sidebarHtml = ASSESSMENT_BLOCKS.map((b, idx) => {
                const isActive = (idx + 1) === S.currentBlock;
                const blockAns = answerMap[b.block] || {};
                const totalQ = b.questions.length;
                const answeredQ = b.questions.filter(q => blockAns[q.key]).length;
                const isCompleted = answeredQ === totalQ;

                return `
                    <div class="wizard-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}" data-action="goToBlock" data-args='[${idx + 1}]'>
                        <div class="step-dot"></div>
                        <div class="step-label">Bloco ${b.block}: ${b.title}</div>
                        ${isCompleted ? '<span style="margin-left:auto;color:var(--success);font-size:0.72rem">&#10003;</span>' : ''}
                    </div>
                `;
            }).join('');

            // Questions HTML for current block
            const questionsHtml = currentBlock.questions.map(q => {
                const val = (answerMap[currentBlock.block] || {})[q.key] || '';
                let inputHtml = '';

                if (q.type === 'yesno') {
                    inputHtml = `
                        <div class="yesno-group">
                            <button class="yesno-btn ${val === 'yes' ? 'yesno-active' : ''}" data-action="setWizardAnswer" data-args='["${q.key}","yes"]' data-arg-el>Sim</button>
                            <button class="yesno-btn ${val === 'no' ? 'yesno-active' : ''}" data-action="setWizardAnswer" data-args='["${q.key}","no"]' data-arg-el>Não</button>
                        </div>
                    `;
                } else if (q.type === 'select' && q.options) {
                    inputHtml = `
                        <div class="ness-select" id="select-${q.key}">
                            <div class="ness-select-trigger" data-action="toggleNessSelect" data-arg-el>${val || 'Selecione uma opção'}</div>
                            <div class="ness-select-options">
                                <div class="ness-select-option ${!val ? 'selected' : ''}" data-action="__cmSelectNess" data-args='["${q.key}",""]'>Selecione uma opção</div>
                                ${q.options.map(o => `
                                    <div class="ness-select-option ${val === o ? 'selected' : ''}" data-action="__cmSelectNess" data-args="${escapeHTML(JSON.stringify([q.key, o]))}">${escapeHTML(o)}</div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                } else if (q.type === 'multi' && q.options) {
                    inputHtml = `
                        <div class="multi-chips" data-key="${q.key}">
                            ${q.options.map(o => {
                                const active = (val || '').split('||').includes(o);
                                return `<div class="chip ${active ? 'chip-active' : ''}" data-action="__cmToggleChip" data-args='["${q.key}"]'>${escapeHTML(o)}</div>`;
                            }).join('')}
                        </div>
                    `;
                } else {
                    inputHtml = `<input type="text" class="form-input wizard-input" data-key="${q.key}" value="${escapeHTML(val)}" data-action-input="setWizardAnswer" data-args='["${q.key}"]' data-arg-val placeholder="Sua resposta...">`;
                }

                return `
                    <div class="form-group">
                        <label class="form-label">${escapeHTML(q.text || q.question)}</label>
                        ${inputHtml}
                    </div>
                `;
            }).join('');

            c.innerHTML = `
                <div class="wizard-layout fade-in">
                    <div class="wizard-sidebar">
                        ${sidebarHtml}
                        <div style="margin-top:auto; padding-top:1rem; border-top:1px solid var(--border-dim)">
                            ${as.status === 'converted' ? '<div class="ctx-tag ctx-tag-green" style="text-align:center">Projeto Ativo</div>' : ''}
                        </div>
                    </div>
                    <div class="wizard-content">
                        <div class="wizard-card">
                            <div style="margin-bottom:1.5rem">
                                <h2 style="font-family:'Montserrat',sans-serif;font-size:1.1rem;margin-bottom:0.25rem">${currentBlock.title}</h2>
                                <p style="font-size:0.75rem;color:var(--muted)">Responda as questões abaixo para completar este bloco.</p>
                            </div>
                            <div class="wizard-questions">
                                <div style="display:grid;gap:1.5rem">
                                    ${questionsHtml}
                                </div>
                            </div>
                            <div class="wizard-footer" style="margin-top:0; padding-top:1.5rem">
                                <button class="btn" data-action="goToBlock" data-args='[${S.currentBlock - 1}]' ${S.currentBlock === 1 ? 'style="display:none"' : ''}>Anterior</button>
                                <div style="margin-left:auto; display:flex; gap:0.5rem">
                                    <button class="btn btn-primary" data-action="goToBlock" data-args='[${S.currentBlock + 1}]' style="padding: 0.75rem 2.5rem; font-size: 0.75rem; box-shadow: 0 4px 15px rgba(0,173,232,0.3)">${S.currentBlock === ASSESSMENT_BLOCKS.length ? 'Gravar e Finalizar' : 'Gravar e Continuar'}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Initialize local state for current block answers
            S.blockAnswers = answerMap[currentBlock.block] || {};

        } catch(e) {
            c.innerHTML = '<div class="error">Erro ao carregar detalhes: ' + e.message + '</div>';
        }
    }

    function toggleNessSelect(trigger) {
        const parent = trigger.parentElement;
        const isOpen = parent.classList.contains('open');
        document.querySelectorAll('.ness-select').forEach(s => s.classList.remove('open'));
        if (!isOpen) parent.classList.add('open');
        
        // Close on outside click
        if (!isOpen) {
            const closer = (e) => {
                if (!parent.contains(e.target)) {
                    parent.classList.remove('open');
                    document.removeEventListener('click', closer);
                }
            };
            setTimeout(() => document.addEventListener('click', closer), 10);
        }
    }

    function selectNessOption(opt, key, val) {
        const parent = opt.closest('.ness-select');
        const trigger = parent.querySelector('.ness-select-trigger');
        trigger.textContent = val || 'Selecione uma opção';
        parent.classList.remove('open');
        setWizardAnswer(key, val);
        
        // UI update
        parent.querySelectorAll('.ness-select-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
    }

    async function goToBlock(num) {
        // safety sync: ensure all current inputs are in S.blockAnswers
        document.querySelectorAll('.wizard-input').forEach(input => {
            if (input.dataset.key) S.blockAnswers[input.dataset.key] = input.value;
        });

        // Save current block before moving if there are answers
        if (Object.keys(S.blockAnswers || {}).length > 0) {
            const block = ASSESSMENT_BLOCKS[S.currentBlock - 1];
            const answers = Object.entries(S.blockAnswers).map(([k, v]) => ({
                question_key: k,
                question: '',
                answer: v,
                notes: ''
            }));
            
            try {
                await api('POST', `/api/v1/assessments/${S.currentAssessmentId}/block/${block.block}`, {
                    answers
                });
            } catch(e) { console.error('Save failed', e); }
        }

        if (num > ASSESSMENT_BLOCKS.length) {
            // Finalize assessment
            try {
                await api('PUT', `/api/v1/assessments/${S.currentAssessmentId}`, { status: 'completed' });
                alert('Assessment finalizado com sucesso!');
                navigate('assessments');
            } catch(e) { alert('Erro ao finalizar: ' + e.message); }
            return;
        }

        if (num < 1) return;
        
        S.currentBlock = num;
        render();
    }

    function setWizardAnswer(key, val, el) {
        S.blockAnswers[key] = val;
        if (el && el.classList.contains('yesno-btn')) {
            el.closest('.yesno-group').querySelectorAll('.yesno-btn').forEach(b => b.classList.remove('yesno-active'));
            el.classList.add('yesno-active');
        }
    }

    function toggleWizardChip(el, key) {
        el.classList.toggle('chip-active');
        const container = el.closest('.multi-chips');
        const selected = [...container.querySelectorAll('.chip-active')].map(c => c.textContent);
        S.blockAnswers[key] = selected.join('||');
    }

    async function savePricingOverride(id) {
        const precoFinal = parseFloat(document.getElementById('p-price').value);
        const desconto = parseFloat(document.getElementById('p-discount').value);
        const notas = document.getElementById('p-notes').value;
        try {
            await api('PUT', `/api/v1/assessments/${id}/pricing`, { precoFinal, desconto, notas });
            showToast('Ajustes salvos com sucesso');
            forceCloseModal();
            loadAll();
            render();
        } catch(e) { showToast('Erro ao salvar ajustes: ' + e.message, 'error'); }
    }

    async function renderSelfServiceAssessment(token) {
        const c = document.getElementById('content');
        const sidebar = document.querySelector('.sidebar');
        const header = document.querySelector('.header');
        if (sidebar) sidebar.style.display = 'none';
        if (header) header.style.display = 'none';
        document.querySelector('.main').style.marginLeft = '0';

        c.innerHTML = '<div style="max-width:700px;margin:2rem auto;padding:0 1rem"><div style="text-align:center;color:var(--muted)">Carregando assessment...</div></div>';

        try {
            const r = await fetch(API_BASE + '/api/v1/public/assessment/' + encodeURIComponent(token));
            if (!r.ok) throw new Error('Link invalido ou expirado');
            const data = await r.json();
            if (data.error) throw new Error(data.error);

            // Group existing answers by block
            const existingByBlock = {};
            (data.answers || []).forEach(a => {
                if (!existingByBlock[a.block]) existingByBlock[a.block] = {};
                existingByBlock[a.block][a.question_key] = a.answer;
            });

            // ponytail: reuse ASSESSMENT_BLOCKS from the main app
            const blocks = typeof ASSESSMENT_BLOCKS !== 'undefined' ? ASSESSMENT_BLOCKS : [];
            if (!blocks.length) {
                c.innerHTML = '<div style="max-width:700px;margin:2rem auto;text-align:center;color:var(--danger)">Erro: Assessment blocks not loaded.</div>';
                return;
            }

            window._ssToken = token;
            window._ssData = data;
            window._ssBlock = 0;
            window._ssAnswers = existingByBlock;

            renderSelfServiceBlock(c, blocks);
        } catch(e) {
            c.innerHTML = `<div style="max-width:700px;margin:2rem auto;text-align:center">
                <div class="logo" style="font-size:2rem;margin-bottom:1rem">n<span style="color:var(--accent)">.</span>ISO</div>
                <div style="color:var(--danger)">${escapeHTML(e.message)}</div>
            </div>`;
        }
    }

    function renderSelfServiceBlock(c, blocks) {
        const idx = window._ssBlock;
        const block = blocks[idx];
        if (!idx && idx !== 0 || !block) return;

        const existing = window._ssAnswers[block.block] || {};
        const total = blocks.length;

        c.innerHTML = `<div style="max-width:700px;margin:2rem auto;padding:0 1rem" class="fade-in">
            <div style="text-align:center;margin-bottom:2rem">
                <div class="logo" style="font-size:1.5rem;margin-bottom:0.5rem">n<span style="color:var(--accent)">.</span>ISO</div>
                <div style="font-size:0.75rem;color:var(--muted)">Assessment Self-Service para ${escapeHTML(window._ssData.client_name)}</div>
                <div style="margin-top:0.5rem;font-size:0.72rem;color:var(--muted)">Bloco ${idx + 1} de ${total}</div>
                <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:0.75rem">
                    <div style="width:${Math.round(((idx + 1) / total) * 100)}%;height:100%;background:var(--accent);border-radius:2px;transition:width 0.3s"></div>
                </div>
            </div>
            <div class="card" style="padding:1.5rem">
                <div style="font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;margin-bottom:1.25rem">${escapeHTML(block.title)}</div>
                ${block.questions.map((q, qi) => {
                    const val = existing[q.key] || '';
                    if (q.type === 'yesno') {
                        return `<div class="form-group"><label class="form-label">${escapeHTML(q.text)}</label>
                            <select class="form-input ss-answer" data-key="${q.key}">
                                <option value="">Selecione</option>
                                <option value="yes" ${val === 'yes' ? 'selected' : ''}>Sim</option>
                                <option value="no" ${val === 'no' ? 'selected' : ''}>Nao</option>
                            </select></div>`;
                    } else if (q.type === 'select' && q.options) {
                        return `<div class="form-group"><label class="form-label">${escapeHTML(q.text)}</label>
                            <select class="form-input ss-answer" data-key="${q.key}">
                                <option value="">Selecione</option>
                                ${q.options.map(o => `<option value="${escapeHTML(o)}" ${val === o ? 'selected' : ''}>${escapeHTML(o)}</option>`).join('')}
                            </select></div>`;
                    } else {
                        return `<div class="form-group"><label class="form-label">${escapeHTML(q.text)}</label>
                            <input class="form-input ss-answer" data-key="${q.key}" value="${escapeHTML(val)}" placeholder="Sua resposta"></div>`;
                    }
                }).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:1rem">
                ${idx > 0 ? '<button class="btn" data-action="ssPrev">Anterior</button>' : '<div></div>'}
                <button class="btn btn-primary" data-action="ssNext">${idx < total - 1 ? 'Próximo' : 'Concluir Assessment'}</button>
            </div>
        </div>`;
    }

    window.ssPrev = function() {
        const blocks = typeof ASSESSMENT_BLOCKS !== 'undefined' ? ASSESSMENT_BLOCKS : [];
        if (window._ssBlock > 0) { window._ssBlock--; renderSelfServiceBlock(document.getElementById('content'), blocks); }
    };

    window.ssNext = async function() {
        const blocks = typeof ASSESSMENT_BLOCKS !== 'undefined' ? ASSESSMENT_BLOCKS : [];
        const block = blocks[window._ssBlock];
        const els = document.querySelectorAll('.ss-answer');
        const answers = [];
        els.forEach(el => {
            answers.push({ question_key: el.dataset.key, question: '', answer: el.value || '', notes: '' });
        });

        // Save to existing answers map
        if (!window._ssAnswers[block.block]) window._ssAnswers[block.block] = {};
        answers.forEach(a => { window._ssAnswers[block.block][a.question_key] = a.answer; });

        // Save to API
        try {
            await fetch(API_BASE + '/api/v1/public/assessment/' + window._ssToken + '/answers', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ block: block.block, answers })
            });
        } catch(e) {}

        if (window._ssBlock < blocks.length - 1) {
            window._ssBlock++;
            renderSelfServiceBlock(document.getElementById('content'), blocks);
        } else {
            document.getElementById('content').innerHTML = `<div style="max-width:700px;margin:3rem auto;text-align:center" class="fade-in">
                <div class="logo" style="font-size:2rem;margin-bottom:1rem">n<span style="color:var(--accent)">.</span>ISO</div>
                <div style="font-size:1.2rem;font-weight:500;color:var(--success);margin-bottom:0.5rem">Assessment Concluido!</div>
                <div style="color:var(--muted);font-size:0.75rem">Obrigado por completar o assessment. Seu consultor entrara em contato com os proximos passos.</div>
            </div>`;
        }
    };

window.renderLeads = renderLeads;
window.deleteLead = deleteLead;
window.openCreateLeadModal = openCreateLeadModal;
window.maskCnpj = maskCnpj;
window.previewCnpj = previewCnpj;
window.doCreateLead = doCreateLead;
window.openLeadDetail = openLeadDetail;
window.enrichLeadCnpj = enrichLeadCnpj;
window.renderAssessments = renderAssessments;
window.createAssessmentFromLead = createAssessmentFromLead;
window.openAssessmentDetail = openAssessmentDetail;
window.renderAssessmentDetail = renderAssessmentDetail;
window.toggleNessSelect = toggleNessSelect;
window.selectNessOption = selectNessOption;
window.goToBlock = goToBlock;
window.setWizardAnswer = setWizardAnswer;
window.toggleWizardChip = toggleWizardChip;
window.savePricingOverride = savePricingOverride;
window.renderSelfServiceAssessment = renderSelfServiceAssessment;
window.renderSelfServiceBlock = renderSelfServiceBlock;
