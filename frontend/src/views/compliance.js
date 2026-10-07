import { S } from '../state.js';
import { api, API_BASE } from '../api.js';
import { showToast, openModal, closeModal, escapeHTML, traduzStatus } from '../ui.js';
import { navigate } from '../router.js';

    // O id varia por projeto (ctrl-a51, A.5.1, gerado); o código estável é o primeiro token do título.
    function codigoDoControle(ctrl) {
        const m = (ctrl.title || '').match(/^(A\.\d+(?:\.\d+)*)\b/);
        return m ? m[1] : ctrl.id;
    }

    window.carregarCatalogo = async function (projectId) {
        try {
            const r1 = await api('POST', `/api/v1/projects/${projectId}/seed-27001-2022`);
            // O seed 27701 acrescenta a norma em projects.standards: só roda se o projeto já a tem.
            const p = S.currentProject;
            const com27701 = p?.id === projectId && String(p.standards || '').includes('27701');
            const r2 = com27701 ? await api('POST', `/api/v1/projects/${projectId}/seed-27701-2025`) : null;
            await window.loadControls();
            showToast(`Catálogo carregado: ${(r1?.seeded || 0) + (r2?.seeded || 0)} controles novos.`, 'success');
            navigate('controls');
        } catch (e) {
            showToast('Falha ao carregar o catálogo: ' + (e.message || e), 'error');
        }
    };

    function renderControls(c, h, a) {
        h.textContent = 'Controles';
        // Botão do Diagnóstico de Prontidão ("gap em voo") — só com projeto ativo.
        a.innerHTML = S.currentProject
            ? `<button class="btn btn-secondary" data-action="runReadinessCheck" data-args='["${S.currentProject.id}"]'>Diagnóstico de prontidão</button>`
            : '';
        // /controls traz controles de todos os projetos visíveis ao consultor: filtra pelo projeto atual.
        const controls = S.currentProject ? S.controls.filter(x => x.project_id === S.currentProject.id) : S.controls;
        if (!controls.length) {
            const com27701 = String(S.currentProject?.standards || '').includes('27701');
            c.innerHTML = S.currentProject
                ? `<div class="empty-state fade-in"><h3>Nenhum controle carregado</h3><p>Carregue o Anexo A da ISO 27001:2022${com27701 ? ' e os controles de privacidade da ISO 27701:2025' : ''} deste projeto.</p><button class="btn btn-primary" data-action="carregarCatalogo" data-args='["${escapeHTML(S.currentProject.id)}"]'>Carregar catálogo</button></div>`
                : `<div class="empty-state fade-in"><h3>Nenhum controle carregado</h3><p>Escolha um projeto para carregar o catálogo.</p></div>`;
            return;
        }
        c.innerHTML = `<div class="fade-in card" style="padding:0;overflow:hidden">${controls.map(ctrl => `
            <div class="phase-item" data-action="openControlDetail" data-args='["${ctrl.id}"]' style="cursor:pointer">
                <div class="phase-num" style="width:3.5rem;color:var(--accent)">${escapeHTML(codigoDoControle(ctrl))}</div>
                <div style="flex:1">
                    <div class="phase-title">${escapeHTML(ctrl.title)}</div>
                    ${ctrl.maturity ? `<div style="font-size:0.72rem; color:var(--muted)">Maturidade: ${ctrl.maturity}/5</div>` : ''}
                </div>
                <div class="phase-status ${ctrl.status==='Compliant'?'status-done':ctrl.status==='Partial'?'status-progress':'status-pending'}">${escapeHTML(traduzStatus(ctrl.status))}</div>
            </div>`).join('')}</div>`;
    }

    // Diagnóstico de Prontidão (F1): busca o raio-x determinístico e mostra num
    // painel agrupado por categoria, com severidade. É auto-diagnóstico, não
    // auditoria — o rótulo vem do próprio backend e é exibido aqui.
    window.runReadinessCheck = async function (projectId, comIA = false) {
        openModal(`<div class="modal-header"><span class="modal-title">Diagnóstico de prontidão</span><button class="btn-ghost" data-action="closeModal">&times;</button></div><div style="padding:1.5rem 0;text-align:center"><div class="loading"></div>${comIA ? '<p style="font-size:0.75rem;color:var(--muted);margin-top:8px">Analisando com IA…</p>' : ''}</div>`);
        try {
            const r = await api('GET', `/api/v1/projects/${projectId}/readiness-check${comIA ? '?ai=1' : ''}`);
            const cor = { critico: 'var(--danger)', alto: '#e0a800', medio: 'var(--muted)' };
            const rotuloCat = { doc_faltante: 'Documentos faltando', doc_inconsistente: 'Documentos inconsistentes', evidencia_faltante: 'Evidências faltando' };
            const porCat = {};
            (r.achados || []).forEach(a => { (porCat[a.categoria] = porCat[a.categoria] || []).push(a); });
            const grupos = Object.keys(rotuloCat).map(cat => {
                const itens = porCat[cat] || [];
                if (!itens.length) return '';
                return `<h4 style="margin:1rem 0 0.4rem;font-size:0.9rem">${rotuloCat[cat]} (${itens.length})</h4>` + itens.map(a => `
                    <div style="border-left:3px solid ${cor[a.severidade] || 'var(--muted)'};padding:6px 10px;margin:6px 0;background:rgba(255,255,255,0.03)">
                        <div style="font-size:0.68rem;text-transform:uppercase;color:${cor[a.severidade] || 'var(--muted)'}">${escapeHTML(a.severidade)} · ${escapeHTML(a.requisito)} · ${escapeHTML(String(a.referencia))}</div>
                        <div style="font-size:0.85rem;margin-top:2px">${escapeHTML(a.descricao)}</div>
                    </div>`).join('');
            }).join('');
            // Seção de IA (F2): só aparece quando pedida. Marcada como assistida — revisar.
            const obsIA = r.ai_observacoes || [];
            const secaoIA = comIA ? `
                <h4 style="margin:1.2rem 0 0.4rem;font-size:0.9rem">Assistido por IA <span style="font-size:0.75rem;color:var(--muted);text-transform:uppercase">— revisar</span></h4>
                ${obsIA.length ? obsIA.map(a => `
                    <div style="border-left:3px dashed ${cor[a.severidade] || 'var(--muted)'};padding:6px 10px;margin:6px 0;background:rgba(255,255,255,0.03)">
                        <div style="font-size:0.68rem;text-transform:uppercase;color:${cor[a.severidade] || 'var(--muted)'}">${escapeHTML(a.severidade)} · ${escapeHTML(a.requisito)} · ${escapeHTML(String(a.referencia))}</div>
                        <div style="font-size:0.85rem;margin-top:2px">${escapeHTML(a.descricao)}</div>
                    </div>`).join('') : '<p style="color:var(--muted);font-size:0.85rem">Nenhuma inconsistência de conteúdo apontada pela IA.</p>'}` : '';
            const botaoIA = comIA ? '' : `<button class="btn btn-secondary" style="margin-top:0.8rem" data-action="runReadinessCheck" data-args='["${projectId}",true]'>Analisar com IA</button>`;
            openModal(`
                <div class="modal-header"><span class="modal-title">Diagnóstico de prontidão</span><button class="btn-ghost" data-action="closeModal">&times;</button></div>
                <div style="padding:0.5rem 0;text-align:left">
                    <p style="font-size:0.72rem;color:var(--muted);margin-bottom:0.6rem">${escapeHTML(r.rotulo || '')}</p>
                    <div style="display:flex;gap:16px;margin-bottom:0.4rem;font-size:0.85rem">
                        <span style="color:var(--danger)"><strong>${r.resumo.critico}</strong> crítico</span>
                        <span style="color:#e0a800"><strong>${r.resumo.alto}</strong> alto</span>
                        <span style="color:var(--muted)"><strong>${r.resumo.medio}</strong> médio</span>
                    </div>
                    ${r.resumo.total ? grupos : '<p style="color:var(--muted)">Nenhum gap encontrado nas verificações automáticas.</p>'}
                    ${secaoIA}
                    ${botaoIA}
                </div>`);
        } catch (e) {
            closeModal();
            showToast('Falha no diagnóstico: ' + e.message, 'error');
        }
    };

    function openControlDetail(controlId) {
        const ctrl = S.controls.find(c => c.id === controlId);
        if (!ctrl) return;

        openModal(`
            <div class="modal-header">
                <span class="modal-title">${ctrl.id}: ${escapeHTML(ctrl.title)}</span>
                <button class="btn-ghost" data-action="closeModal">&times;</button>
            </div>
            <div style="margin-bottom: 1.5rem;">
                <div class="ctx-label">Descrição</div>
                <div style="font-size: 0.85rem; color: var(--muted); margin-bottom: 1.5rem; line-height: 1.4">${escapeHTML(ctrl.description || 'Nenhuma descrição.')}</div>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                    <div>
                        <div class="ctx-label">Status do Controle</div>
                        <select class="form-input" data-action-change="updateControlStatus" data-args='["${ctrl.id}"]' data-arg-val style="width:100%">
                            <option value="Missing" ${ctrl.status === 'Missing' ? 'selected' : ''}>Ausente</option>
                            <option value="Partial" ${ctrl.status === 'Partial' ? 'selected' : ''}>Parcial</option>
                            <option value="Compliant" ${ctrl.status === 'Compliant' ? 'selected' : ''}>Conforme</option>
                        </select>
                    </div>
                    <div>
                        <div class="ctx-label">Maturidade (CMM 0-5)</div>
                        <div style="display:flex; align-items:center; gap: 1rem; background:rgba(255,255,255,0.03); padding:0.5rem; border-radius:8px">
                            <input type="range" min="0" max="5" step="1" value="${ctrl.maturity || 0}" 
                                data-action-input="__syncSiblingText"
                                data-action-change="updateControlMaturity" data-args='["${ctrl.id}"]' data-arg-val
                                style="flex:1">
                            <span style="font-weight:700; color:var(--accent); min-width:1rem">${ctrl.maturity || 0}</span>
                        </div>
                    </div>
                </div>

                <div class="ctx-label">Evidências Vinculadas</div>
                <div id="control-evidence-list" class="card" style="padding:0; margin-bottom: 1.5rem; max-height: 150px; overflow-y: auto; background: rgba(0,0,0,0.2)">
                    <div style="padding:1rem; text-align:center; color:var(--muted); font-size:0.75rem">Carregando evidências...</div>
                </div>
                
                <div class="ctx-label" id="control-trilha-label">Histórico</div>
                <div id="control-trilha" style="margin-bottom:1.5rem">
                    <div style="padding:1rem;text-align:center;color:var(--muted);font-size:0.75rem">Carregando histórico...</div>
                </div>

                <div style="display:flex; gap:0.75rem">
                    <button class="btn btn-primary" style="flex:1" data-action="generatePolicyForControl" data-args='["${ctrl.id}"]'>Gerar Política AI</button>
                    <button class="btn" style="flex:1" data-action="openEvidenceUploadModal" data-args='["${S.currentProject?.id}","${ctrl.id}"]'>Upload Evidência</button>
                </div>
            </div>
        `);
        loadControlEvidence(ctrl.id);
        loadControlTrilha(ctrl.id);
    }

    /**
     * Histórico do controle: `campo: antes → depois`, autor, quando e o marcador
     * de lote. O backend já gravava a trilha por campo; faltava exibir.
     */
    async function loadControlTrilha(controlId) {
        const alvo = document.getElementById('control-trilha');
        if (!alvo) return;
        let registros = [];
        try {
            const res = await api('GET', `/api/v1/controls/${controlId}/trilha`);
            registros = Array.isArray(res) ? res : (res.registros || []);
        } catch (e) {
            alvo.innerHTML = `<div style="font-size:0.75rem;color:var(--text-dim)">Não foi possível carregar o histórico.</div>`;
            return;
        }

        const rotulo = document.getElementById('control-trilha-label');
        if (rotulo) rotulo.textContent = `Histórico · ${registros.length}`;

        if (!registros.length) {
            alvo.innerHTML = `<div style="font-size:0.75rem;color:var(--text-dim)">Sem alterações registradas neste controle.</div>`;
            return;
        }

        alvo.innerHTML = `
            <div style="border:1px solid var(--border)">
                ${registros.map(r => `
                    <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12.5px;color:var(--text-2)">
                        <div><strong style="color:var(--text);font-weight:500">${escapeHTML(r.campo || 'alteração')}</strong>:
                            ${escapeHTML(r.antes ?? '—')} <span style="color:var(--text-dim)">→</span> ${escapeHTML(r.depois ?? '—')}</div>
                        <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:4px">
                            ${escapeHTML(r.autor || 'sistema')} · ${escapeHTML(tempoRelativo(r.quando))}${r.itensNaOperacao > 1 ? ` · em lote (${r.itensNaOperacao} campos)` : ''}
                        </div>
                    </div>`).join('')}
            </div>
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:8px">imutável · exportável no relatório de auditoria</div>`;
    }
    window.loadControlTrilha = loadControlTrilha;

    /** "há 12 dias" lê melhor que um carimbo ISO no meio de uma lista. */
    function tempoRelativo(quando) {
        const t = Date.parse(String(quando || '').replace(' ', 'T') + (String(quando || '').includes('Z') ? '' : 'Z'));
        if (!Number.isFinite(t)) return String(quando || '');
        const seg = Math.max(0, Math.floor((Date.now() - t) / 1000));
        if (seg < 60) return 'agora há pouco';
        const min = Math.floor(seg / 60);
        if (min < 60) return `há ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
        const h = Math.floor(min / 60);
        if (h < 24) return `há ${h} ${h === 1 ? 'hora' : 'horas'}`;
        const d = Math.floor(h / 24);
        return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
    }
    window.tempoRelativo = tempoRelativo;

    async function updateControlStatus(id, status) {
        try {
            await api('PUT', `/api/v1/controls/${id}/status`, { status });
            await loadControls();
            // Do not close modal, just refresh background
        } catch(e) { alert(e.message); }
    }

    window.updateControlMaturity = async function(id, maturity) {
        try {
            await api('PUT', `/api/v1/controls/${id}/maturity`, { maturity: parseInt(maturity) });
            showToast('Maturidade atualizada com sucesso!');
            const c = document.getElementById('main-content');
            const h = document.getElementById('header-title');
            const a = document.getElementById('header-actions');
            if (S.view === 'soa') {
                renderSoA(c, h, a);
            } else {
                await loadControls();
            }
        } catch(e) { alert(e.message); }
    };

    async function loadControlEvidence(controlId) {
        const listEl = document.getElementById('control-evidence-list');
        if (!listEl) return;
        try {
            const evidences = await api('GET', `/api/v1/projects/${S.currentProject?.id}/evidence`);
            const filtered = evidences.filter(e => e.control_id === controlId);
            if (!filtered.length) {
                listEl.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--muted); font-size:0.75rem">Nenhuma evidência vinculada.</div>';
                return;
            }
            listEl.innerHTML = filtered.map(e => `
                <div style="padding:0.6rem 1rem; border-bottom:1px solid rgba(255,255,255,0.03); display:flex; justify-content:space-between; align-items:center">
                    <div>
                        <div style="font-size:0.8rem; font-weight:500">${escapeHTML(e.filename)}</div>
                        <div style="font-size:0.72rem; color:var(--muted)">${e.evaluation_status || 'pendente'}</div>
                    </div>
                    <button class="btn-ghost" data-action="viewEvidence" data-args='["${e.id}"]' style="padding:0.25rem">Ver</button>
                </div>
            `).join('');
        } catch(e) { listEl.innerHTML = `<div style="padding:1rem; color:var(--danger)">Erro ao carregar.</div>`; }
    }

    async function generatePolicyForControl(controlId) {
        const btn = event.target;
        const oldText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Gerando...';
        try {
            const res = await api('POST', `/api/v1/projects/${S.currentProject?.id}/generate-policy`, { control_id: controlId });
            alert('Política gerada com sucesso! Verifique o Log de Atividade.');
            closeModal();
        } catch(e) { alert(e.message); }
        finally { btn.disabled = false; btn.textContent = oldText; }
    }

    function toggleChip(el, key) {
        el.classList.toggle('chip-active');
        const container = el.closest('.multi-chips');
        const selected = [...container.querySelectorAll('.chip-active')].map(c => c.textContent);
        S.blockAnswers[key] = selected.join('||');
        updateContextPanel();
    }

    function setYesNo(el, key, val) {
        const group = el.closest('.yesno-group');
        group.querySelectorAll('.yesno-btn').forEach(b => b.classList.remove('yesno-active'));
        el.classList.add('yesno-active');
        S.blockAnswers[key] = val;
        updateContextPanel();
    }

    function getControlSubSection(ctrl) {
        const title = ctrl.title || '';
        const id = ctrl.id || '';
        const standard = ctrl.standard || '';
        
        if (standard.includes('27001')) {
            if (id.includes('-a5') || title.includes('A.5.')) {
                return { code: 'A.5', name: 'Controles Organizacionais', label: 'A.5' };
            }
            if (id.includes('-a6') || title.includes('A.6.')) {
                return { code: 'A.6', name: 'Controles de Pessoas', label: 'A.6' };
            }
            if (id.includes('-a7') || title.includes('A.7.')) {
                return { code: 'A.7', name: 'Controles Físicos', label: 'A.7' };
            }
            if (id.includes('-a8') || title.includes('A.8.')) {
                return { code: 'A.8', name: 'Controles Tecnológicos', label: 'A.8' };
            }
        } else if (standard.includes('27701')) {
            if (id.includes('-a') || title.includes('A.') || ctrl.role === 'Controller') {
                return { code: 'P.C', name: 'Diretrizes para Controladores', label: 'PIMS Controller' };
            }
            if (id.includes('-b') || title.includes('B.') || ctrl.role === 'Processor') {
                return { code: 'P.P', name: 'Diretrizes para Operadores', label: 'PIMS Processor' };
            }
            return { code: 'P.G', name: 'Diretrizes Gerais de Privacidade', label: 'PIMS Geral' };
        }
        return { code: 'Other', name: 'Outros Controles', label: 'Geral' };
    }

    const CONTROL_TITLES_PT = {
        'A.5.1': 'Políticas de segurança da informação',
        'A.5.2': 'Papéis e responsabilidades na segurança da informação',
        'A.5.3': 'Segregação de funções',
        'A.5.4': 'Responsabilidades da direção',
        'A.5.5': 'Contato com autoridades',
        'A.5.6': 'Contato com grupos de interesse especial',
        'A.5.7': 'Inteligência sobre ameaças (Threat Intelligence)',
        'A.5.8': 'Segurança da informação na gestão de projetos',
        'A.5.9': 'Inventário de ativos de informação e outros associados',
        'A.5.10': 'Uso aceitável de ativos de informação e outros associados',
        'A.5.11': 'Devolução de ativos',
        'A.5.12': 'Classificação da informação',
        'A.5.13': 'Rotulagem da informação',
        'A.5.14': 'Transferência de informação',
        'A.5.15': 'Controle de acesso',
        'A.5.16': 'Gestão de identidades',
        'A.5.17': 'Informações de autenticação',
        'A.5.18': 'Direitos de acesso',
        'A.5.19': 'Segurança da informação no relacionamento com fornecedores',
        'A.5.20': 'Tratamento da segurança nos acordos com fornecedores',
        'A.5.21': 'Gestão da segurança na cadeia de suprimentos de TIC',
        'A.5.22': 'Monitoramento e gestão de mudanças em fornecedores',
        'A.5.23': 'Segurança da informação no uso de serviços em nuvem',
        'A.5.24': 'Planejamento e preparação para gestão de incidentes',
        'A.5.25': 'Avaliação e decisão sobre eventos de segurança',
        'A.5.26': 'Resposta a incidentes de segurança da informação',
        'A.5.27': 'Aprendizado com incidentes de segurança',
        'A.5.28': 'Coleta de evidências de incidentes',
        'A.5.29': 'Segurança da informação durante interrupções',
        'A.5.30': 'Prontidão de TIC para continuidade dos negócios',
        'A.5.31': 'Requisitos legais, regulatórios e contratuais',
        'A.5.32': 'Direitos de propriedade intelectual',
        'A.5.33': 'Proteção de registros da organização',
        'A.5.34': 'Privacidade e proteção de dados pessoais (LGPD)',
        'A.5.35': 'Análise crítica independente da segurança da informação',
        'A.5.36': 'Conformidade com políticas e normas de segurança',
        'A.5.37': 'Procedimentos operacionais documentados',
        'A.6.1': 'Seleção e triagem de candidatos (Background Check)',
        'A.6.2': 'Termos e condições de contratação',
        'A.6.3': 'Conscientização, educação e treinamento em segurança',
        'A.6.4': 'Processo disciplinar',
        'A.6.5': 'Responsabilidades após término ou alteração contratual',
        'A.6.6': 'Acordos de confidencialidade e não divulgação (NDA)',
        'A.6.7': 'Trabalho remoto e teletrabalho',
        'A.6.8': 'Notificação de eventos de segurança da informação',
        'A.7.1': 'Perímetros de segurança física',
        'A.7.2': 'Entrada física e controles de acesso',
        'A.7.3': 'Proteção de escritórios, salas e instalações',
        'A.7.4': 'Monitoramento da segurança física',
        'A.7.5': 'Proteção contra ameaças físicas e ambientais',
        'A.7.6': 'Trabalho em áreas seguras',
        'A.7.7': 'Política de mesa limpa e tela limpa',
        'A.7.8': 'Posicionamento e proteção de equipamentos',
        'A.7.9': 'Segurança de ativos fora das instalações',
        'A.7.10': 'Mídias de armazenamento de dados',
        'A.7.11': 'Infraestrutura de apoio e utilidades (Energia/Nobreak)',
        'A.7.12': 'Segurança do cabeamento de rede e energia',
        'A.7.13': 'Manutenção de equipamentos',
        'A.7.14': 'Descarte ou reutilização segura de equipamentos',
        'A.8.1': 'Dispositivos de usuário final',
        'A.8.2': 'Privilégios de acesso aos sistemas',
        'A.8.3': 'Restrição de acesso à informação',
        'A.8.4': 'Acesso ao código-fonte de programas',
        'A.8.5': 'Autenticação segura',
        'A.8.6': 'Gestão de capacidade dos recursos',
        'A.8.7': 'Proteção contra malware e códigos maliciosos',
        'A.8.8': 'Gestão de vulnerabilidades técnicas',
        'A.8.9': 'Gestão de configuração e hardening',
        'A.8.10': 'Exclusão segura de informações',
        'A.8.11': 'Mascaramento de dados e anonimização',
        'A.8.12': 'Prevenção contra vazamento de dados (DLP)',
        'A.8.13': 'Cópia de segurança das informações (Backup)',
        'A.8.14': 'Redundância das instalações de processamento',
        'A.8.15': 'Registros de eventos e auditoria (Logging)',
        'A.8.16': 'Atividades de monitoramento de sistemas',
        'A.8.17': 'Sincronização de relógios (NTP)',
        'A.8.18': 'Uso de utilitários privilegiados',
        'A.8.19': 'Instalação de software nos sistemas operacionais',
        'A.8.20': 'Segurança em redes de computadores',
        'A.8.21': 'Segurança dos serviços de rede',
        'A.8.22': 'Segregação de redes de comunicação',
        'A.8.23': 'Filtragem de tráfego web',
        'A.8.24': 'Uso de criptografia',
        'A.8.25': 'Ciclo de vida de desenvolvimento seguro (SDLC)',
        'A.8.26': 'Requisitos de segurança em aplicações',
        'A.8.27': 'Engenharia de sistemas seguros',
        'A.8.28': 'Codificação segura (Secure Coding)',
        'A.8.29': 'Testes de segurança no desenvolvimento',
        'A.8.30': 'Desenvolvimento terceirizado de software',
        'A.8.31': 'Separação de ambientes de desenvolvimento, teste e produção',
        'A.8.32': 'Gestão de mudanças nos sistemas e infraestrutura',
        'A.8.33': 'Informações de teste e proteção de dados de homologação',
        'A.8.34': 'Proteção de sistemas durante testes de auditoria'
    };

    const ENGLISH_TITLE_TRANSLATIONS = {
        'policies for information security': 'Políticas de segurança da informação',
        'acceptable use of information and other associated assets': 'Uso aceitável de ativos de informação e outros associados',
        'return of assets': 'Devolução de ativos',
        'classification of information': 'Classificação da informação',
        'labelling of information': 'Rotulagem da informação',
        'information transfer': 'Transferência de informação',
        'access control': 'Controle de acesso',
        'identity management': 'Gestão de identidades',
        'authentication information': 'Informações de autenticação',
        'access rights': 'Direitos de acesso',
        'information security in supplier relationships': 'Segurança da informação no relacionamento com fornecedores',
        'addressing information security within supplier agreements': 'Tratamento da segurança nos acordos com fornecedores',
        'managing information security in the ICT supply chain': 'Gestão da segurança na cadeia de suprimentos de TIC',
        'monitoring, review and change management of supplier services': 'Monitoramento e gestão de mudanças em fornecedores',
        'information security for use of cloud services': 'Segurança da informação no uso de serviços em nuvem',
        'information security incident management planning and preparation': 'Planejamento e preparação para gestão de incidentes',
        'assessment and decision on information security events': 'Avaliação e decisão sobre eventos de segurança',
        'response to information security incidents': 'Resposta a incidentes de segurança da informação',
        'learning from information security incidents': 'Aprendizado com incidentes de segurança',
        'collection of evidence': 'Coleta de evidências de incidentes',
        'information security during disruption': 'Segurança da informação durante interrupções',
        'ict readiness for business continuity': 'Prontidão de TIC para continuidade dos negócios',
        'legal, statutory, regulatory and contractual requirements': 'Requisitos legais, regulatórios e contratuais',
        'intellectual property rights': 'Direitos de propriedade intelectual',
        'protection of records': 'Proteção de registros da organização',
        'privacy and protection of personally identifiable information': 'Privacidade e proteção de dados pessoais (LGPD)',
        'independent review of information security': 'Análise crítica independente da segurança da informação',
        'compliance with policies, rules and standards for information security': 'Conformidade com políticas e normas de segurança',
        'documented operating procedures': 'Procedimentos operacionais documentados'
    };

    const JUSTIFICATION_TRANSLATIONS = {
        'universal isms requirement.': 'Requisito universal do SGSI (ISO 27001).',
        'required for clear accountability.': 'Necessário para atribuição clara de responsabilidades.',
        'prevents fraud and error through duty separation.': 'Previne fraudes e erros mediante segregação de funções.',
        'management commitment is foundational to isms.': 'O comprometimento da direção é fundamental para o SGSI.',
        'required for incident reporting and compliance.': 'Necessário para notificação de incidentes e conformidade legal.',
        'threat intelligence and best practice sharing.': 'Compartilhamento de inteligência sobre ameaças e boas práticas.',
        'proactive threat awareness is universally beneficial.': 'Conscientização proativa sobre ameaças é universalmente aplicável.',
        'security must be embedded in all projects.': 'A segurança deve estar embutida em todos os projetos.',
        'asset inventory is foundational to risk management.': 'Inventário de ativos é a base da gestão de riscos.',
        'defines acceptable behavior for all personnel.': 'Define o uso aceitável de recursos para todos os colaboradores.',
        'required for personnel offboarding.': 'Obrigatório no processo de desligamento de colaboradores.',
        'data classification drives proportional protection.': 'A classificação orienta a proteção proporcional dos dados.',
        'labelling supports classification enforcement.': 'A rotulagem garante a aplicação prática da classificação.',
        'all organizations transfer information externally.': 'A organização realiza transferência externa de informações.',
        'logical access control is universally required.': 'Controle de acesso lógico é um requisito universal.',
        'unique identity for accountability.': 'Identificação única para rastreabilidade de ações.',
        'credential management is universally required.': 'Gestão de credenciais de autenticação é obrigatória.',
        'provisioning and review of access rights.': 'Concessão e revisão periódica de direitos de acesso.',
        'third-party/vendor relationships identified.': 'Relacionamento com terceiros e fornecedores identificado.',
        'no supplier or third-party relationships identified.': 'Nenhum relacionamento com fornecedores identificado.',
        'contractual security clauses needed for suppliers.': 'Cláusulas contratuais de segurança necessárias em contratos.',
        'no supplier agreements to address.': 'Sem acordos com fornecedores a tratar.',
        'ict supply chain risks identified.': 'Riscos identificados na cadeia de suprimentos de TIC.',
        'no ict supply chain dependencies.': 'Sem dependências na cadeia de suprimentos de TIC.',
        'ongoing supplier oversight required.': 'Monitoramento contínuo dos serviços de fornecedores.',
        'no supplier services to monitor.': 'Sem serviços de fornecedores a monitorar.',
        'cloud infrastructure in use.': 'Infraestrutura e serviços em nuvem em uso.',
        'no cloud services identified.': 'Sem utilização de serviços em nuvem.',
        'incident preparedness is universal.': 'Preparação para resposta a incidentes é obrigatória.',
        'event triage process required.': 'Processo de triagem e avaliação de eventos de segurança.',
        'incident response capability required.': 'Capacidade de resposta e contenção de incidentes.',
        'continuous improvement from incidents.': 'Melhoria contínua a partir de lições aprendidas em incidentes.',
        'evidence preservation for investigations.': 'Coleta e preservação de evidências para investigações.',
        'security continuity during disruptions.': 'Continuidade da segurança da informação durante interrupções.',
        'ict continuity planning is universally needed.': 'Planejamento de continuidade de TIC é necessário.',
        'compliance obligations exist for all organizations.': 'Obrigação de conformidade legal, regulatória e contratual.',
        'ip protection applies to all organizations.': 'Proteção de direitos de propriedade intelectual da organização.',
        'record retention and protection required.': 'Retenção e proteção de registros corporativos obrigatória.',
        'pii processing identified — privacy controls mandatory.': 'Tratamento de dados pessoais identificado — controles LGPD obrigatórios.',
        'no pii processing identified.': 'Sem tratamento de dados pessoais identificado.',
        'independent assurance is an isms requirement.': 'Avaliação independente é requisito para garantia do SGSI.',
        'compliance verification is universal.': 'Verificação contínua de conformidade com políticas.',
        'operational procedures must be documented.': 'Procedimentos operacionais devem ser documentados.',
        'background verification for all personnel.': 'Verificação de antecedentes para todo o pessoal.',
        'security responsibilities in employment contracts.': 'Responsabilidades de segurança em contratos de trabalho.',
        'security awareness is universal.': 'Conscientização em segurança da informação é universal.',
        'consequences for policy violations.': 'Consequências e penalidades para violação de políticas.',
        'post-employment obligations required.': 'Obrigações e responsabilidades após o desligamento.',
        'ndas protect sensitive information.': 'Acordos de confidencialidade (NDA) para proteção de dados.',
        'remote work arrangements identified.': 'Modalidades de trabalho remoto/teletrabalho identificadas.',
        'no remote working arrangements.': 'Sem modalidades de trabalho remoto.',
        'all personnel must be able to report events.': 'Mecanismo de relato de eventos disponível a todos.',
        'physical office/facility identified.': 'Instalação física ou escritório corporativo identificado.',
        'fully remote/cloud — no physical perimeter.': 'Operação 100% remota/nuvem — sem perímetro físico.',
        'physical access control needed for premises.': 'Controle de acesso físico às instalações necessário.',
        'no physical premises requiring entry control.': 'Sem instalações físicas exigindo controle de entrada.',
        'physical spaces require securing.': 'Salas e instalações físicas exigem proteção.',
        'no offices or facilities to secure.': 'Sem escritórios ou instalações físicas a proteger.',
        'monitoring of physical premises required.': 'Monitoramento de segurança física das instalações necessário.',
        'no physical premises to monitor.': 'Sem instalações físicas para monitorar.',
        'environmental protection for facilities.': 'Proteção contra ameaças físicas e ambientais.',
        'no facilities exposed to physical threats.': 'Sem instalações expostas a ameaças físicas.',
        'secure area procedures for sensitive operations.': 'Procedimentos de áreas seguras para operações sensíveis.',
        'no secure areas defined.': 'Sem áreas seguras definidas.',
        'applies to all workstations including remote.': 'Aplica-se a todas as estações de trabalho, incluindo remotas.',
        'equipment in physical premises needs protection.': 'Equipamentos em instalações físicas necessitam de proteção.',
        'no on-premise equipment to protect.': 'Sem equipamentos locais a proteger.',
        'assets used outside premises require protection.': 'Ativos utilizados fora das instalações exigem proteção.',
        'no off-premises asset usage identified.': 'Sem uso de ativos fora das instalações.',
        'media handling applies to all organizations.': 'Manuseio de mídias de armazenamento aplica-se universalmente.',
        'power/cooling for on-premise infrastructure.': 'Energia e utilidades para infraestrutura local.',
        'no on-premise infrastructure requiring utilities.': 'Sem infraestrutura local exigindo utilidades físicas.',
        'physical cabling in premises.': 'Cabeamento físico em instalações corporativas.',
        'no physical cabling to protect.': 'Sem cabeamento físico a proteger.',
        'all equipment requires maintenance.': 'Todo equipamento exige manutenção periódica.',
        'secure disposal applies universally.': 'Descarte e reutilização segura aplicam-se universalmente.',
        'endpoint security is universally required.': 'Segurança de dispositivos finais é requisito universal.',
        'privileged access management is universal.': 'Gestão de acessos privilegiados é obrigatória.',
        'need-to-know access restriction.': 'Restrição de acesso baseada na necessidade de conhecer.',
        'source code access control for development teams.': 'Controle de acesso ao código-fonte para desenvolvedores.',
        'no software development — no source code to protect.': 'Sem desenvolvimento de software — sem código-fonte a proteger.',
        'secure authentication is universal.': 'Mecanismos de autenticação segura são obrigatórios.',
        'resource capacity planning is universal.': 'Planejamento de capacidade de recursos é necessário.',
        'malware protection is universally required.': 'Proteção contra malware é obrigatória.',
        'vulnerability management is universal.': 'Gestão de vulnerabilidades técnicas é necessária.',
        'secure configuration baselines required.': 'Baselines de configuração segura (Hardening) obrigatórios.',
        'data lifecycle management is universal.': 'Gestão do ciclo de vida dos dados é necessária.',
        'sensitive/pii data requires masking in non-production.': 'Dados sensíveis/PII exigem mascaramento em homologação.',
        'no sensitive data requiring masking.': 'Sem dados sensíveis exigindo mascaramento.',
        'dlp needed for sensitive/regulated data.': 'DLP necessário para proteção de dados sensíveis/regulados.',
        'no high-risk data leakage scenarios identified.': 'Sem cenários de alto risco de vazamento identificados.',
        'backup is universally required.': 'Cópia de segurança (Backup) é obrigatória.',
        'critical/regulated operations require redundancy.': 'Operações críticas exigem instalações redundantes.',
        'no critical systems requiring redundancy.': 'Sem sistemas críticos exigindo redundância.',
        'activity logging is universal.': 'Registro de atividades e auditoria (Logging) é obrigatório.',
        'security monitoring is universal.': 'Monitoramento de segurança da informação é obrigatório.',
        'time synchronization for log correlation.': 'Sincronização de relógio (NTP) para correlação de logs.',
        'restricting privileged utilities is universal.': 'Restrição de utilitários privilegiados é obrigatória.',
        'software installation controls are universal.': 'Controle de instalação de softwares é obrigatório.',
        'network security is universally required.': 'Segurança em redes de computadores é obrigatória.',
        'network service security is universal.': 'Segurança dos serviços de rede é obrigatória.',
        'network segmentation for sensitive environments.': 'Segregação de rede para ambientes sensíveis.',
        'no requirement for network segregation identified.': 'Sem requisito de segregação de rede identificado.',
        'web filtering for managed environments.': 'Filtragem de conteúdo web para ambientes gerenciados.',
        'fully remote workforce — web filtering deferred to endpoint controls.': 'Equipe 100% remota — filtragem tratada no dispositivo final.',
        'cryptography for data protection is universal.': 'Uso de criptografia para proteção de dados é obrigatório.',
        'sdlc security for in-house development.': 'Segurança no ciclo de desenvolvimento interno de software.',
        'no software development activities.': 'Sem atividades de desenvolvimento de software.',
        'application security requirements for dev/web apps.': 'Requisitos de segurança em aplicações web/desenvolvidas.',
        'no applications developed or operated.': 'Sem aplicações desenvolvidas ou operadas.',
        'secure architecture for systems in scope.': 'Arquitetura e engenharia de sistemas seguros.',
        'no system engineering activities.': 'Sem atividades de engenharia de sistemas.',
        'secure coding standards for development teams.': 'Padrões de codificação segura para desenvolvimento.',
        'no coding activities identified.': 'Sem atividades de programação identificadas.',
        'security testing in sdlc.': 'Testes de segurança no ciclo de vida de desenvolvimento.',
        'no development requiring security testing.': 'Sem desenvolvimento exigindo testes de segurança.',
        'outsourced development relationships identified.': 'Desenvolvimento terceirizado de software identificado.',
        'no outsourced development.': 'Sem desenvolvimento terceirizado de software.',
        'environment separation for development teams.': 'Separação de ambientes de dev, teste e produção.',
        'no development environments to separate.': 'Sem ambientes de desenvolvimento a separar.',
        'change management is universal.': 'Gestão de mudanças nos sistemas é obrigatória.',
        'test data protection for development activities.': 'Proteção de dados de teste em ambientes de homologação.',
        'no test environments requiring data protection.': 'Sem ambientes de teste exigindo proteção de dados.',
        'audit testing safeguards are universal.': 'Salvaguardas em testes de auditoria são obrigatórias.'
    };

    function parseControlTitle(ctrl) {
        const titleStr = ctrl.title || '';
        let controlCode = ctrl.id || '';
        let controlTitleText = titleStr;
        
        const match = titleStr.match(/^([A-Za-z0-9\.\-\s]+?)\s+(.*)$/);
        if (match) {
            const potentialCode = match[1].trim();
            if (potentialCode.match(/^(A\.\d+|B\.\d+|Cl\s\d+|[0-9\.]+)/)) {
                controlCode = potentialCode;
                controlTitleText = match[2].trim();
            }
        }

        const cleanId = (ctrl.id || controlCode).trim();
        if (CONTROL_TITLES_PT[cleanId]) {
            controlTitleText = CONTROL_TITLES_PT[cleanId];
        } else {
            const lowerTitle = controlTitleText.toLowerCase().trim();
            if (ENGLISH_TITLE_TRANSLATIONS[lowerTitle]) {
                controlTitleText = ENGLISH_TITLE_TRANSLATIONS[lowerTitle];
            }
        }

        return { code: controlCode, title: controlTitleText };
    }

    // ——— SoA: aplicabilidade, ordenação e seleção ————————————————————————

    // Piso de qualidade para justificativa NOVA, digitada por pessoa. NÃO é o
    // critério de bloqueio: a norma exige justificativa, não 40 caracteres. As
    // justificativas de exclusão são curtas de propósito
    // ("No software development activities." tem 35) e travar a exportação por
    // causa delas bloquearia todo projeto já existente sem ganho de conformidade.
    const MIN_NA_JUSTIFICATION = 40;

    /** Tamanho da página da SoA. Paginação explícita, nunca rolagem infinita. */
    const SOA_POR_PAGINA = 25;

    // A numeração do Anexo A é a ordem de leitura do auditor e a ordem do
    // relatório exportado: A.5.7 vem antes de A.5.15, A.8.2 antes de A.8.11.
    // Comparação de string inverte as duas e isso é defeito de conteúdo.
    function compareControlCode(x, y) {
        const seg = s => String(s || '').split(/[.\-_\s]+/).filter(Boolean)
            .map(p => (/^\d+$/.test(p) ? Number(p) : p));
        const A = seg(x), B = seg(y);
        for (let i = 0; i < Math.max(A.length, B.length); i++) {
            const p = A[i], q = B[i];
            if (p === undefined) return -1;
            if (q === undefined) return 1;
            if (typeof p === 'number' && typeof q === 'number') {
                if (p !== q) return p - q;
            } else if (String(p) !== String(q)) {
                return String(p) < String(q) ? -1 : 1;
            }
        }
        return 0;
    }

    function isControlNA(ctrl) {
        return ctrl.status === 'Not Applicable';
    }

    // O bloqueio da norma: exclusão de controle sem justificativa registrada.
    function naSemJustificativa(ctrl) {
        return isControlNA(ctrl) && !(ctrl.description || '').trim();
    }

    window.compareControlCode = compareControlCode;
    window.naSemJustificativa = naSemJustificativa;
    window.MIN_NA_JUSTIFICATION = MIN_NA_JUSTIFICATION;

    async function renderSoA(c, h, a) {
        h.textContent = 'Statement of Applicability (SoA)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) {
            a.innerHTML = '';
            c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Selecione um projeto ativo para visualizar o SoA.</div>';
            return;
        }
        
        a.innerHTML = '';
        // Skeleton nas linhas, não spinner: as colunas já entram dimensionadas,
        // então a tabela não pula quando os dados chegam.
        c.innerHTML = `
            <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:var(--text-dim);margin-bottom:14px">carregando controles de ${escapeHTML(proj.project_name || proj.client_name || 'projeto')}…</div>
            <div class="soa-skeleton">
                ${Array.from({ length: 8 }, () => `
                    <div style="display:flex;gap:10px;align-items:center;padding:12px 10px;border-bottom:1px solid var(--border)">
                        <span class="sk-bar" style="width:74px"></span>
                        <span class="sk-bar" style="flex:1"></span>
                        <span class="sk-bar" style="width:116px"></span>
                        <span class="sk-bar" style="width:66px"></span>
                        <span class="sk-bar" style="width:118px"></span>
                    </div>`).join('')}
            </div>`;

        try {
            const [controls, traceData] = await Promise.all([
                api('GET', `/api/v1/projects/${proj.id}/controls`) || [],
                api('GET', `/api/v1/projects/${proj.id}/traceability`).then(r => (Array.isArray(r) ? r : [])).catch(() => [])
            ]);
            
            const traceMap = {};
            if (Array.isArray(traceData)) {
                traceData.forEach(t => { traceMap[t.id] = t; });
            }
            window.currentSoATraceMap = traceMap;
            window.currentSoAFilter = 'all';
            window.currentSoAControls = controls;
            window.currentSoAProjectId = proj.id;
            window.soaAccordionStates = window.soaAccordionStates || {};
            window.soaSel = new Set();

            let totalApplicable = 0, totalNA = 0, totalJustified = 0;
            const bloqueios = [];

            controls.forEach(ctrl => {
                if (isControlNA(ctrl)) {
                    totalNA++;
                    if (naSemJustificativa(ctrl)) bloqueios.push(ctrl);
                    else totalJustified++;
                } else {
                    totalApplicable++;
                }
            });

            // Exclusão sem justificativa é achado de auditoria: a faixa de bloqueio
            // abaixo e o card de justificativas dizem o motivo.
            const travado = bloqueios.length > 0;
            const motivo = travado
                ? `${bloqueios.length} ${bloqueios.length === 1 ? 'controle N/A está' : 'controles N/A estão'} sem justificativa de exclusão`
                : `Considera o recorte atual (${controls.length} controles)`;
            a.innerHTML = `
                <button class="btn btn-secondary" data-action="runReadinessCheck" data-args='["${proj.id}"]' style="margin-right:8px">Diagnóstico de prontidão</button>
                <button class="btn btn-secondary" data-action="migrate27701" data-args='["${proj.id}"]'>Migrar 27701</button>`;

            const stdGroups = {};
            controls.forEach(ctrl => {
                const std = ctrl.standard || 'ISO 27001:2022';
                if (!stdGroups[std]) stdGroups[std] = {};
                
                const sub = getControlSubSection(ctrl);
                if (!stdGroups[std][sub.code]) {
                    stdGroups[std][sub.code] = {
                        meta: sub,
                        controls: []
                    };
                }
                stdGroups[std][sub.code].controls.push(ctrl);
            });

            // Ordem de leitura do auditor dentro de cada seção.
            Object.values(stdGroups).forEach(subGroups => {
                Object.values(subGroups).forEach(subData => {
                    subData.controls.sort((x, y) =>
                        compareControlCode(parseControlTitle(x).code, parseControlTitle(y).code));
                });
            });

            const statsHtml = window.renderStatCards([
                { label: 'Controles Aplicáveis', value: `${totalApplicable} / ${controls.length}`, color: 'var(--accent)', subtext: `${controls.length > 0 ? ((totalApplicable / controls.length) * 100).toFixed(0) : 0}% de cobertura` },
                { label: 'Controles Não Aplicáveis', value: totalNA, color: 'var(--text-dim)', subtext: 'Exclusões de escopo' },
                { label: 'Justificativas de Exclusão', value: `${totalJustified} / ${totalNA || 1}`, color: travado ? 'var(--danger)' : 'var(--success)', subtext: travado ? 'Pendente' : 'Conforme' }
            ]);

            const faixaBloqueio = travado ? `
                <div class="soa-block-band" role="alert" style="background:rgba(239,68,68,0.10);border-left:2px solid var(--danger);padding:14px 16px;margin-bottom:1.5rem;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
                    <span style="flex:1;min-width:240px;font-size:13px;color:var(--text-2);line-height:1.5">
                        ${escapeHTML(motivo)}. A SoA não pode ser produzida enquanto houver exclusão de escopo sem registro.
                    </span>
                    <button class="btn btn-secondary" data-action="setSoAFilter" data-args='["not_applicable"]'>Ver controles</button>
                </div>` : '';

            let html = `
                ${faixaBloqueio}
                ${statsHtml}
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-bottom:10px;letter-spacing:0.02em">
                    ${controls.length} controles · j/k navega · x seleciona · a alterna tudo · enter abre · esc fecha · ⌘K busca
                </div>

                <div class="soa-filters fade-in" style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:2rem;align-items:center;background:rgba(15,20,35,0.4);border:1px solid var(--border);border-radius:12px;padding:16px;backdrop-filter:var(--glass-blur)">
                    <div style="flex:1;min-width:280px;position:relative">
                        <input type="text" id="soa-search" placeholder="Buscar por ID ou termo..." data-action-input="filterSoATable" style="width:100%;background:rgba(7,11,20,0.5);border:1px solid var(--border);border-radius:10px;padding:8px 12px 8px 36px;color:var(--text);font-size:0.85rem;outline:none" />
                        <svg viewBox="0 0 24 24" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:var(--text-dim);fill:none;stroke-width:1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px">
                        <button class="btn btn-filter active" data-filter="all" data-action="setSoAFilter" data-args='["all"]' style="font-size:0.75rem;padding:6px 12px;background:rgba(0,173,232,0.15);border-color:var(--accent);color:var(--accent)">Todos</button>
                        <button class="btn btn-filter" data-filter="applicable" data-action="setSoAFilter" data-args='["applicable"]' style="font-size:0.75rem;padding:6px 12px;background:var(--surface);border-color:var(--border);color:var(--text)">Aplicáveis</button>
                        <button class="btn btn-filter" data-filter="not_applicable" data-action="setSoAFilter" data-args='["not_applicable"]' style="font-size:0.75rem;padding:6px 12px;background:var(--surface);border-color:var(--border);color:var(--text)">Não Aplicáveis</button>
                        <button class="btn btn-filter" data-filter="gaps" data-action="setSoAFilter" data-args='["gaps"]' style="font-size:0.75rem;padding:6px 12px;background:var(--surface);border-color:var(--border);color:var(--text)">Gaps</button>
                        <button class="btn btn-filter" data-filter="approved" data-action="setSoAFilter" data-args='["approved"]' style="font-size:0.75rem;padding:6px 12px;background:var(--surface);border-color:var(--border);color:var(--text)">Aprovados</button>
                    </div>
                </div>
            `;

            for (const [stdName, subGroups] of Object.entries(stdGroups).sort()) {
                html += `
                    <div style="margin-top:2rem; margin-bottom:1rem; font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.05rem; color:var(--text); letter-spacing:0.5px; display:flex; align-items:center; gap:8px" class="fade-in">
                        <span style="width:4px; height:18px; background:var(--accent); border-radius:2px; display:inline-block"></span>
                        Norma ${escapeHTML(stdName)}
                    </div>
                `;

                for (const [subCode, subData] of Object.entries(subGroups).sort()) {
                    const sectionId = `${stdName}-${subCode}`.replace(/\s+/g, '_');
                    
                    const totalSec = subData.controls.length;
                    let compliantSec = 0;
                    subData.controls.forEach(c => {
                        if (c.status === 'Implemented' || c.status === 'Compliant' || c.status === 'Approved') {
                            compliantSec++;
                        }
                    });
                    const pctSec = totalSec > 0 ? Math.round((compliantSec / totalSec) * 100) : 0;
                    
                    if (window.soaAccordionStates[sectionId] === undefined) {
                        window.soaAccordionStates[sectionId] = (stdName.includes('27001') && subCode === 'A.5');
                    }
                    const isOpen = window.soaAccordionStates[sectionId];

                    html += `
                        <div class="soa-section soa-accordion ${isOpen ? 'active' : ''} fade-in" id="soa-acc-${sectionId}">
                            <div class="soa-accordion-header" data-action="toggleSoAAccordion" data-args='["${sectionId}"]'>
                                <div class="soa-accordion-title">
                                    <span class="code">${escapeHTML(subData.meta.label)}</span>
                                    <span>${escapeHTML(subData.meta.name)}</span>
                                </div>
                                <div class="soa-accordion-meta">
                                    <div class="soa-section-progress-container">
                                        <span>${compliantSec} / ${totalSec} Conformes</span>
                                        <div class="soa-mini-progress">
                                            <div class="soa-mini-progress-fill" style="width: ${pctSec}%"></div>
                                        </div>
                                    </div>
                                    <svg class="soa-accordion-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </div>
                            </div>
                            <div class="soa-accordion-content">
                                <div style="overflow-x:auto; width:100%">
                                    <table class="data-table" style="width:100%; table-layout:fixed">
                                        <thead>
                                            <tr>
                                                <th style="width:34px"><input type="checkbox" class="soa-check-all" aria-label="Selecionar todos os controles desta seção" data-action-change="toggleSoASectionSelection" data-arg-el></th>
                                                <th style="width:75px">ID</th>
                                                <th style="width:220px">Controle</th>
                                                <th style="width:105px">Aplicável?</th>
                                                <th style="width:125px">Status</th>
                                                <th style="width:140px">Rastreabilidade</th>
                                                <th style="width:auto">Justificativa / Notas</th>
                                                <th style="width:110px">Maturidade</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                    `;

                    // Paginação EXPLÍCITA, não rolagem infinita: na SoA o usuário
                    // precisa saber onde está no catálogo. A unidade aqui é a
                    // seção do Anexo A, que é como o auditor lê — e só A.5 (37
                    // controles) e A.8 (34) passam de uma página.
                    window.soaPaginas = window.soaPaginas || {};
                    const mostrados = window.soaPaginas[sectionId] || SOA_POR_PAGINA;
                    const restantes = Math.max(0, subData.controls.length - mostrados);

                    subData.controls.slice(0, mostrados).forEach(ctrl => {
                        const parsed = parseControlTitle(ctrl);
                        const isNA = ctrl.status === 'Not Applicable';
                        const trace = traceMap[ctrl.id] || { risks: [], evidence: [] };
                        const risksCount = (trace.risks || []).length;
                        const evidenceCount = (trace.evidence || []).length;

                        let justVal = ctrl.description || '';
                        if (justVal) {
                            const justKey = justVal.toLowerCase().trim();
                            if (JUSTIFICATION_TRANSLATIONS[justKey]) {
                                justVal = JUSTIFICATION_TRANSLATIONS[justKey];
                            }
                        }
                        const isJustificationMissing = isNA && (!justVal || justVal.trim() === '');

                        html += `
                            <tr id="soa-row-${ctrl.id}" class="soa-row" data-standard="${escapeHTML(ctrl.standard || '')}" data-title="${escapeHTML(ctrl.title || '')}" data-status="${escapeHTML(ctrl.status || 'Missing')}">
                                <td><input type="checkbox" class="soa-check" data-id="${escapeHTML(String(ctrl.id))}" aria-label="Selecionar ${escapeHTML(parsed.code)}" data-action-change="toggleSoASelection" data-args='["${ctrl.id}"]' data-arg-el></td>
                                <td style="font-weight:700;color:var(--accent);font-size:0.8rem;white-space:nowrap;font-variant-numeric:tabular-nums">${escapeHTML(parsed.code)}</td>
                                <td style="font-weight:400;font-size:0.8rem;line-height:1.45;word-break:break-word">${escapeHTML(parsed.title)}</td>
                                <td>
                                    <div class="segmented-control ${isNA ? 'not-applicable' : 'applicable'}" id="seg-toggle-${ctrl.id}">
                                        <button type="button" class="seg-btn ${!isNA ? 'active' : ''}" ${!isNA ? '' : `data-action="toggleSoAApplicability" data-args='["${ctrl.id}","Applicable"]'`}>Sim</button>
                                        <button type="button" class="seg-btn ${isNA ? 'active' : ''}" ${isNA ? '' : `data-action="toggleSoAApplicability" data-args='["${ctrl.id}","Not Applicable"]'`}>Não</button>
                                    </div>
                                </td>
                                <td>
                                    ${window.renderStatusBadge(ctrl.status === 'Implemented' || ctrl.status === 'Approved' ? 'success' : isNA ? 'info' : 'warning', ctrl.status || 'Pendente')}
                                </td>
                                <td>
                                    <div style="display:flex;gap:6px">
                                        <span data-action="showControlRisks" data-args='["${ctrl.id}","${escapeHTML(parsed.code)}"]' class="badge-trace" style="cursor:pointer;background:${risksCount > 0 ? 'rgba(0,173,232,0.12)' : 'rgba(255,255,255,0.02)'};color:${risksCount > 0 ? '#00ade8' : 'var(--text-dim)'};border:1px solid ${risksCount > 0 ? 'rgba(0,173,232,0.2)' : 'var(--border)'};padding:3px 7px;border-radius:6px;font-size:0.7rem;font-weight:600;display:flex;align-items:center;gap:4px" title="${risksCount} risco(s) vinculado(s)">
                                            R: ${risksCount}
                                        </span>
                                        <span data-action="showControlEvidence" data-args='["${ctrl.id}","${escapeHTML(parsed.code)}"]' class="badge-trace" style="cursor:pointer;background:${evidenceCount > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)'};color:${evidenceCount > 0 ? '#10b981' : 'var(--text-dim)'};border:1px solid ${evidenceCount > 0 ? 'rgba(16,185,129,0.15)' : 'var(--border)'};padding:3px 7px;border-radius:6px;font-size:0.7rem;font-weight:600;display:flex;align-items:center;gap:4px" title="${evidenceCount} evidência(s) vinculada(s)">
                                            E: ${evidenceCount}
                                        </span>
                                    </div>
                                    <div style="display:flex;gap:4px;margin-top:4px">
                                        ${ctrl.ciso_approved_by ? `<span class="badge" style="font-size:0.72rem;padding:2px 4px;background:rgba(16,185,129,0.08);color:#10b981;border:1px solid rgba(16,185,129,0.15)" title="Assinado por DPO: ${escapeHTML(ctrl.ciso_approved_by)}">DPO</span>` : ''}
                                        ${ctrl.ceo_approved_by ? `<span class="badge" style="font-size:0.72rem;padding:2px 4px;background:rgba(16,185,129,0.08);color:#10b981;border:1px solid rgba(16,185,129,0.15)" title="Assinado por CEO: ${escapeHTML(ctrl.ceo_approved_by)}">CEO</span>` : ''}
                                    </div>
                                </td>
                                <td>
                                    <input type="text" value="${escapeHTML(justVal)}"
                                        placeholder="${isNA ? 'Justificativa obrigatória para exclusão' : 'Notas do consultor...'}"
                                        class="soa-justification-input ${isJustificationMissing ? 'required-missing' : ''}"
                                        style="width:100%; box-sizing:border-box; background:var(--bg); border:1px solid var(--border); padding:6px 10px; color:var(--text); font-size:0.8rem;"
                                        data-action-blur="__saveSoAJustification" data-args='["${ctrl.id}",${isNA ? 'true' : 'false'}]' data-arg-el />
                                </td>
                                <td>
                                    <!-- Controle fora do escopo não tem grau de implementação: o
                                         seletor fica travado em vez de aceitar um número que
                                         mentiria no relatório. -->
                                    <select data-action-change="updateControlMaturity" data-args='["${ctrl.id}"]' data-arg-val class="custom-select"
                                        ${isNA ? 'disabled title="Controle N/A não tem maturidade: está fora do escopo"' : ''}
                                        style="padding:6px 10px;width:100%;background:var(--bg);color:var(--text);border:1px solid var(--border);font-weight:600;font-size:0.8rem;font-variant-numeric:tabular-nums;cursor:${isNA ? 'not-allowed' : 'pointer'};${isNA ? 'opacity:0.45' : ''}">
                                        ${isNA ? '<option>—</option>' : [0, 1, 2, 3, 4, 5].map(val => `<option value="${val}" ${ctrl.maturity === val ? 'selected' : ''}>CMM ${val}</option>`).join('')}
                                    </select>
                                </td>
                            </tr>
                        `;
                    });

                    html += `
                                        </tbody>
                                    </table>
                                    ${restantes > 0 ? `
                                        <div style="display:flex;align-items:center;gap:12px;padding:14px 10px">
                                            <span style="flex:1;height:1px;background:var(--border)"></span>
                                            <button class="btn btn-secondary" data-action="carregarMaisSoA" data-args='["${sectionId}"]'>
                                                Carregar mais ${Math.min(SOA_POR_PAGINA, restantes)} · ${restantes} ${restantes === 1 ? 'restante' : 'restantes'}
                                            </button>
                                            <span style="flex:1;height:1px;background:var(--border)"></span>
                                        </div>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }
            }
            c.innerHTML = html;
        } catch(e) {
            // Erro precisa dizer que NADA foi gravado, dar o código para o
            // suporte achar a requisição e preservar o que o usuário já filtrou.
            const req = `req ${Math.random().toString(16).slice(2, 6)}-${Math.random().toString(16).slice(2, 5)}`;
            const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const semPermissao = e.status === 403;
            c.innerHTML = semPermissao ? `
                <div style="background:var(--surface);border-left:2px solid var(--text-faint);padding:18px 20px">
                    <h3 style="font-family:var(--font-head);font-weight:600;font-size:17px;margin:0 0 8px">Sem acesso à SoA deste projeto</h3>
                    <p style="font-size:13px;color:var(--text-2);line-height:1.5;margin:0 0 14px">
                        Seu papel não alcança o catálogo de controles deste projeto. Quem tem acesso é o consultor responsável e a gestão do cliente.
                    </p>
                    <button class="btn btn-secondary" data-action="navigate" data-args='["dashboard"]'>Voltar ao início</button>
                </div>` : `
                <div style="background:rgba(239,68,68,0.10);border-left:2px solid var(--danger);padding:18px 20px">
                    <h3 style="font-family:var(--font-head);font-weight:600;font-size:17px;margin:0 0 8px">Não foi possível carregar a SoA</h3>
                    <p style="font-size:13px;color:var(--text-2);line-height:1.5;margin:0 0 6px">
                        ${escapeHTML(e.message)} — <strong>nada foi gravado</strong>. Seus filtros e sua seleção continuam como estavam.
                    </p>
                    <p style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin:0 0 14px">${req} · ${hora} BRT</p>
                    <div style="display:flex;gap:10px;flex-wrap:wrap">
                        <button class="btn btn-primary" data-action="render">Tentar de novo</button>
                        <button class="btn btn-secondary" data-action="copiarCodigoRequisicao" data-args='["${req}"]'>Copiar código</button>
                    </div>
                </div>`;
        }
    }

    // ——— Seleção em lote ————————————————————————————————————————————————
    // Aplicabilidade NUNCA é editável em lote: cada exclusão precisa da própria
    // justificativa. `Marcar N/A` existe na barra apenas para dizer isso.

    function soaSelection() {
        if (!(window.soaSel instanceof Set)) window.soaSel = new Set();
        return window.soaSel;
    }

    window.toggleSoASelection = function(ctrlId, checked) {
        // Pela delegação chega o próprio checkbox (data-arg-el); pelo teclado, o booleano.
        if (typeof checked !== 'boolean') checked = Boolean(checked && checked.checked);
        const sel = soaSelection();
        if (checked) sel.add(String(ctrlId)); else sel.delete(String(ctrlId));
        renderSoABatchBar();
    };

    window.toggleSoASectionSelection = function(checkbox) {
        const tabela = checkbox.closest('table');
        if (!tabela) return;
        tabela.querySelectorAll('tbody tr').forEach(tr => {
            if (tr.style.display === 'none') return;   // respeita o filtro visível
            const box = tr.querySelector('.soa-check');
            if (!box) return;
            box.checked = checkbox.checked;
            window.toggleSoASelection(box.dataset.id, checkbox.checked);
        });
    };

    window.clearSoASelection = function() {
        soaSelection().clear();
        document.querySelectorAll('.soa-check, .soa-check-all').forEach(b => { b.checked = false; });
        renderSoABatchBar();
    };

    function renderSoABatchBar() {
        let bar = document.getElementById('soa-batch-bar');
        const n = soaSelection().size;
        if (!n) { if (bar) bar.remove(); return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'soa-batch-bar';
            bar.className = 'soa-batch-bar';
            document.body.appendChild(bar);
        }
        bar.innerHTML = `
            <span class="soa-batch-count">${n} ${n === 1 ? 'controle selecionado' : 'controles selecionados'}</span>
            <button class="btn btn-primary" data-action="batchMarkImplemented">Marcar implementado</button>
            <button class="btn btn-secondary" disabled style="cursor:not-allowed;opacity:0.5"
                title="Justificativa de exclusão é individual: cada controle N/A precisa da própria.">Marcar N/A</button>
            <button class="btn btn-secondary soa-batch-close" data-action="clearSoASelection" aria-label="Limpar seleção">&#10005;</button>`;
    }

    window.batchMarkImplemented = async function() {
        const ids = Array.from(soaSelection());
        if (!ids.length) return;
        const controls = window.currentSoAControls || [];
        // Guarda o estado anterior ANTES de gravar: desfazer é janela pré-commit,
        // não um delete no histórico.
        const antes = ids.map(id => {
            const ctrl = controls.find(x => String(x.id) === String(id));
            return { id, status: ctrl ? ctrl.status : 'Missing' };
        }).filter(x => x.status !== 'Not Applicable');

        if (!antes.length) {
            showToast('Controles N/A não recebem status: estão fora do escopo', 'error');
            return;
        }

        // Um id de operação para o lote inteiro: é ele que agrupa as linhas da
        // trilha ("em lote") e o que o desfazer marca depois. Sem ele, reverter
        // deixaria duas alterações soltas por controle no histórico.
        const operacao = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        try {
            await Promise.all(antes.map(x => api('PUT', `/api/v1/controls/${x.id}`, { status: 'Implemented' }, { 'X-Operacao': operacao })));
            window.clearSoASelection();
            const n = antes.length;
            showToast(`${n} ${n === 1 ? 'controle marcado' : 'controles marcados'} como implementado`, 'info', async () => {
                try {
                    await Promise.all(antes.map(x => api('PUT', `/api/v1/controls/${x.id}`, { status: x.status }, { 'X-Operacao': operacao })));
                    // Marca a operação como desfeita: a trilha é append-only, e é
                    // a LEITURA que esconde o par. Nenhuma linha é apagada.
                    await Promise.all(antes.map(x =>
                        api('POST', `/api/v1/controls/${x.id}/trilha/desfazer`, { operacao }).catch(() => {})));
                    showToast('Alteração desfeita');
                } catch (e) {
                    showToast('Não foi possível desfazer', 'error');
                }
                render();
            });
            render();
        } catch (e) {
            showToast('Erro ao atualizar os controles selecionados', 'error');
        }
    };

    // ——— Cursor de teclado ————————————————————————————————————————————
    // Índice da linha sob o cursor, dentro do conjunto VISÍVEL do momento.
    let soaCursor = -1;

    function linhasVisiveis() {
        return Array.from(document.querySelectorAll('.soa-row'))
            .filter(tr => tr.style.display !== 'none' && tr.offsetParent !== null);
    }

    function linhaSobCursor() {
        const visiveis = linhasVisiveis();
        return soaCursor >= 0 && soaCursor < visiveis.length ? visiveis[soaCursor] : null;
    }

    function moveSoACursor(passo) {
        const visiveis = linhasVisiveis();
        if (!visiveis.length) return;
        visiveis.forEach(tr => tr.classList.remove('soa-row-cursor'));
        soaCursor = Math.max(0, Math.min(visiveis.length - 1, soaCursor + passo));
        const alvo = visiveis[soaCursor];
        alvo.classList.add('soa-row-cursor');
        alvo.scrollIntoView({ block: 'nearest' });
    }
    window.moveSoACursor = moveSoACursor;
    window.linhasVisiveisSoA = linhasVisiveis;

    // Um único listener no document, instalado uma vez, que só age quando a
    // tela da vez é a SoA — mais barato que montar e desmontar a cada render.
    document.addEventListener('keydown', (e) => {
        if (S.view !== 'soa') return;
        const busca = document.getElementById('soa-search');
        const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');

        if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            busca?.focus();
            busca?.select();
            return;
        }
        if (e.key === '/' && !digitando) {
            e.preventDefault();
            busca?.focus();
            return;
        }
        // Cursor de linha sobre as linhas VISÍVEIS, em ordem de DOM: atravessa
        // as seções abertas, que é como o usuário lê a lista.
        if (!digitando && (e.key === 'j' || e.key === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            moveSoACursor(e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (!digitando && e.key === 'Enter') {
            const linha = linhaSobCursor();
            if (linha) { e.preventDefault(); window.openControlDetail(linha.id.replace('soa-row-', '')); }
            return;
        }
        if (!digitando && (e.key === 'x' || e.key === 'X')) {
            const linha = linhaSobCursor();
            const box = linha?.querySelector('.soa-check');
            if (box) {
                e.preventDefault();
                box.checked = !box.checked;
                window.toggleSoASelection(box.dataset.id, box.checked);
            }
            return;
        }
        if (!digitando && (e.key === 'a' || e.key === 'A') && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            const visiveis = linhasVisiveis();
            const marcarTudo = visiveis.some(tr => !tr.querySelector('.soa-check')?.checked);
            visiveis.forEach(tr => {
                const box = tr.querySelector('.soa-check');
                if (!box) return;
                box.checked = marcarTudo;
                window.toggleSoASelection(box.dataset.id, marcarTudo);
            });
            return;
        }
        if (e.key === 'Escape') {
            // Cascata: o menu de conta é o primeiro da fila e tem listener
            // próprio; aqui só se cuida do campo e da seleção.
            const menu = document.getElementById('account-menu');
            if (menu && !menu.hidden) return;
            if (document.activeElement === busca && busca.value) {
                busca.value = '';
                window.filterSoATable();
                return;
            }
            if (soaSelection().size) window.clearSoASelection();
        }
    });

    window.carregarMaisSoA = function(sectionId) {
        window.soaPaginas = window.soaPaginas || {};
        window.soaPaginas[sectionId] = (window.soaPaginas[sectionId] || SOA_POR_PAGINA) + SOA_POR_PAGINA;
        render();
    };

    window.toggleSoAAccordion = function(sectionId) {
        const el = document.getElementById(`soa-acc-${sectionId}`);
        if (el) {
            const isActive = el.classList.toggle('active');
            window.soaAccordionStates = window.soaAccordionStates || {};
            window.soaAccordionStates[sectionId] = isActive;
        }
    };

    window.setSoAFilter = function(filter) {
        window.currentSoAFilter = filter;
        document.querySelectorAll('.btn-filter').forEach(btn => {
            const isMatch = btn.getAttribute('data-filter') === filter;
            btn.classList.toggle('active', isMatch);
            if (isMatch) {
                btn.style.background = 'rgba(0,173,232,0.15)';
                btn.style.borderColor = 'var(--accent)';
                btn.style.color = 'var(--accent)';
            } else {
                btn.style.background = 'var(--surface)';
                btn.style.borderColor = 'var(--border)';
                btn.style.color = 'var(--text)';
            }
        });
        window.filterSoATable();
    };

    window.filterSoATable = function() {
        const query = (document.getElementById('soa-search')?.value || '').toLowerCase().trim();
        const filter = window.currentSoAFilter || 'all';
        
        const sections = document.querySelectorAll('.soa-section');
        sections.forEach(section => {
            const rows = section.querySelectorAll('tbody tr');
            let visibleRowsCount = 0;
            
            rows.forEach(row => {
                const standard = (row.getAttribute('data-standard') || '').toLowerCase();
                const title = (row.getAttribute('data-title') || '').toLowerCase();
                const status = row.getAttribute('data-status') || '';
                
                const matchesSearch = !query || standard.includes(query) || title.includes(query);
                
                let matchesFilter = true;
                if (filter === 'applicable') {
                    matchesFilter = status !== 'Not Applicable';
                } else if (filter === 'not_applicable') {
                    matchesFilter = status === 'Not Applicable';
                } else if (filter === 'gaps') {
                    matchesFilter = status === 'Missing';
                } else if (filter === 'approved') {
                    matchesFilter = status === 'Approved' || status === 'Implemented';
                }
                
                if (matchesSearch && matchesFilter) {
                    row.style.display = '';
                    visibleRowsCount++;
                } else {
                    row.style.display = 'none';
                }
            });
            
            if (visibleRowsCount > 0) {
                section.style.display = '';
            } else {
                section.style.display = 'none';
            }
        });
    };

    window.showControlRisks = function(controlId, standard) {
        const trace = (window.currentSoATraceMap || {})[controlId] || { risks: [] };
        const risks = trace.risks || [];
        
        let html = `
            <div class="modal-header">
                <span class="modal-title" style="font-family:'Montserrat',sans-serif;font-weight:700;color:var(--accent)">
                    Riscos Vinculados — ${escapeHTML(standard)}
                </span>
                <button class="btn-ghost" data-action="forceCloseModal">Fechar</button>
            </div>
            <div style="margin-top:1rem">
        `;
        
        if (risks.length === 0) {
            html += `<div style="padding:2rem;text-align:center;color:var(--muted)">Nenhum risco vinculado a este controle.</div>`;
        } else {
            html += `
                <div class="data-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Ativo</th>
                                <th>Ameaça</th>
                                <th style="width:100px">Nível</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            risks.forEach(r => {
                const lvl = (r.risk_level || 'Low').toLowerCase();
                let lvlColor = 'var(--success)';
                let lvlBg = 'rgba(34,197,94,0.1)';
                if (lvl === 'medium') { lvlColor = 'var(--warning)'; lvlBg = 'rgba(245,158,11,0.1)'; }
                else if (lvl === 'high' || lvl === 'critical') { lvlColor = 'var(--danger)'; lvlBg = 'rgba(239,68,68,0.1)'; }
                
                html += `
                    <tr>
                        <td style="font-weight:500">${escapeHTML(r.asset)}</td>
                        <td style="color:var(--text-dim)">${escapeHTML(r.threat)}</td>
                        <td>
                            <span class="badge" style="background:${lvlBg};color:${lvlColor};border:1px solid ${lvlColor}33;text-transform:capitalize">
                                ${escapeHTML(r.risk_level || 'Low')}
                            </span>
                        </td>
                    </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        html += `
            <div style="margin-top:2rem;display:flex;justify-content:flex-end">
                <button class="btn" data-action="forceCloseModal">Fechar</button>
            </div>
            </div>
        `;
        
        openModal(html);
    };

    window.showControlEvidence = function(controlId, standard) {
        const trace = (window.currentSoATraceMap || {})[controlId] || { evidence: [] };
        const evidence = trace.evidence || [];
        
        let html = `
            <div class="modal-header">
                <span class="modal-title" style="font-family:'Montserrat',sans-serif;font-weight:700;color:var(--accent)">
                    Evidências Vinculadas — ${escapeHTML(standard)}
                </span>
                <button class="btn-ghost" data-action="forceCloseModal">Fechar</button>
            </div>
            <div style="margin-top:1rem">
        `;
        
        if (evidence.length === 0) {
            html += `<div style="padding:2rem;text-align:center;color:var(--muted)">Nenhuma evidência vinculada a este controle.</div>`;
        } else {
            html += `
                <div class="data-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Arquivo</th>
                                <th style="width:140px">Enviado em</th>
                                <th style="width:160px;text-align:right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            evidence.forEach(e => {
                const dateStr = new Date(e.created_at).toLocaleDateString();
                html += `
                    <tr>
                        <td style="font-weight:500">${escapeHTML(e.file_name)}</td>
                        <td style="color:var(--text-dim)">${dateStr}</td>
                        <td style="text-align:right">
                            <button class="btn btn-ghost" data-action="viewEvidenceDetails" data-args='["${e.id}"]' style="padding:4px 8px;font-size:0.75rem;margin-right:6px">Ver</button>
                            <button class="btn btn-primary" data-action="downloadEvidenceFile" data-args='["${e.id}"]' style="padding:4px 8px;font-size:0.75rem">Download</button>
                        </td>
                    </tr>
                `;
            });
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        html += `
            <div style="margin-top:2rem;display:flex;justify-content:flex-end">
                <button class="btn" data-action="forceCloseModal">Fechar</button>
            </div>
            </div>
        `;
        
        openModal(html);
    };

    window.viewEvidenceDetails = function(evidenceId) {
        viewEvidence(evidenceId);
    };

    window.downloadEvidenceFile = async function(evidenceId) {
        try {
            const projectId = S.activeProject?.id || S.currentProject?.id;
            if (!projectId) return;
            const res = await fetch(`${API_BASE}/api/v1/projects/${projectId}/evidence/${evidenceId}/download`, {
                headers: { 'Authorization': 'Bearer ' + S.token }
            });
            if (!res.ok) throw new Error('Erro ao baixar arquivo');
            const blob = await res.blob();
            
            const contentDisp = res.headers.get('Content-Disposition');
            let filename = 'evidence_file';
            if (contentDisp && contentDisp.includes('filename=')) {
                filename = contentDisp.split('filename=')[1].replace(/"/g, '');
            }
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch(e) {
            showToast('Erro ao baixar evidência: ' + e.message, 'error');
        }
    };

    // Marcar N/A NÃO é um clique: é uma exclusão de escopo, e exclusão sem
    // justificativa registrada é achado de auditoria. O caminho para N/A passa
    // obrigatoriamente pelo bloco de justificativa; voltar para Aplicável é
    // livre, porque não remove nada da SoA.
    window.toggleSoAApplicability = async function(ctrlId, value) {
        if (value === 'Not Applicable') {
            openNAJustificationModal(ctrlId);
            return;
        }
        try {
            await api('PUT', `/api/v1/controls/${ctrlId}`, { status: 'Missing' });
            showToast('Controle voltou a ser aplicável');
            render();
        } catch(e) {
            showToast('Erro ao atualizar aplicabilidade', 'error');
        }
    };

    function openNAJustificationModal(ctrlId) {
        const ctrl = (window.currentSoAControls || []).find(x => String(x.id) === String(ctrlId));
        const parsed = ctrl ? parseControlTitle(ctrl) : { code: '', title: '' };
        openModal(`
            <div style="padding:1.5rem 1.75rem;max-width:520px">
                <div style="font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:0.14em;color:var(--text-dim);margin-bottom:6px">${escapeHTML(parsed.code)}</div>
                <h3 style="font-family:var(--font-head);font-weight:600;font-size:17px;margin:0 0 4px">Excluir do escopo</h3>
                <p style="color:var(--text-2);font-size:13px;margin:0 0 16px;line-height:1.5">${escapeHTML(parsed.title)}</p>
                <div style="background:rgba(245,158,11,0.08);border-left:2px solid var(--warning);padding:14px 16px">
                    <label for="na-why" style="display:block;font-size:12.5px;color:var(--text-2);margin-bottom:8px">Justificativa da exclusão — vai para a SoA e para o relatório de auditoria.</label>
                    <textarea id="na-why" rows="3" data-action-input="updateNACounter"
                        style="width:100%;box-sizing:border-box;min-height:76px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--font-body);font-size:13px;padding:8px 10px;resize:vertical"
                        placeholder="Por que este controle não se aplica ao escopo do SGSI?"></textarea>
                    <div id="na-counter" style="font-family:var(--font-mono);font-size:10px;color:var(--warning);margin-top:6px">0/${MIN_NA_JUSTIFICATION} caracteres mínimos</div>
                </div>
                <p style="color:var(--text-dim);font-size:12px;margin:14px 0 0;line-height:1.5">Confirmar zera a maturidade CMMI e trava o status: um controle fora do escopo não tem grau de implementação.</p>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
                    <button class="btn btn-secondary" data-action="closeModal">Cancelar</button>
                    <button class="btn btn-primary" id="na-confirm" disabled
                        title="Escreva ao menos ${MIN_NA_JUSTIFICATION} caracteres de justificativa"
                        data-action="confirmNA" data-args='["${ctrlId}"]'>Confirmar N/A</button>
                </div>
            </div>
        `);
        setTimeout(() => document.getElementById('na-why')?.focus(), 0);
    }
    window.openNAJustificationModal = openNAJustificationModal;

    window.updateNACounter = function() {
        const ta = document.getElementById('na-why');
        const counter = document.getElementById('na-counter');
        const btn = document.getElementById('na-confirm');
        if (!ta || !counter || !btn) return;
        const n = ta.value.trim().length;
        const ok = n >= MIN_NA_JUSTIFICATION;
        counter.textContent = `${n}/${MIN_NA_JUSTIFICATION} caracteres mínimos`;
        counter.style.color = ok ? 'var(--text-dim)' : 'var(--warning)';
        btn.disabled = !ok;
        btn.title = ok ? 'Registra a exclusão na SoA' : `Escreva ao menos ${MIN_NA_JUSTIFICATION} caracteres de justificativa`;
    };

    window.confirmNA = async function(ctrlId) {
        const why = (document.getElementById('na-why')?.value || '').trim();
        if (why.length < MIN_NA_JUSTIFICATION) return;
        try {
            await api('PUT', `/api/v1/controls/${ctrlId}`, { status: 'Not Applicable', description: why });
            // Controle fora do escopo não tem grau de implementação: a maturidade
            // remanescente mentiria no relatório.
            await api('PUT', `/api/v1/controls/${ctrlId}/maturity`, { maturity: 0 }).catch(() => {});
            closeModal();
            showToast('Controle excluído do escopo, com justificativa registrada');
            render();
        } catch(e) {
            showToast('Erro ao registrar a exclusão', 'error');
        }
    };

    window.copiarCodigoRequisicao = function(req) {
        navigator.clipboard?.writeText(req);
        showToast('Código copiado');
    };

    window.saveSoAJustification = async function(ctrlId, value) {
        const ctrl = (window.currentSoAControls || []).find(x => String(x.id) === String(ctrlId));
        // Apagar a justificativa de um controle N/A é desfazer o registro da
        // exclusão pela porta dos fundos. O campo volta ao valor gravado.
        if (ctrl && isControlNA(ctrl) && !value.trim()) {
            showToast('Controle N/A não pode ficar sem justificativa', 'error');
            render();
            return;
        }
        try {
            await api('PUT', `/api/v1/controls/${ctrlId}`, { description: value });
            if (ctrl) ctrl.description = value;
            showToast('Justificativa salva');
        } catch(e) {
            showToast('Erro ao salvar justificativa', 'error');
        }
    };

    async function renderEvidence(c, h, a) {
        h.textContent = 'Central de Evidências';
        const proj = S.currentProject || S.activeProject || S.projects[0];
        if (!proj) {
            a.innerHTML = '';
            c.innerHTML = '<div class="empty-state fade-in"><h3>Selecione um projeto</h3><p>Acesse um projeto para ver suas evidências.</p></div>';
            return;
        }
        
        a.innerHTML = `<button class="btn btn-primary" data-action="openEvidenceUploadModal" data-args='["${proj.id}"]'>+ Upload Evidência</button>`;

        // As duas rotas devolvem {ok, <lista>}; o api() entrega a lista.
        const lista = (r) => (Array.isArray(r) ? r : []);
        const [evidence, controles] = (await Promise.all([
            api('GET', `/api/v1/projects/${proj.id}/evidence`).catch(() => []),
            api('GET', `/api/v1/projects/${proj.id}/controls`).catch(() => []),
        ])).map(lista);
        const tituloDoControle = Object.fromEntries(controles.map(ctl => [ctl.id, ctl.title || ctl.id]));

        const totalEvidence = evidence.length;
        const dpoSignedCount = evidence.filter(e => e.ciso_approved_by).length;
        const ceoSignedCount = evidence.filter(e => e.ceo_approved_by).length;
        const aiEvaluatedCount = evidence.filter(e => e.evaluation_status && e.evaluation_status !== 'pending').length;

        const statsHtml = window.renderStatCards([
            { label: 'Total de Evidências', value: totalEvidence, color: 'var(--accent)', subtext: 'Arquivos no repositório R2' },
            { label: 'Assinadas DPO', value: dpoSignedCount, color: '#34c759', subtext: 'Aprovação técnica' },
            { label: 'Assinadas CEO', value: ceoSignedCount, color: '#34c759', subtext: 'Aprovação executiva' },
            { label: 'Avaliadas', value: aiEvaluatedCount, color: '#ffcc00', subtext: 'Revisão ou avaliação concluída' }
        ]);

        const isOrgUser = S.user && S.user.role === 'org_user';

        const tableHtml = window.renderDataTable(
            ['Arquivo Evidência', 'Controle', 'Tamanho', 'Hash (SHA-256)', 'Assinatura DPO', 'Assinatura CEO', 'Avaliação', 'Ações'],
            evidence.map(e => {
                const fileName = e.file_name || e.filename || 'Evidência sem nome';
                const fileHash = e.file_hash || e.sha256_hash || '';
                const hashShort = fileHash ? fileHash.substring(0, 16) + '...' : '—';
                const sizeKB = e.file_size ? `${(e.file_size / 1024).toFixed(1)} KB` : '—';

                const dpoBadge = e.ciso_approved_by 
                    ? window.renderStatusBadge(`OK (${escapeHTML(e.ciso_approved_by)})`, 'success') 
                    : window.renderStatusBadge('Pendente', 'neutral');

                const ceoBadge = e.ceo_approved_by 
                    ? window.renderStatusBadge(`OK (${escapeHTML(e.ceo_approved_by)})`, 'success') 
                    : window.renderStatusBadge('Pendente', 'neutral');

                const st = e.evaluation_status || 'pending';
                const avaliacaoBadge = window.renderStatusBadge(traduzStatus(st), st === 'conforming' ? 'success' : st === 'partial' ? 'warning' : st === 'non_conforming' ? 'danger' : 'neutral');

                // Cliente não troca o vínculo (PUT /evidence/:id é escrita fora do allow-list dele).
                const controleCell = isOrgUser
                    ? escapeHTML(e.control_id ? (tituloDoControle[e.control_id] || e.control_id) : '—')
                    : `<select class="form-input" data-action-change="vincularEvidenciaControle" data-args='${JSON.stringify([e.id])}' data-arg-val>
                           <option value="">Sem controle</option>
                           ${controles.map(ctl => `<option value="${escapeHTML(ctl.id)}" ${ctl.id === e.control_id ? 'selected' : ''}>${escapeHTML(ctl.title || ctl.id)}</option>`).join('')}
                       </select>`;

                const dpoBtn = (!e.ciso_approved_by && !isOrgUser)
                    ? `<button class="btn btn-ghost btn-sm" data-action="signEvidence" data-args='["${e.id}","ciso","${escapeHTML(fileHash)}"]'>Assinar DPO</button>`
                    : '';
                const ceoBtn = (!e.ceo_approved_by && !isOrgUser)
                    ? `<button class="btn btn-ghost btn-sm" data-action="signEvidence" data-args='["${e.id}","ceo","${escapeHTML(fileHash)}"]'>Assinar CEO</button>`
                    : '';
                const evalBtn = (!isOrgUser)
                    ? `<button class="btn btn-ghost btn-sm" style="color:var(--accent)" data-action="evaluateEvidenceAI" data-args='["${e.id}"]'>IA</button>`
                    : '';

                return [
                    `<strong>${escapeHTML(fileName)}</strong>`,
                    controleCell,
                    sizeKB,
                    `<code style="font-size:0.75rem;color:var(--text-dim)">${hashShort}</code>`,
                    dpoBadge,
                    ceoBadge,
                    avaliacaoBadge,
                    `<button data-action="downloadEvidenceFile" data-args='["${e.id}"]' class="btn btn-ghost btn-sm">Download</button> ${dpoBtn} ${ceoBtn} ${evalBtn}`
                ];
            }),
            { emptyState: 'Nenhuma evidência enviada para este projeto.' }
        );

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
        `;
    }

    function openEvidenceUploadModal(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Upload de Evidencia</span><button class="btn-ghost" data-action="forceCloseModal">\u00d7</button></div>
            <div class="form-group">
                <label class="form-label">Controle ISO (opcional)</label>
                <input class="form-input" id="ev-control-id" placeholder="Ex: A.5.1, A.8.25">
            </div>
            <div class="form-group">
                <label class="form-label">Arquivo</label>
                <input type="file" id="ev-file" class="form-input" style="padding:0.5rem">
            </div>
            <div id="ev-msg" style="font-size:0.7rem;margin-bottom:0.75rem;color:var(--muted)">Formatos aceitos: PDF, DOCX, XLSX, imagens, logs</div>
            <button class="btn btn-primary" id="btn-ev-upload" style="width:100%" data-action="doEvidenceUpload" data-args='["${projectId}"]'>Enviar Evidencia</button>
        `);
    }

    async function doEvidenceUpload(projectId) {
        const fileInput = document.getElementById('ev-file');
        const controlId = document.getElementById('ev-control-id').value;
        const msg = document.getElementById('ev-msg');
        const btn = document.getElementById('btn-ev-upload');
        if (!fileInput.files.length) { msg.style.color = 'var(--danger)'; msg.textContent = 'Selecione um arquivo'; return; }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        if (controlId) formData.append('control_id', controlId);

        btn.disabled = true;
        btn.textContent = 'Enviando...';
        msg.style.color = 'var(--muted)';
        msg.textContent = 'Calculando SHA-256 e enviando para R2...';

        try {
            const headers = {};
            if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
            const r = await fetch(API_BASE + `/api/v1/projects/${projectId}/evidence/upload`, { method: 'POST', headers, body: formData });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Erro');
            msg.style.color = 'var(--accent)';
            msg.textContent = `Evidencia enviada: ${data.file_name} (SHA-256: ${data.file_hash.substring(0,16)}...)`;
            btn.textContent = 'Enviar outra';
            btn.disabled = false;
            fileInput.value = '';
        } catch(e) {
            msg.style.color = 'var(--danger)';
            msg.textContent = `Erro: ${e.message}`;
            btn.textContent = 'Tentar novamente';
            btn.disabled = false;
        }
    }

    async function renderPoliciesDashboard(c, h, a) {
        h.textContent = 'Gestão de Políticas (A.5.1)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        a.innerHTML = '';
        c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando painel de políticas...</div>';
        
        try {
            const controls = await api('GET', '/api/v1/controls') || [];
            const projectControls = controls.filter(ctrl => ctrl.project_id === proj.id);
            
            const total = projectControls.length;
            const draft = projectControls.filter(ctrl => !ctrl.ciso_approved_by && !ctrl.ceo_approved_by).length;
            const ciso = projectControls.filter(ctrl => ctrl.ciso_approved_by && !ctrl.ceo_approved_by).length;
            const vigentes = projectControls.filter(ctrl => ctrl.ciso_approved_by && ctrl.ceo_approved_by).length;
            
            const statsHtml = window.renderStatCards([
                { label: 'Total de Políticas', value: total, color: 'var(--accent)', subtext: 'Controles no escopo' },
                { label: 'Rascunho / Pendentes', value: draft, color: '#ff3b30', subtext: 'Requer elaboração' },
                { label: 'Aprovadas Líder SGSI', value: ciso, color: '#feca57', subtext: 'Aprovação técnica' },
                { label: 'Aprovadas & Vigentes', value: vigentes, color: '#34c759', subtext: 'Assinatura DPO + CEO' }
            ]);

            const tableHtml = window.renderDataTable(
                ['Controle ID', 'Política / Controle', 'Assinatura Líder SGSI', 'Assinatura Direção', 'Estágio', 'Status SoA', 'Ações'],
                projectControls.map(ctrl => {
                    let stageText = 'Rascunho';
                    let stageType = 'neutral';
                    if (ctrl.ciso_approved_by && ctrl.ceo_approved_by) {
                        stageText = 'Vigente';
                        stageType = 'success';
                    } else if (ctrl.ciso_approved_by) {
                        stageText = 'Revisão Líder SGSI';
                        stageType = 'warning';
                    } else if (ctrl.ceo_approved_by) {
                        stageText = 'Revisão Direção Executiva';
                        stageType = 'warning';
                    }
                    
                    const cisoSign = ctrl.ciso_approved_by ? `<span style="color:var(--success)">${escapeHTML(ctrl.ciso_approved_by)}</span>` : '<span style="color:var(--text-dim)">Pendente</span>';
                    const ceoSign = ctrl.ceo_approved_by ? `<span style="color:var(--success)">${escapeHTML(ctrl.ceo_approved_by)}</span>` : '<span style="color:var(--text-dim)">Pendente</span>';
                    
                    const statusType = (ctrl.status === 'Compliant' || ctrl.status === 'IMPLEMENTED' || ctrl.status === 'Implemented') ? 'success' : (ctrl.status === 'Partial' || ctrl.status === 'PARTIAL') ? 'warning' : 'danger';

                    // Map DB ID back to formatted display ID (e.g. ctrl-a51 -> A.5.1)
                    let displayId = ctrl.id || '';
                    if (displayId.startsWith('ctrl-')) {
                        const clean = displayId.replace('ctrl-', '');
                        if (clean.startsWith('a')) {
                            const num = clean.substring(1);
                            if (num.length >= 2) {
                                const chapter = num.charAt(0);
                                const controlNum = num.substring(1);
                                displayId = `A.${chapter}.${controlNum}`;
                            } else {
                                displayId = `A.${num.charAt(0)}.0`;
                            }
                        } else {
                            displayId = clean.toUpperCase();
                        }
                    }

                    const parsed = parseControlTitle(ctrl);
                    const policyTitle = parsed.title || ctrl.title;

                    return [
                        `<span style="font-weight:600; color:var(--accent)">${escapeHTML(displayId)}</span>`,
                        `<div><strong>${escapeHTML(policyTitle)}</strong><div style="font-size:0.75rem; color:var(--text-dim); margin-top:2px">${escapeHTML(ctrl.description || '').substring(0, 80)}...</div></div>`,
                        cisoSign,
                        ceoSign,
                        window.renderStatusBadge(stageText, stageType),
                        window.renderStatusBadge(ctrl.status || 'IMPLEMENTED', statusType),
                        `<button data-action="openGeneratePolicyModal" data-args='["${proj.id}","${escapeHTML(ctrl.id)}"]' class="btn btn-ghost btn-sm">Visualizar / Gerar</button>`
                    ];
                }),
                { emptyState: 'Nenhuma política cadastrada.' }
            );

            c.innerHTML = `
                ${statsHtml}
                ${tableHtml}
            `;
        } catch(e) {
            c.innerHTML = `<div class="error">Erro ao carregar Gestão de Políticas: ${escapeHTML(e.message)}</div>`;
        }
    }

    // Mudar o texto zera as duas assinaturas no servidor (policies.ts): quem clica precisa saber antes.
    function avisarQueAnulaAssinaturas(ctrl) {
        if (!ctrl.ciso_approved_by && !ctrl.ceo_approved_by) return true;
        return window.confirm('Mudar o texto anula as assinaturas já registradas desta política. Continuar?');
    }

    async function openGeneratePolicyModal(projectId, controlIdArg) {
        const controlId = controlIdArg || 'A.5.1';
        
        openModal(`
            <div class="modal-header"><span class="modal-title">Gestão de Política</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
            <div style="padding: 2rem; text-align: center; color: var(--text-dim);">Carregando detalhes do controle...</div>
        `);

        // Uma rota só, presa ao projeto: o servidor acha o controle pelo id em qualquer formato ou
        // pelo código. Sem fallback para a lista global de controles, que mistura projetos.
        let policyRes;
        try {
            policyRes = await api('GET', `/api/v1/projects/${projectId}/controls/${encodeURIComponent(controlId)}/policy`);
        } catch (e) {
            openModal(`
                <div class="modal-header"><span class="modal-title">Gestão de Política</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
                <div style="padding: 2rem; text-align: center; color: var(--danger);">${escapeHTML(e.message || 'Controle não encontrado neste projeto')}</div>
            `);
            return;
        }
        const ctrl = policyRes.control;
        const policyText = policyRes.content || '';
        const codigo = codigoDoControle(ctrl);

        let templates = [];
        let options = '';
        try {
            const res = await api('GET', '/api/v1/policies/templates');
            templates = Array.isArray(res) ? res : [];
            options = templates.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');
        } catch(e) {
            console.error("Erro ao carregar templates:", e);
        }

        const isDefaultDescription = !policyText || 
                                     policyText === 'Universal ISMS requirement.' || 
                                     policyText.startsWith('SGSI-POLICY-') && policyText.includes('aguardando assinatura');
        const hasPolicy = policyText.length > 100 && !isDefaultDescription;

        const showGenerationFormHtml = () => {
            const formHtml = `
                <div class="modal-header"><span class="modal-title">Gerar Política ISO — ${escapeHTML(codigo)}</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
                <div class="form-group" style="display:none">
                    <label class="form-label">Controle ISO</label>
                    <input class="form-input" id="policy-control-id" value="${escapeHTML(codigo)}">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Método de Geração</label>
                    <select class="form-input" id="policy-gen-method" data-action-change="togglePolicyGenFields">
                        <option value="ai">Inteligência Artificial (PolicyAgent)</option>
                        ${options.length ? `<option value="template">Template de Política Standard</option>` : ''}
                    </select>
                </div>

                <div class="form-group" id="policy-template-container" style="display:none">
                    <label class="form-label">Selecione o Template Standard</label>
                    <select class="form-input" id="policy-template-select">
                        ${options}
                    </select>
                </div>

                <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem" id="policy-gen-hint">O PolicyAgent irá gerar uma política completa usando IA, adaptada ao contexto organizacional deste projeto.</p>
                <button class="btn btn-primary" id="btn-gen-policy" style="width:100%" data-action="doGeneratePolicy" data-args='["${projectId}"]'>Gerar com IA</button>
                <div id="policy-result" style="margin-top:1rem"></div>
            `;
            const modalContent = document.getElementById('modal-content');
            modalContent.innerHTML = formHtml;
        };

        if (hasPolicy) {
            // Buscar histórico de versões da política
            const versions = policyRes.versions || [];

            

            let cisoStatusHtml = '';
            if (ctrl.ciso_approved_by) {
                cisoStatusHtml = `
                    <div style="width:100%">
                        <div>
                            <strong>Líder SGSI:</strong> 
                            <span style="color:var(--success)">Aprovado por ${escapeHTML(ctrl.ciso_approved_by)} em ${new Date(ctrl.ciso_approved_at).toLocaleString()}</span>
                        </div>
                        ${ctrl.ciso_approved_ip ? `<div style="font-size:0.72rem; color:var(--text-dim); margin-top:4px; font-family:monospace; word-break:break-all">Origem: IP ${escapeHTML(ctrl.ciso_approved_ip)} | UA: ${escapeHTML(ctrl.ciso_approved_ua)}</div>` : ''}
                    </div>
                `;
            } else {
                cisoStatusHtml = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%">
                        <div>
                            <strong>Líder SGSI:</strong> 
                            <span style="color:var(--text-dim)">Aguardando assinatura</span>
                        </div>
                        <div style="display:flex; gap:8px">
                            <button class="btn" style="padding:0.2rem 0.6rem; font-size:0.75rem" data-action="signPolicy" data-args='["${projectId}","${escapeHTML(ctrl.id)}","ciso"]'>Assinar</button>
                        </div>
                    </div>
                `;
            }

            let ceoStatusHtml = '';
            if (ctrl.ceo_approved_by) {
                ceoStatusHtml = `
                    <div style="width:100%">
                        <div>
                            <strong>Direção Executiva:</strong> 
                            <span style="color:var(--success)">Aprovado por ${escapeHTML(ctrl.ceo_approved_by)} em ${new Date(ctrl.ceo_approved_at).toLocaleString()}</span>
                        </div>
                        ${ctrl.ceo_approved_ip ? `<div style="font-size:0.72rem; color:var(--text-dim); margin-top:4px; font-family:monospace; word-break:break-all">Origem: IP ${escapeHTML(ctrl.ceo_approved_ip)} | UA: ${escapeHTML(ctrl.ceo_approved_ua)}</div>` : ''}
                    </div>
                `;
            } else {
                ceoStatusHtml = `
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%">
                        <div>
                            <strong>Direção Executiva:</strong> 
                            <span style="color:var(--text-dim)">Aguardando assinatura</span>
                        </div>
                        <div style="display:flex; gap:8px">
                            <button class="btn" style="padding:0.2rem 0.6rem; font-size:0.75rem" data-action="signPolicy" data-args='["${projectId}","${escapeHTML(ctrl.id)}","ceo"]'>Assinar</button>
                        </div>
                    </div>
                `;
            }

            let versionsSelectHtml = '';
            if (versions.length > 0) {
                versionsSelectHtml = `
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px">
                        <label style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; min-width:120px">Histórico de Versões:</label>
                        <select class="form-input" style="height:32px; padding:0 8px; font-size:0.75rem; border-radius:6px; background:rgba(255,255,255,0.02); border-color:var(--border); flex:1" id="policy-version-selector" data-action-change="onPolicyVersionChange" data-args='["${projectId}","${escapeHTML(ctrl.id)}"]' data-arg-val>
                            ${versions.map((v, index) => `<option value="${v.id}">${index === 0 ? 'v' + v.version + ' (Atual)' : 'v' + v.version} - por ${escapeHTML(v.created_by)} em ${new Date(v.created_at).toLocaleDateString()}</option>`).join('')}
                        </select>
                        <button class="btn" id="btn-restore-version" style="display:none; padding:4px 10px; font-size:0.7rem; border-color:var(--accent); color:var(--accent);" data-action="doRestorePolicyVersion" data-args='["${projectId}","${escapeHTML(ctrl.id)}"]'>Restaurar vX</button>
                    </div>
                `;
            }

            let signatureSealHtml = '';
            const evidenceHash = policyRes.hash;
            if (ctrl.ciso_approved_by || ctrl.ceo_approved_by) {
                signatureSealHtml = `
                    <div style="background: rgba(0, 173, 232, 0.03); border: 1px solid rgba(0, 173, 232, 0.15); border-radius: 12px; padding: 1rem 1.25rem; backdrop-filter: blur(12px);">
                        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.5rem; margin-bottom: 0.6rem;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div style="width: 8px; height: 8px; border-radius: 50%; background: #00ade8; box-shadow: 0 0 10px #00ade8;"></div>
                                <span style="font-family: 'Montserrat', sans-serif; font-size:0.75rem; font-weight: 700; color: #f5f5f7; text-transform: uppercase; letter-spacing: 0.1em;">Selo de Homologação Digital</span>
                            </div>
                            <span style="font-family: 'Montserrat', sans-serif; font-size:0.72rem; font-weight: 700; color: #00ade8; background: rgba(0, 173, 232, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(0, 173, 232, 0.2);">ISO 27001 CONFORME</span>
                        </div>
                        <div style="font-size: 0.7rem; font-family: monospace; display: flex; flex-direction: column; gap: 4px; color: rgba(229, 235, 255, 0.75);">
                            <div><span style="color: var(--text-dim);">INTEGRIDADE DO TEXTO DA POLÍTICA (SHA-256 do texto, não do pedido):</span> <span style="color: #00ade8; word-break: break-all;">${escapeHTML(evidenceHash)}</span></div>
                            <div><span style="color: var(--text-dim);">MÉTODO:</span> Assinatura Eletrônica Simples (Senha & Autenticação de Sessão via HTTPS)</div>
                        </div>
                    </div>
                `;
            }

            let versionsTableHtml = '';
            if (versions.length > 0) {
                versionsTableHtml = `
                    <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem; margin-top:8px">
                        <h4 style="font-family:'Montserrat',sans-serif; font-size:0.7rem; color:var(--accent); margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:0.05em">Histórico de Alterações & Revisões</h4>
                        <div style="overflow-x:auto">
                            <table style="width:100%; font-size:0.7rem; border-collapse:collapse; background:rgba(255,255,255,0.01); border-radius:8px; border:1px solid rgba(255,255,255,0.05)">
                                <thead>
                                    <tr style="border-bottom:1px solid rgba(255,255,255,0.08); text-align:left; color:var(--text-dim)">
                                        <th style="padding:6px 12px">Versão</th>
                                        <th style="padding:6px 12px">Data</th>
                                        <th style="padding:6px 12px">Modificado por</th>
                                        <th style="padding:6px 12px">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${versions.map((v, i) => `
                                        <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                                            <td style="padding:6px 12px; font-weight:600; color:var(--accent)">v${escapeHTML(v.version)}</td>
                                            <td style="padding:6px 12px">${new Date(v.created_at).toLocaleDateString()}</td>
                                            <td style="padding:6px 12px">${escapeHTML(v.created_by)}</td>
                                            <td style="padding:6px 12px">
                                                ${i > 0 ? `<button class="btn btn-ghost" style="padding:2px 6px; font-size:0.72rem; margin:0;" data-action="__cmpViewPolicyVersion" data-args='["${projectId}","${escapeHTML(ctrl.id)}","${v.id}"]'>Visualizar</button>` : `<span style="color:var(--success)">Atual (Ativa)</span>`}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }

            const renderedHtml = window.marked ? window.marked.parse(policyText) : escapeHTML(policyText);
            const html = `
                <div class="modal-header">
                    <span class="modal-title">Política Ativa — ${escapeHTML(codigo)}</span>
                    <button class="btn-ghost" data-action="forceCloseModal">&times;</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <div style="font-size:0.72rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.2em; font-family:'Montserrat',sans-serif">Título da Política</div>
                    <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.15rem; color:var(--accent)">
                        ${escapeHTML(ctrl.title)}
                    </div>
                    
                    ${versionsSelectHtml}
                    ${signatureSealHtml}

                    <div style="font-size:0.72rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.2em; font-family:'Montserrat',sans-serif; margin-top:8px">Conteúdo da Política</div>
                    <div id="policy-content-container">
                        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:1.25rem; max-height:350px; overflow-y:auto; font-size:0.8rem; line-height:1.6; font-family:'Inter',sans-serif;" id="policy-content-text" class="markdown-body">${renderedHtml}</div>
                    </div>
                    
                    <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem; margin-top:8px" id="signature-workflow-container">
                        <h4 style="font-family:'Montserrat',sans-serif; font-size:0.7rem; color:var(--accent); margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:0.05em">Workflow de Assinatura (A.5.1)</h4>
                        <div style="display:flex; flex-direction:column; gap:0.75rem">
                            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; border-radius:8px; font-size:0.75rem">
                                ${cisoStatusHtml}
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; border-radius:8px; font-size:0.75rem">
                                ${ceoStatusHtml}
                            </div>
                        </div>
                    </div>
                    
                    ${versionsTableHtml}
                    
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1.5rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem">
                        <div style="display:flex; gap:8px">
                            <button class="btn" data-action="forceCloseModal">Fechar</button>
                            <button class="btn btn-secondary" id="btn-edit-policy">Editar Documento</button>
                            <button class="btn btn-secondary" data-action="openPolicyReport" data-args='["${projectId}","${escapeHTML(ctrl.id)}"]'>Imprimir</button>
                            ${window.podePedirAprovacao?.(S.user) ? `<button class="btn btn-secondary" data-action="abrirPedidoAprovacao" data-args='${escapeHTML(JSON.stringify([projectId, 'politica', ctrl.id]))}'>Pedir aprovação</button>` : ''}
                        </div>
                        <button class="btn btn-primary" id="btn-regen-trigger">Regerar com IA / Template</button>
                    </div>
                </div>
            `;
            openModal(html, 'modal-large');
            document.getElementById('btn-regen-trigger').onclick = showGenerationFormHtml;

            let isEditing = false;
            const originalMarkdown = policyText;

            document.getElementById('btn-edit-policy').onclick = function() {
                const container = document.getElementById('policy-content-container');
                const sigContainer = document.getElementById('signature-workflow-container');
                const editBtn = document.getElementById('btn-edit-policy');
                
                if (!isEditing) {
                    // Entrar no modo Editor (Split-screen)
                    isEditing = true;
                    editBtn.textContent = 'Salvar Alterações';
                    editBtn.className = 'btn btn-primary';
                    sigContainer.style.display = 'none'; // Esconde assinaturas durante a edição

                    container.innerHTML = `
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; height:400px; margin-top:10px">
                            <div style="display:flex; flex-direction:column; gap:8px; height:100%">
                                <label class="form-label" style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em">Editor Markdown</label>
                                <textarea id="policy-editor-textarea" style="flex:1; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:12px; color:#fff; font-family:monospace; font-size:0.75rem; resize:none; outline:none; line-height:1.4;" placeholder="Digite o conteúdo da política em Markdown...">${escapeHTML(originalMarkdown)}</textarea>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:8px; height:100%">
                                <label class="form-label" style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em">Preview Renderizado (VSCode Mode)</label>
                                <div id="policy-editor-preview" style="flex:1; overflow-y:auto; background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:12px; font-size:0.8rem; line-height:1.6;" class="markdown-body">${renderedHtml}</div>
                            </div>
                        </div>
                    `;

                    // Lógica de preview em tempo real
                    const textarea = document.getElementById('policy-editor-textarea');
                    const preview = document.getElementById('policy-editor-preview');
                    textarea.oninput = function() {
                        preview.innerHTML = window.marked ? window.marked.parse(this.value) : escapeHTML(this.value);
                    };
                } else {
                    // Salvar as alterações
                    const newContent = document.getElementById('policy-editor-textarea').value;
                    if (!avisarQueAnulaAssinaturas(ctrl)) return;
                    editBtn.disabled = true;
                    editBtn.textContent = 'Salvando...';
                    api('POST', `/api/v1/projects/${projectId}/controls/${encodeURIComponent(ctrl.id)}/policy`, { text: newContent })
                        .then(() => {
                            showToast('Política atualizada. Uma nova versão foi registrada.');
                            return window.openGeneratePolicyModal(projectId, ctrl.id);
                        })
                        .catch(err => {
                            showToast('Erro ao salvar política: ' + err.message, 'error');
                            editBtn.disabled = false;
                            editBtn.textContent = 'Salvar Alterações';
                        });
                }
            };
            
            

            window.activeVersionsList = versions;
            window.onPolicyVersionChange = async function(pId, cId, verId) {
                const selected = window.activeVersionsList.find(v => v.id === verId);
                if (!selected) return;
                
                try {
                    const detail = await api('GET', `/api/v1/projects/${pId}/controls/${cId}/versions/${verId}`);
                    document.getElementById('policy-content-text').textContent = detail.policy_text;
                    
                    const restoreBtn = document.getElementById('btn-restore-version');
                    if (restoreBtn) {
                        const isLatest = window.activeVersionsList[0].id === verId;
                        if (isLatest) {
                            restoreBtn.style.display = 'none';
                        } else {
                            restoreBtn.style.display = 'block';
                            restoreBtn.textContent = `Restaurar v${detail.version}`;
                        }
                    }
                } catch (e) {
                    showToast('Erro ao carregar texto da versão', 'error');
                }
            };

            // Wrapper S2: substitui o onclick composto (chamada + selector + botão).
            window.__cmpViewPolicyVersion = function(pId, cId, verId) {
                window.onPolicyVersionChange(pId, cId, verId);
                const sel = document.getElementById('policy-version-selector');
                if (sel) sel.value = verId;
                const restoreBtn = document.getElementById('btn-restore-version');
                if (restoreBtn) restoreBtn.style.display = 'inline-block';
            };

            window.doRestorePolicyVersion = async function(pId, cId) {
                const selector = document.getElementById('policy-version-selector');
                const verId = selector.value;
                if (!verId) return;
                if (!avisarQueAnulaAssinaturas(ctrl)) return;
                
                try {
                    const res = await api('POST', `/api/v1/projects/${pId}/controls/${cId}/restore-version`, { version_id: verId });
                    if (res.ok) {
                        showToast('Política restaurada com sucesso');
                        window.openGeneratePolicyModal(pId, cId);
                        render();
                    }
                } catch(e) {
                    showToast('Erro ao restaurar versão', 'error');
                }
            };
        } else {
            showGenerationFormHtml();
        }
    }

    window.togglePolicyGenFields = function() {
        const method = document.getElementById('policy-gen-method').value;
        const container = document.getElementById('policy-template-container');
        const hint = document.getElementById('policy-gen-hint');
        const btn = document.getElementById('btn-gen-policy');

        if (method === 'template') {
            container.style.display = 'block';
            hint.textContent = 'Gere a política a partir de um template standard preenchendo as variáveis do projeto automaticamente.';
            btn.textContent = 'Gerar a partir de Template';
        } else {
            container.style.display = 'none';
            hint.textContent = 'O PolicyAgent ira gerar uma politica completa usando IA, adaptada ao contexto organizacional deste projeto.';
            btn.textContent = 'Gerar com IA';
        }
    };

    async function doGeneratePolicy(projectId) {
        const controlId = document.getElementById('policy-control-id').value || 'A.5.1';
        const method = document.getElementById('policy-gen-method').value || 'ai';
        const templateName = document.getElementById('policy-template-select')?.value;
        const btn = document.getElementById('btn-gen-policy');
        const result = document.getElementById('policy-result');
        
        btn.disabled = true;
        btn.textContent = 'Gerando...';
        result.innerHTML = '<div style="color:var(--muted);font-size:0.75rem">Processando...</div>';

        try {
            let res;
            if (method === 'template') {
                res = await api('POST', `/api/v1/projects/${projectId}/policies/generate-from-template`, {
                    template_name: templateName,
                    control_id: controlId
                });
            } else {
                res = await api('POST', `/api/v1/projects/${projectId}/generate-policy`, { control_id: controlId });
            }
            if (res.ok) {
                // O modal da política mostra o texto gerado com as assinaturas, lidas do servidor.
                showToast('Política gerada. Revise o texto antes de pedir as assinaturas.');
                await openGeneratePolicyModal(projectId, controlId);
            } else {
                throw new Error(res.error || 'Erro desconhecido');
            }
        } catch(e) {
            result.innerHTML = `<div style="color:var(--danger);font-size:0.75rem">Erro: ${escapeHTML(e.message)}</div>`;
            btn.textContent = 'Tentar novamente';
            btn.disabled = false;
        }
    }

    // O carimbo é o nome que consta na matriz de Governança (o servidor decide quem pode assinar o quê);
    // por isso a tela pede só a senha.
    window.signPolicy = async function(projectId, controlId, role) {
        const roleLabel = role === 'ciso' ? 'Líder SGSI' : 'Direção Executiva';
        const password = prompt(`Digite sua senha de login para assinar eletronicamente como ${roleLabel}:`);
        if (!password) return;
        try {
            const res = await api('POST', `/api/v1/controls/${encodeURIComponent(controlId)}/approve`, { role, password });
            showToast(`Assinatura registrada como ${roleLabel}: ${res.approved_by}.`);
            await openGeneratePolicyModal(projectId, controlId);
        } catch (e) {
            showToast('Assinatura não registrada: ' + e.message, 'error');
        }
    };

    async function renderAcknowledgments(c, h, a) {
        h.textContent = 'Ciencia de Políticas';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>'; 
            return; 
        }
        
        a.innerHTML = ''; 
        
        let acks = [];
        try {
            acks = await api('GET', `/api/v1/projects/${proj.id}/policy-acknowledgments`);
        } catch(e) {
            console.error('Error loading policy acknowledgments', e);
        }
        if (!Array.isArray(acks)) acks = [];

        const totalAcks = acks.length;
        
        const policyNames = {
            'ISP': 'ISP - Politica de Seguranca da Informacao',
            'AUP': 'AUP - Termo de Uso Aceitavel',
            'ACP': 'ACP - Controle de Acesso',
            'IRP': 'IRP - Resposta a Incidentes',
            'BCP': 'BCP - Continuidade de Negocios',
            'DPP': 'DPP - Protecao de Dados',
            'CMP': 'CMP - Gestao de Mudancas',
            'SDP': 'SDP - Desenvolvimento Seguro',
            'VMP': 'VMP - Gestao de Vulnerabilidades',
            'SAP': 'SAP - Conscientizacao em Seguranca'
        };

        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const currentUserEmail = S.user ? S.user.email : '';
        const currentUserName = S.user ? S.user.name || S.user.email.split('@')[0] : '';

        const selfServiceFormHtml = `
            <div class="card" style="flex: 1; min-width: 300px; margin-bottom: 0;">
                <div class="card-label">Minha Declaracao de Ciencia</div>
                <p style="font-size:0.75rem; color:var(--text-dim); margin-bottom:1rem">
                    Declare ciencia de forma eletronica sob as diretrizes vigentes das politicas do projeto.
                </p>
                <div class="form-group">
                    <label class="form-label">Politica</label>
                    <select class="form-input" id="ack-self-policy">
                        ${Object.entries(policyNames).map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Seu Nome</label>
                    <input class="form-input" id="ack-self-name" value="${escapeHTML(currentUserName)}" readonly style="background:rgba(255,255,255,0.02)">
                </div>
                <div class="form-group">
                    <label class="form-label">Seu E-mail</label>
                    <input class="form-input" id="ack-self-email" value="${escapeHTML(currentUserEmail)}" readonly style="background:rgba(255,255,255,0.02)">
                </div>
                <button class="btn btn-primary" style="width:100%; margin-top:0.5rem" data-action="submitSelfAcknowledgment" data-args='["${proj.id}"]'>Assinar Ciencia Eletronica</button>
            </div>
        `;

        const manualFormHtml = canCrud ? `
            <div class="card" style="flex: 1; min-width: 300px; margin-bottom: 0;">
                <div class="card-label">Registrar Ciencia de Colaborador</div>
                <p style="font-size:0.75rem; color:var(--text-dim); margin-bottom:1rem">
                    Registrar ciencia eletronica em nome de terceiros ou colaboradores externos.
                </p>
                <div class="form-group">
                    <label class="form-label">Politica</label>
                    <select class="form-input" id="ack-manual-policy">
                        ${Object.entries(policyNames).map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Nome do Colaborador</label>
                    <input class="form-input" id="ack-manual-name" placeholder="Ex: Carlos Oliveira">
                </div>
                <div class="form-group">
                    <label class="form-label">E-mail do Colaborador</label>
                    <input class="form-input" id="ack-manual-email" placeholder="Ex: carlos@empresa.com">
                </div>
                <button class="btn" style="width:100%; border-color:var(--accent); color:var(--accent); margin-top:0.5rem" data-action="submitManualAcknowledgment" data-args='["${proj.id}"]'>Registrar Aceite</button>
            </div>
        ` : '';

        const historyRows = acks.length ? acks.map(a => {
            const policyTitle = policyNames[a.policy_type] || a.policy_type;
            const dateStr = a.acknowledged_at ? new Date(a.acknowledged_at).toLocaleString('pt-BR') : 'N/A';
            return `
                <tr>
                    <td style="font-weight: 500;">${escapeHTML(a.user_name)}</td>
                    <td style="color: var(--text-dim); font-size: 0.75rem;">${escapeHTML(a.user_email)}</td>
                    <td><span class="ctx-tag" style="color:var(--accent); border-color:var(--accent-glow)">${escapeHTML(policyTitle)}</span></td>
                    <td style="font-size: 0.75rem; color: var(--text-dim);">${dateStr}</td>
                    <td style="font-size: 0.7rem; font-family: monospace; color: var(--muted);">${escapeHTML(a.ip_address || 'N/A')}</td>
                </tr>
            `;
        }).join('') : `<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:2rem;">Nenhum registro de ciencia encontrado para este projeto.</td></tr>`;

        c.innerHTML = `
            <div class="fade-in">
                <div class="card" style="margin-bottom:1.5rem; display:flex; justify-between; align-items:center; flex-wrap:wrap; gap:1.5rem">
                    <div style="display:flex; gap:2rem; align-items:center">
                        <div>
                            <div class="card-label">Assinaturas Registradas</div>
                            <div style="font-size:1.8rem; font-weight:600; color:var(--accent)">${totalAcks}</div>
                        </div>
                        <div>
                            <div class="card-label">Projeto Ativo</div>
                            <div style="font-size:1.1rem; font-weight:500">${escapeHTML(proj.project_name || proj.client_name)}</div>
                        </div>
                    </div>
                    <div>
                        <button class="btn btn-primary" data-action="copyPublicPolicyPortalLink" data-args='["${proj.id}"]'>
                            Copiar Link do Portal Explicito (OTP)
                        </button>
                    </div>
                </div>

                <div style="display:flex; flex-wrap:wrap; gap:1.5rem; margin-bottom:2rem;">
                    ${selfServiceFormHtml}
                    ${manualFormHtml}
                </div>

                <div id="ciencia-link-box"></div>

                <div class="card">
                    <div class="card-label">Histórico de Ciencia de Políticas</div>
                    <div style="overflow-x:auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Colaborador</th>
                                    <th>E-mail</th>
                                    <th>Politica</th>
                                    <th>Data / Hora</th>
                                    <th>Endereco IP / Origem</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${historyRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        // Ciência por link (pedidos, fatia 3): só para quem pode pedir; o servidor decide de novo.
        if (window.podePedirAprovacao?.(S.user)) window.renderCienciaLink?.(document.getElementById('ciencia-link-box'), proj.id);
    }

    window.copyPublicPolicyPortalLink = function(projectId) {
        const url = `${window.location.origin}/politicas.html?project=${projectId}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url);
        } else {
            prompt('Copie a URL do Portal de Políticas:', url);
        }
        showToast('Link do Portal de Políticas copiado!');
    };

    window.submitSelfAcknowledgment = async function(projectId) {
        const policyType = document.getElementById('ack-self-policy').value;
        const name = document.getElementById('ack-self-name').value.trim();
        const email = document.getElementById('ack-self-email').value.trim();
        
        if (!policyType || !name || !email) {
            alert('Erro: Nome e E-mail de usuario logado nao identificados.');
            return;
        }

        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/policy-acknowledgments`, {
                policy_type: policyType,
                user_name: name,
                user_email: email
            });
            if (res.ok) {
                showToast('Ciencia de politica registrada com sucesso!');
                render();
            } else {
                throw new Error(res.error || 'Erro desconhecido');
            }
        } catch(e) {
            alert('Falha ao registrar ciencia: ' + e.message);
        }
    };

    window.submitManualAcknowledgment = async function(projectId) {
        const policyType = document.getElementById('ack-manual-policy').value;
        const name = document.getElementById('ack-manual-name').value.trim();
        const email = document.getElementById('ack-manual-email').value.trim();

        if (!name || !email) {
            alert('Por favor, preencha o nome e o e-mail do colaborador.');
            return;
        }

        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/policy-acknowledgments`, {
                policy_type: policyType,
                user_name: name,
                user_email: email
            });
            if (res.ok) {
                showToast('Ciencia de politica registrada com sucesso!');
                document.getElementById('ack-manual-name').value = '';
                document.getElementById('ack-manual-email').value = '';
                render();
            } else {
                throw new Error(res.error || 'Erro desconhecido');
            }
        } catch(e) {
            alert('Falha ao registrar ciencia: ' + e.message);
        }
    };

    async function bulkGeneratePolicies(projectId) {
        const controls = prompt('Controles ISO (separados por virgula):\nEx: A.5.1,A.5.2,A.5.3,A.5.4,A.5.8', 'A.5.1,A.5.2,A.5.3,A.5.4,A.5.8,A.5.9,A.5.10');
        if (!controls) return;
        const control_ids = controls.split(',').map(s => s.trim()).filter(Boolean);
        if (!control_ids.length) return;
        const msg = `Gerar ${control_ids.length} politicas via AI? Isso pode levar alguns minutos.`;
        if (!confirm(msg)) return;

        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/generate-policies-bulk`, { control_ids });
            if (res.ok) {
                alert(`Bulk Policy Completo!\n\nTotal: ${res.total}\nSucesso: ${res.successful}\nFalhas: ${res.failed}`);
            }
        } catch(e) { alert('Erro: ' + e.message); }
    }

    async function migrate27701(projectId) {
        if (!confirm('Migrar SoA para ISO 27701 (PIMS)?\nIsso adicionara controles de privacidade ao sistema.')) return;
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/migrate-27701`);
            if (res.ok) {
                alert(`Migracao 27701 Completa!\n\nGaps identificados: ${res.gaps?.length || 0}\nNovos controles: ${res.new_controls_created}\nTransformacao: ${(res.transformation_ratio * 100).toFixed(0)}%`);
                await loadControls();
                render();
            }
        } catch(e) { alert('Erro: ' + e.message); }
    }

window.renderControls = renderControls;
window.openControlDetail = openControlDetail;
window.updateControlStatus = updateControlStatus;
window.updateControlMaturity = updateControlMaturity;
window.loadControlEvidence = loadControlEvidence;
window.generatePolicyForControl = generatePolicyForControl;
window.toggleChip = toggleChip;
window.setYesNo = setYesNo;
window.renderSoA = renderSoA;
window.renderEvidence = renderEvidence;
window.openEvidenceUploadModal = openEvidenceUploadModal;
window.doEvidenceUpload = doEvidenceUpload;
window.renderPoliciesDashboard = renderPoliciesDashboard;
window.openGeneratePolicyModal = openGeneratePolicyModal;
window.doGeneratePolicy = doGeneratePolicy;
window.renderAcknowledgments = renderAcknowledgments;
window.bulkGeneratePolicies = bulkGeneratePolicies;
window.migrate27701 = migrate27701;

window.openPolicyReport = function(projectId, controlId) {
    window.open(`/api/v1/projects/${projectId}/controls/${encodeURIComponent(controlId)}/policy/report?token=${S.token}`, '_blank');
};

// A rota de avaliação trabalha sobre o TEXTO do documento (o arquivo vive no R2, não é lido
// aqui), então o botão "IA" abre um modal para colar o trecho a avaliar.
// Troca (ou desfaz) o controle de uma evidência. O servidor confere que o controle é do projeto
// e volta a avaliação a pendente quando o vínculo muda.
window.vincularEvidenciaControle = async function(evidenceId, controlId) {
    try {
        await api('PUT', `/api/v1/evidence/${evidenceId}`, { control_id: controlId || null });
        showToast(controlId ? 'Evidência ligada ao controle.' : 'Evidência desligada do controle.');
    } catch (e) {
        showToast('Erro ao trocar o controle: ' + e.message, 'error');
    }
};

window.evaluateEvidenceAI = function(evidenceId) {
    openModal(`
        <div class="modal-header"><span class="modal-title">Avaliar evidência por IA</span><button class="btn-ghost" data-action="forceCloseModal">×</button></div>
        <div class="form-group">
            <label class="form-label">Texto do documento</label>
            <textarea class="form-input" id="eval-text" style="min-height:160px" placeholder="Cole aqui o texto extraído da evidência."></textarea>
        </div>
        <button class="btn btn-primary" style="width:100%" data-action="enviarAvaliacaoEvidencia" data-args='${JSON.stringify([evidenceId])}'>Avaliar</button>
        <div id="eval-result" style="margin-top:1rem;font-size:0.8rem;white-space:pre-wrap"></div>
    `);
};

window.enviarAvaliacaoEvidencia = async function(evidenceId) {
    const text = (document.getElementById('eval-text')?.value || '').trim();
    const out = document.getElementById('eval-result');
    if (!text) { showToast('Cole o texto do documento para avaliar.', 'error'); return; }
    out.textContent = 'Avaliando...';
    try {
        const r = await api('POST', `/api/v1/evidence/${evidenceId}/evaluate`, { text });
        out.innerHTML = `<strong>${escapeHTML(r.evaluation_status || '')}</strong>\n${escapeHTML(r.evaluation_markdown || '')}`;
    } catch (e) {
        out.textContent = 'Erro: ' + e.message;
    }
};
