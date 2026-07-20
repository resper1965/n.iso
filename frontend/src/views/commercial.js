import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, escapeHTML } from '../ui.js';
import { navigate } from '../router.js';

    async function renderLeads(c, h, a) {
        h.textContent = 'Leads';
        a.innerHTML = '<button class="btn btn-primary" onclick="openCreateLeadModal()">+ Novo Lead</button>';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const leads = await api('GET', '/api/v1/leads');
            c.innerHTML = `
                <div class="card fade-in">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Empresa</th>
                                <th>Contato</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Array.isArray(leads) ? leads.map(l => `
                                <tr>
                                    <td>${escapeHTML(l.company_name)}</td>
                                    <td>${escapeHTML(l.contact_name)}</td>
                                    <td><span class="status-badge status-${l.status}">${l.status}</span></td>
                                    <td><button class="btn" onclick="openLeadDetail('${l.id}')">Ver</button></td>
                                </tr>
                            `).join('') : '<tr><td colspan="4">Nenhum lead encontrado</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            c.innerHTML = '<div class="error">Erro ao carregar leads</div>';
        }
    }

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
                    <input type="text" id="lead-cnpj" class="form-input" placeholder="00.000.000/0001-00" style="flex:1" oninput="maskCnpj(this)">
                    <button class="btn" onclick="previewCnpj()" style="white-space:nowrap">Consultar</button>
                </div>
                <div id="cnpj-preview" style="font-size:0.75rem;color:var(--muted);margin-top:0.3rem"></div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem">
                <button class="btn" onclick="closeModal()">Cancelar</button>
                <button class="btn btn-primary" onclick="doCreateLead()">Criar Lead</button>
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
            const res = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + raw);
            if (!res.ok) { el.textContent = 'CNPJ nao encontrado'; return; }
            const d = await res.json();
            el.innerHTML = '<span style="color:var(--accent)">'+escapeHTML(d.razao_social)+'</span> — '+escapeHTML(d.municipio||'')+'/'+escapeHTML(d.uf||'')+' — '+escapeHTML(d.descricao_situacao_cadastral||'');
            // auto-fill company name if empty
            const cn = document.getElementById('lead-company');
            if (!cn.value) cn.value = d.razao_social || d.nome_fantasia || '';
        } catch(e) { el.textContent = 'Erro: ' + e.message; }
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
        const cnpjBadge = l.cnpj_fetched_at ? '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.65rem;font-weight:600;background:rgba(0,173,232,0.12);color:var(--accent);margin-left:0.5rem">CNPJ Verificado</span>' : '';
        const cnpjInfo = l.razao_social ? `
            <div style="margin:1rem 0;padding:1rem;background:var(--surface);border:1px solid var(--border);border-radius:12px">
                <div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.5rem">Dados Receita Federal</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.85rem">
                    <div><strong>Razao Social:</strong> ${escapeHTML(l.razao_social)}</div>
                    <div><strong>CNPJ:</strong> ${escapeHTML(l.cnpj||'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')}</div>
                    <div><strong>Porte:</strong> ${escapeHTML(l.porte||'---')}</div>
                    <div><strong>CNAE:</strong> ${escapeHTML(l.cnae_fiscal_descricao||'---')}</div>
                    <div><strong>Municipio:</strong> ${escapeHTML(l.municipio||'---')}/${escapeHTML(l.uf||'')}</div>
                    <div><strong>Situacao:</strong> ${escapeHTML(l.situacao_cadastral||'---')}</div>
                </div>
            </div>` : '';
        const enrichBtn = !l.cnpj_fetched_at ? `
            <div class="form-group" style="margin-top:1rem">
                <label class="form-label">Enriquecer via CNPJ</label>
                <div style="display:flex;gap:0.5rem">
                    <input type="text" id="lead-enrich-cnpj" class="form-input" placeholder="00.000.000/0001-00" style="flex:1" oninput="maskCnpj(this)">
                    <button class="btn btn-primary" onclick="enrichLeadCnpj('${l.id}')">Consultar</button>
                </div>
            </div>` : '';
        openModal(`<div class="modal-header"><span class="modal-title">${escapeHTML(l.company_name)}${cnpjBadge}</span><button class="btn-ghost" onclick="forceCloseModal()">\u2715</button></div>
            <p><strong>Contato:</strong> ${escapeHTML(l.contact_name||'---')}</p>
            <p><strong>Status:</strong> <span class="status-badge status-${l.status}">${l.status}</span></p>
            ${cnpjInfo}${enrichBtn}
            <div style="margin-top:1rem;display:flex;gap:0.5rem;justify-content:flex-end">
                <button class="btn btn-primary" onclick="createAssessmentFromLead('${l.id}','${escapeHTML(l.razao_social||l.company_name)}')">Iniciar Levantamento</button>
                <button class="btn" onclick="forceCloseModal()">Fechar</button>
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
        h.textContent = 'Levantamentos';
        a.innerHTML = '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const assessments = await api('GET', '/api/v1/assessments');
            console.log('Assessments loaded:', assessments);
            if (!Array.isArray(assessments) || assessments.length === 0) {
                c.innerHTML = '<div class="card fade-in"><div class="empty-state" style="padding:2rem;text-align:center;color:var(--muted)">Nenhum levantamento encontrado.</div></div>';
                return;
            }
            c.innerHTML = `
                <div class="card fade-in">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>Status</th>
                                        <th>Criado em</th>
                                <th style="text-align:right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${assessments.map(as => {
                                const date = as.created_at ? as.created_at.split(' ')[0] : '---';
                                return `
                                <tr>
                                    <td style="font-weight:500">${escapeHTML(as.client_name || 'Sem nome')}</td>
                                    <td><span class="status-badge status-${as.status || 'in_progress'}">${as.status || 'Em andamento'}</span></td>
                                    <td>${date}</td>
                                    <td style="text-align:right">
                                        <button class="btn" onclick="openAssessmentDetail('${as.id}')">Gerenciar</button>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
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
        a.innerHTML = '<button class="btn" onclick="navigate(\'assessments\')">&larr; Voltar</button>';
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
                    <div class="wizard-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}" onclick="goToBlock(${idx + 1})">
                        <div class="step-dot"></div>
                        <div class="step-label">Bloco ${b.block}: ${b.title}</div>
                        ${isCompleted ? '<span style="margin-left:auto;color:var(--success);font-size:0.6rem">&#10003;</span>' : ''}
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
                            <button class="yesno-btn ${val === 'yes' ? 'yesno-active' : ''}" onclick="setWizardAnswer('${q.key}', 'yes', this)">Sim</button>
                            <button class="yesno-btn ${val === 'no' ? 'yesno-active' : ''}" onclick="setWizardAnswer('${q.key}', 'no', this)">Não</button>
                        </div>
                    `;
                } else if (q.type === 'select' && q.options) {
                    inputHtml = `
                        <div class="ness-select" id="select-${q.key}">
                            <div class="ness-select-trigger" onclick="toggleNessSelect(this)">${val || 'Selecione uma opção'}</div>
                            <div class="ness-select-options">
                                <div class="ness-select-option ${!val ? 'selected' : ''}" onclick="selectNessOption(this, '${q.key}', '')">Selecione uma opção</div>
                                ${q.options.map(o => `
                                    <div class="ness-select-option ${val === o ? 'selected' : ''}" onclick="selectNessOption(this, '${q.key}', '${escapeHTML(o)}')">${escapeHTML(o)}</div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                } else if (q.type === 'multi' && q.options) {
                    inputHtml = `
                        <div class="multi-chips" data-key="${q.key}">
                            ${q.options.map(o => {
                                const active = (val || '').split('||').includes(o);
                                return `<div class="chip ${active ? 'chip-active' : ''}" onclick="toggleWizardChip(this, '${q.key}')">${escapeHTML(o)}</div>`;
                            }).join('')}
                        </div>
                    `;
                } else {
                    inputHtml = `<input type="text" class="form-input wizard-input" data-key="${q.key}" value="${escapeHTML(val)}" oninput="setWizardAnswer('${q.key}', this.value)" placeholder="Sua resposta...">`;
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
                            ${as.status !== 'converted' ? `<button class="btn btn-primary" style="width:100%" onclick="promoteToProject('${as.id}')">ðŸš€ Converter para Projeto</button>` : '<div class="ctx-tag ctx-tag-green" style="text-align:center">Projeto Ativo</div>'}
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
                                <button class="btn" onclick="goToBlock(${S.currentBlock - 1})" ${S.currentBlock === 1 ? 'style="display:none"' : ''}>Anterior</button>
                                <div style="margin-left:auto; display:flex; gap:0.5rem">
                                    <button class="btn btn-primary" onclick="goToBlock(${S.currentBlock + 1})" style="padding: 0.75rem 2.5rem; font-size: 0.75rem; box-shadow: 0 4px 15px rgba(0,173,232,0.3)">${S.currentBlock === ASSESSMENT_BLOCKS.length ? 'Gravar e Finalizar' : 'Gravar e Continuar'}</button>
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

    async function renderProposals(c, h, a) {
        h.textContent = 'Propostas';
        a.innerHTML = '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const [assessments, proposals, leads] = await Promise.all([
                api('GET', '/api/v1/assessments'),
                api('GET', '/api/v1/proposals').catch(() => []),
                api('GET', '/api/v1/leads').catch(() => [])
            ]);

            // Section 1: Gerar Nova Proposta (from assessments)
            let gerarHtml = '';
            if (Array.isArray(assessments) && assessments.length > 0) {
                gerarHtml = `
                <div class="card fade-in" style="margin-bottom:1.5rem">
                    <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Gerar Nova Proposta</h3>
                    <table class="data-table">
                        <thead><tr><th>Cliente</th><th>Status</th><th style="text-align:right">Acoes</th></tr></thead>
                        <tbody>
                            ${assessments.map(as => `<tr>
                                <td style="font-weight:500">${escapeHTML(as.client_name || 'Sem nome')}</td>
                                <td><span class="status-badge status-${as.status || 'in_progress'}">${as.status || 'Em andamento'}</span></td>
                                <td style="text-align:right">
                                    <button class="btn" onclick="viewPricing('${as.id}')">Precificar</button>
                                    <button class="btn btn-primary" style="margin-left:0.25rem" onclick="generateProposalFromAssessment('${as.id}')">Gerar Proposta</button>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`;
            }

            // Section 2: Propostas Geradas
            let proposalsHtml = '';
            if (Array.isArray(proposals) && proposals.length > 0) {
                proposalsHtml = `
                <div class="card fade-in" style="margin-bottom:1.5rem">
                    <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em">Propostas Geradas</h3>
                    <table class="data-table">
                        <thead><tr><th>Cliente</th><th>CNPJ</th><th>Valor</th><th>Status</th><th>Data</th><th style="text-align:right">Acoes</th></tr></thead>
                        <tbody>
                            ${proposals.map(p => {
                                const nome = p.razao_social || p.company_name || '---';
                                const cnpjFmt = (p.cnpj||'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
                                const data = p.created_at ? p.created_at.split(' ')[0] : '---';
                                const statusCls = p.status === 'Draft' ? 'in_progress' : p.status === 'Sent' ? 'sent' : p.status === 'Signed' ? 'completed' : p.status;
                                return `<tr>
                                    <td style="font-weight:500">${escapeHTML(nome)}</td>
                                    <td style="font-size:0.8rem;color:var(--muted)">${escapeHTML(cnpjFmt||'---')}</td>
                                    <td style="color:var(--accent);font-weight:600">R$ ${(p.total_price||0).toLocaleString('pt-BR')}</td>
                                    <td><span class="status-badge status-${statusCls}">${p.status}</span></td>
                                    <td style="font-size:0.8rem">${data}</td>
                                    <td style="text-align:right">
                                        <button class="btn" onclick="viewSavedProposal('${p.id}')">Ver</button>
                                        ${p.status === 'Draft' ? `<button class="btn" style="margin-left:0.25rem" onclick="updateProposalStatus('${p.id}','Sent')">Enviar</button>` : ''}
                                        ${p.status === 'Sent' ? `<button class="btn btn-primary" style="margin-left:0.25rem" onclick="updateProposalStatus('${p.id}','Signed')">Aprovar</button>` : ''}
                                        <button class="btn" style="margin-left:0.25rem;color:#ff4d4f" onclick="deleteProposal('${p.id}')">Excluir</button>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
            }

            // Section 3: Leads / Pipeline
            let leadsHtml = '';
            if (Array.isArray(leads) && leads.length > 0) {
                leadsHtml = `
                <div class="card fade-in">
                    <h3 style="margin-bottom:1rem;font-family:'Montserrat',sans-serif;font-weight:500;font-size:0.85rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">Pipeline de Leads</h3>
                    <table class="data-table">
                        <thead><tr><th>Empresa</th><th>CNPJ</th><th>Porte / CNAE</th><th>Status</th><th style="text-align:right">Acoes</th></tr></thead>
                        <tbody>
                            ${leads.map(l => {
                                const cnpjFmt = (l.cnpj||'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
                                const scope = [l.porte, l.cnae_fiscal_descricao ? l.cnae_fiscal_descricao.substring(0,30) : ''].filter(Boolean).join(' — ') || '---';
                                return `<tr>
                                    <td style="font-weight:500">${escapeHTML(l.razao_social||l.company_name)}</td>
                                    <td style="font-size:0.8rem;color:var(--muted)">${escapeHTML(cnpjFmt||'---')}</td>
                                    <td style="font-size:0.8rem">${escapeHTML(scope)}</td>
                                    <td><span class="status-badge status-${l.status}">${l.status}</span></td>
                                    <td style="text-align:right"><button class="btn" onclick="openLeadDetail('${l.id}')">Ver</button></td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
            }

            c.innerHTML = (gerarHtml + proposalsHtml + leadsHtml) || '<div class="card fade-in"><div class="empty-state">Nenhuma proposta ou assessment disponivel.</div></div>';
        } catch (e) {
            c.innerHTML = '<div class="error">Erro ao carregar propostas</div>';
        }
    }

    async function viewSavedProposal(id) {
        try {
            const p = await api('GET', '/api/v1/proposals/' + id);
            if (p.content_html) {
                openModal(`
                    <div class="modal-header">
                        <span class="modal-title">Proposta ${escapeHTML(p.status)}</span>
                        <div style="display:flex;gap:0.5rem">
                            <button class="btn" style="font-size:0.6rem;padding:0.3rem 0.75rem;border:1px solid var(--accent);color:var(--accent)" onclick="printProposal()">Imprimir / PDF</button>
                            <button class="btn-ghost" onclick="forceCloseModal()">\u2715</button>
                        </div>
                    </div>
                    <iframe id="proposal-frame" srcdoc="" style="width:100%;height:75vh;border:1px solid var(--border);border-radius:12px;background:#fff"></iframe>
                `, 'modal-large');
                document.getElementById('proposal-frame').srcdoc = p.content_html;
                window.printProposal = () => document.getElementById('proposal-frame').contentWindow.print();
            }
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function updateProposalStatus(id, status) {
        try {
            await api('PUT', '/api/v1/proposals/' + id, { status });
            showToast('Status atualizado para ' + status);
            render();
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function deleteProposal(id) {
        if (!confirm('Excluir esta proposta permanentemente?')) return;
        try {
            await api('DELETE', '/api/v1/proposals/' + id);
            showToast('Proposta excluida');
            render();
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function viewPricing(id) {
        try {
            const p = await api('GET', `/api/v1/assessments/${id}/pricing`);
            window._pricingEco = p.eco || {};
            const eco = p.eco || {};
            const tier = p.tier || {};
            const scope = p.scopeInfo || {};
            const hc = eco.margemPct >= 0.20 ? 'var(--success)' : eco.margemPct >= 0.10 ? 'var(--warning)' : 'var(--danger)';

            const fases = (p.fases || []).map(f => `
                <tr>
                    <td style="font-weight:500">${escapeHTML(f.nome || f.name || f.fase)}</td>
                    <td style="color:var(--muted)">${f.semanas}s</td>
                    <td style="color:var(--muted)">${f.pdNess} PD</td>
                    <td style="color:var(--accent);font-weight:600;text-align:right">R$ ${(f.valorFase/1000).toFixed(1)}k</td>
                </tr>`).join('');

            openModal(`
                <div class="modal-header">
                    <span class="modal-title">Precifica\u00e7\u00e3o \u2014 <span style="color:var(--accent)">${escapeHTML(tier.name)}</span></span>
                    <button class="btn-ghost" onclick="forceCloseModal()">\u2715</button>
                </div>

                <div style="display:flex; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap">
                    <div style="flex:1; min-width:100px; padding:0.75rem 1rem; background:var(--surface); border:1px solid var(--border); border-radius:12px">
                        <div style="font-size:0.45rem; text-transform:uppercase; letter-spacing:0.15em; color:var(--muted); margin-bottom:0.25rem">Score</div>
                        <div style="font-size:1.1rem; font-weight:300; color:var(--text)">${p.score}<span style="font-size:0.65rem;color:var(--muted)">/${p.scoreMax}</span></div>
                    </div>
                    <div style="flex:1; min-width:100px; padding:0.75rem 1rem; background:var(--surface); border:1px solid var(--border); border-radius:12px">
                        <div style="font-size:0.45rem; text-transform:uppercase; letter-spacing:0.15em; color:var(--muted); margin-bottom:0.25rem">Dura\u00e7\u00e3o</div>
                        <div style="font-size:1.1rem; font-weight:300; color:var(--text)">${escapeHTML(tier.duracao)}</div>
                    </div>
                    <div style="flex:1; min-width:100px; padding:0.75rem 1rem; background:var(--surface); border:1px solid var(--border); border-radius:12px">
                        <div style="font-size:0.45rem; text-transform:uppercase; letter-spacing:0.15em; color:var(--muted); margin-bottom:0.25rem">Escopo</div>
                        <div style="font-size:1.1rem; font-weight:300; color:var(--text)">${escapeHTML(scope.label || '< 50')}</div>
                    </div>
                    <div style="flex:1; min-width:100px; padding:0.75rem 1rem; background:var(--surface); border:1px solid var(--border); border-radius:12px">
                        <div style="font-size:0.45rem; text-transform:uppercase; letter-spacing:0.15em; color:var(--muted); margin-bottom:0.25rem">Margem</div>
                        <div style="font-size:1.1rem; font-weight:300; color:${hc}" id="pv-margem-card">${Math.round(eco.margemPct * 100)}%</div>
                    </div>
                </div>

                <div style="text-align:center; margin-bottom:1.5rem">
                    <div style="font-size:2.5rem; font-weight:300; color:var(--accent); letter-spacing:-0.03em" id="pv-price">R$ ${p.precoFinal.toLocaleString('pt-BR')}</div>
                    <div style="font-size:0.5rem; text-transform:uppercase; letter-spacing:0.2em; color:var(--muted); margin:0.5rem 0 1rem">ajuste o valor</div>
                    <input type="range" class="pricing-slider" id="slide-price" min="${Math.round(p.precoFinal * 0.4)}" max="${Math.round(p.precoFinal * 2.5)}" step="500" value="${p.precoFinal}" oninput="pricingSlide()" style="width:80%">
                </div>

                <div style="display:flex; gap:2rem; justify-content:center; margin-bottom:1.5rem; font-size:0.65rem; color:var(--muted)">
                    <span>Receita: <strong style="color:var(--text)" id="pv-receita">R$ ${(eco.receitaLiquida/1000).toFixed(1)}k</strong></span>
                    <span>Custo: <strong style="color:var(--text)">R$ ${(eco.custoTotal/1000).toFixed(1)}k</strong></span>
                    <span>Lucro: <strong id="pv-lucro" style="color:${hc}">R$ ${(eco.margemOp/1000).toFixed(1)}k</strong></span>
                    <span id="pv-status" class="status-badge" style="background:${hc}22;color:${hc};font-size:0.5rem;padding:0.1rem 0.4rem">${eco.margemPct >= 0.20 ? 'Saud\u00e1vel' : 'Ajustar'}</span>
                </div>

                <div style="display:flex; gap:1.5rem; justify-content:center; margin-bottom:1.5rem; font-size:0.55rem; color:var(--muted); opacity:0.7">
                    <span>Base: ${tier.pdNess} PDs</span>
                    <span>Maturidade: x${(p.score / (p.scoreMax||1) * 0.4 + 0.8).toFixed(2)}</span>
                    <span>Escopo: x${scope.fator || '1.0'}</span>
                    <span>Taxa PD: R$ ${eco.taxaBlendada}</span>
                </div>

                <table class="pricing-table">
                    <thead><tr><th>Fase</th><th>Tempo</th><th>Esfor\u00e7o</th><th style="text-align:right">Valor</th></tr></thead>
                    <tbody>${fases}</tbody>
                </table>

                <div style="display:flex; gap:1rem; align-items:flex-end; margin-top:1.5rem">
                    <div style="flex:1">
                        <label class="form-label">N\u00ba da Proposta</label>
                        <input type="text" id="pv-proposal-num" class="form-input" placeholder="Ex: PROP-2026-001" style="padding:0.5rem 0.75rem">
                    </div>
                    <button class="btn btn-primary" style="flex:0 0 auto" onclick="savePricingVal('${id}')">Salvar</button>
                    <button class="btn" style="flex:0 0 auto; border:1px solid var(--accent); color:var(--accent)" onclick="generateProposalFromAssessment('${id}')">Gerar Proposta</button>
                </div>
            `, 'modal-large');

            window.pricingSlide = () => {
                const price = parseInt(document.getElementById('slide-price').value);
                const eco = window._pricingEco;
                const trib = eco.totalTributosPct || 0.15;
                const rec = price - (price * trib);
                const lucro = rec - eco.custoTotal;
                const pct = lucro / price;
                const hc = pct >= 0.20 ? 'var(--success)' : pct >= 0.10 ? 'var(--warning)' : 'var(--danger)';
                document.getElementById('pv-price').textContent = 'R$ ' + price.toLocaleString('pt-BR');
                document.getElementById('pv-receita').textContent = 'R$ ' + (rec/1000).toFixed(1) + 'k';
                document.getElementById('pv-lucro').textContent = 'R$ ' + (lucro/1000).toFixed(1) + 'k';
                document.getElementById('pv-lucro').style.color = hc;
                document.getElementById('pv-margem-card').textContent = Math.round(pct * 100) + '%';
                document.getElementById('pv-margem-card').style.color = hc;
                const st = document.getElementById('pv-status');
                st.textContent = pct >= 0.20 ? 'Saud\u00e1vel' : 'Ajustar';
                st.style.color = hc; st.style.background = hc + '22';
            };

            window.savePricingVal = async (aid) => {
                const price = parseInt(document.getElementById('slide-price').value);
                const proposalNum = document.getElementById('pv-proposal-num').value.trim();
                try {
                    await api('PUT', `/api/v1/assessments/${aid}/pricing`, { precoFinal: price, notas: proposalNum ? `Proposta: ${proposalNum}` : '' });
                    showToast('Salvo!');
                    forceCloseModal();
                } catch(e) { alert(e.message); }
            };

        } catch(e) { alert('Erro: ' + e.message); }
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

    async function generateProposalFromAssessment(id) {
        // Fetch assessment and linked lead data for pre-filling
        let lead = {};
        try {
            const as = await api('GET', '/api/v1/assessments/' + id);
            if (as.lead_id) lead = await api('GET', '/api/v1/leads/' + as.lead_id);
        } catch(e) { console.warn('Could not fetch lead data:', e); }
        const fmtCnpj = (lead.cnpj||'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
        // Step 1: Show prompt form to collect proposal metadata
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Dados da Proposta</span>
                <button class="btn-ghost" onclick="forceCloseModal()">\u2715</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem">
                <div class="form-group">
                    <label class="form-label">N\u00ba da Proposta</label>
                    <input type="text" id="pp-num" class="form-input" placeholder="PROP-2026-001">
                </div>
                <div class="form-group">
                    <label class="form-label">Validade (dias)</label>
                    <input type="number" id="pp-validade" class="form-input" value="30">
                </div>
                <div class="form-group">
                    <label class="form-label">Raz\u00e3o Social do Cliente</label>
                    <input type="text" id="pp-razao" class="form-input" value="${escapeHTML(lead.razao_social||lead.company_name||'')}" placeholder="Empresa Ltda.">
                </div>
                <div class="form-group">
                    <label class="form-label">CNPJ</label>
                    <input type="text" id="pp-cnpj" class="form-input" value="${escapeHTML(fmtCnpj)}" placeholder="00.000.000/0001-00">
                </div>
                <div class="form-group">
                    <label class="form-label">Respons\u00e1vel (Cliente)</label>
                    <input type="text" id="pp-resp-cliente" class="form-input" value="${escapeHTML(lead.contact_name||'')}" placeholder="Nome completo">
                </div>
                <div class="form-group">
                    <label class="form-label">Cargo (Cliente)</label>
                    <input type="text" id="pp-cargo-cliente" class="form-input" placeholder="CTO, CISO, Diretor...">
                </div>
                <div class="form-group">
                    <label class="form-label">Respons\u00e1vel ness.</label>
                    <input type="text" id="pp-resp-ness" class="form-input" value="ness.">
                </div>
                <div class="form-group">
                    <label class="form-label">Cargo ness.</label>
                    <input type="text" id="pp-cargo-ness" class="form-input" value="Lead Consultant">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Condi\u00e7\u00e3o de Pagamento</label>
                <select id="pp-pagamento" class="form-input">
                    <option value="40/30/30">40% kick-off, 30% entrega documental, 30% p\u00f3s-auditoria</option>
                    <option value="50/50">50% kick-off, 50% na conclus\u00e3o</option>
                    <option value="30/30/20/20">30% kick-off, 30% meio, 20% entrega, 20% p\u00f3s-cert</option>
                    <option value="mensal">Parcelas mensais iguais</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Observa\u00e7\u00f5es Adicionais</label>
                <textarea id="pp-obs" class="form-input" rows="2" placeholder="Notas espec\u00edficas para esta proposta..."></textarea>
            </div>
            <button class="btn btn-primary" style="width:100%; margin-top:0.5rem" onclick="submitProposalPrompt('${id}')">Gerar Proposta</button>
        `, 'modal-large');
    }

    async function submitProposalPrompt(id) {
        const meta = {
            proposalNum: document.getElementById('pp-num').value.trim(),
            validade: document.getElementById('pp-validade').value,
            razaoSocial: document.getElementById('pp-razao').value.trim(),
            cnpj: document.getElementById('pp-cnpj').value.trim(),
            respCliente: document.getElementById('pp-resp-cliente').value.trim(),
            cargoCliente: document.getElementById('pp-cargo-cliente').value.trim(),
            respNess: document.getElementById('pp-resp-ness').value.trim(),
            cargoNess: document.getElementById('pp-cargo-ness').value.trim(),
            condicaoPagamento: document.getElementById('pp-pagamento').value,
            observacoes: document.getElementById('pp-obs').value.trim()
        };
        try {
            forceCloseModal();
            showToast('Gerando proposta...');
            const res = await api('POST', `/api/v1/assessments/${id}/generate-proposal`, meta);
            if (res.html) {
                openModal(`
                    <div class="modal-header">
                        <span class="modal-title">Proposta Draft</span>
                        <div style="display:flex;gap:0.5rem">
                            <button class="btn" style="font-size:0.6rem;padding:0.3rem 0.75rem;border:1px solid var(--accent);color:var(--accent)" onclick="printProposal()">Imprimir / PDF</button>
                            <button class="btn-ghost" onclick="forceCloseModal()">\u2715</button>
                        </div>
                    </div>
                    <iframe id="proposal-frame" srcdoc="" style="width:100%;height:80vh;border:1px solid var(--border);border-radius:12px;background:#fff"></iframe>
                `, 'modal-large');
                document.getElementById('proposal-frame').srcdoc = res.html;
                window.printProposal = () => {
                    const oldTitle = document.title;
                    document.title = res.proposal_num || 'Proposta';
                    document.getElementById('proposal-frame').contentWindow.print();
                    document.title = oldTitle;
                };
            } else {
                showToast('Proposta salva com sucesso');
                navigate('proposals');
            }
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
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
                <div style="margin-top:0.5rem;font-size:0.6rem;color:var(--muted)">Bloco ${idx + 1} de ${total}</div>
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
                ${idx > 0 ? '<button class="btn" onclick="ssPrev()">Anterior</button>' : '<div></div>'}
                <button class="btn btn-primary" onclick="ssNext()">${idx < total - 1 ? 'Proximo' : 'Concluir Assessment'}</button>
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
window.renderProposals = renderProposals;
window.viewSavedProposal = viewSavedProposal;
window.updateProposalStatus = updateProposalStatus;
window.deleteProposal = deleteProposal;
window.viewPricing = viewPricing;
window.savePricingOverride = savePricingOverride;
window.generateProposalFromAssessment = generateProposalFromAssessment;
window.submitProposalPrompt = submitProposalPrompt;
window.renderSelfServiceAssessment = renderSelfServiceAssessment;
window.renderSelfServiceBlock = renderSelfServiceBlock;
