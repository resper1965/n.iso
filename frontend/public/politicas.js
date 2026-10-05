// Portal público de políticas (politicas.html) — script externalizado do HTML
// para o S2/CSP (permite remover 'unsafe-inline' de script-src; servido como
// 'self'). Os handlers antes inline (onsubmit/onclick) são ligados via
// addEventListener no DOMContentLoaded abaixo.
//
// Este portal é anônimo por sessão de OTP, mas o conteúdo que ele exibe
// (título, norma e texto da política) vem de `compliance_controls`,
// editável por papéis com escrita no app autenticado. Sem escapar aqui,
// um campo com `<img onerror=...>` executa para todo mundo que autentica
// por OTP para ler as políticas — a própria audiência que este portal
// existe para servir. O CSP permite `'unsafe-inline'` (ver AGENTS.md),
// então o CSP sozinho não bloqueia isso.
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

let state = {
  projectId: '',
  email: '',
  name: '',
  token: '',
  controls: [],
  acknowledgments: [],
  selectedControl: null
};

window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  state.projectId = params.get('project') || params.get('projectId') || 'cliente-faceid';
  // S2/CSP: handlers antes inline (onsubmit/onclick), agora via addEventListener.
  document.getElementById('form-request-otp').addEventListener('submit', handleRequestOtp);
  document.getElementById('form-verify-otp').addEventListener('submit', handleVerifyOtp);
  document.getElementById('btn-back-email').addEventListener('click', () => showStep(1));
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-sign-ack').addEventListener('click', handleSignAck);
  document.getElementById('chk-accept').addEventListener('change', (e) => toggleSignButton(e.target.checked));
  // A lista de políticas é injetada dinamicamente: delegação no container.
  document.getElementById('policy-list-container').addEventListener('click', (e) => {
    const item = e.target.closest('.policy-item');
    if (item && item.dataset.idx !== undefined) selectPolicy(Number(item.dataset.idx));
  });
  // Link pessoal de ciência (pedido da consultoria): o token vem no FRAGMENTO, que o navegador
  // não manda ao servidor nem põe no Referer; daqui ele segue só no corpo do POST.
  const token = window.location.hash.slice(1);
  if (/^[0-9a-f]{64}$/.test(token)) {
    // Tira o token da barra de endereço (histórico, captura de tela, link copiado); segue em memória.
    // Recarregar a página perde o link: abra de novo pelo e-mail.
    history.replaceState(null, '', window.location.pathname + window.location.search);
    iniciarLink(token);
  }
});

// ─── Ciência por link pessoal ─────────────────────────────────────────────────────────────────
const linkEl = (id) => document.getElementById(id);

async function postLink(acao, corpo) {
  const res = await fetch(`/api/v1/public/pedidos/${acao}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || 'Não foi possível concluir. Tente de novo.');
    e.status = res.status;
    throw e;
  }
  return data;
}

function avisoLink(texto, erro) {
  const box = linkEl('msg-link');
  box.className = erro ? 'alert-box alert-error' : 'alert-box';
  box.textContent = texto;
}

function concluidoLink(texto) {
  linkEl('link-pendente').classList.add('hidden');
  const fim = linkEl('link-concluido');
  fim.textContent = texto;
  fim.classList.remove('hidden');
}

const quando = (s) => (s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).toLocaleString('pt-BR') : '');

function conteudoLink(tipo, conteudo) {
  if (tipo === 'politica') {
    return `<h2 style="margin: 0 0 1rem;">${escapeHTML(conteudo.title)}</h2>
      <div style="white-space: pre-wrap; font-size: 0.95rem; line-height: 1.6; color: #1e293b;">${escapeHTML(conteudo.description) || 'Documento sem texto.'}</div>`;
  }
  return Object.entries(conteudo || {}).filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => `<div style="margin-bottom: 1rem;"><div style="font-size: 0.7rem; text-transform: uppercase; color: #64748b;">${escapeHTML(k)}</div>
      <div style="white-space: pre-wrap; color: #1e293b;">${escapeHTML(String(v))}</div></div>`).join('');
}

async function iniciarLink(token) {
  linkEl('step-request-otp').classList.add('hidden');
  linkEl('step-link').classList.remove('hidden');
  let d;
  try {
    d = await postLink('ver', { token });
  } catch (err) {
    avisoLink(err.status === 404 ? 'Este link é inválido ou expirou. Peça um novo a quem enviou.' : err.message, true);
    return;
  }
  linkEl('link-titulo').textContent = d.titulo || 'Ciência de documento';
  if (d.estado !== 'pendente') {
    concluidoLink(`Ciência registrada em ${quando(d.decidido_em)}. Versão lida (SHA-256): ${d.hash_lido || ''}`);
    return;
  }
  linkEl('link-sub').textContent = `Leia o documento abaixo. Para confirmar, enviaremos um código a ${d.email}.`;
  linkEl('link-documento').innerHTML = conteudoLink(d.tipo, d.conteudo);
  linkEl('link-hash').textContent = d.hash;
  if (d.nome) linkEl('link-nome').value = d.nome;
  linkEl('link-leitura').classList.remove('hidden');

  linkEl('btn-link-codigo').addEventListener('click', async () => {
    try {
      const r = await postLink('codigo', { token });
      avisoLink(`Código enviado para ${r.enviado_para}. Ele vale por 15 minutos.`);
      linkEl('form-link-ciencia').classList.remove('hidden');
      linkEl('btn-link-codigo').textContent = 'Reenviar código';
      linkEl('link-codigo').focus();
    } catch (err) {
      avisoLink(err.message, true);
    }
  });
  linkEl('link-aceite').addEventListener('change', (e) => {
    linkEl('btn-link-confirmar').disabled = !e.target.checked;
    linkEl('btn-link-confirmar').style.opacity = e.target.checked ? '1' : '0.5';
  });
  linkEl('form-link-ciencia').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = linkEl('link-nome').value.trim();
    const codigo = linkEl('link-codigo').value.trim();
    if (nome.length < 2) { avisoLink('Informe o seu nome completo.', true); linkEl('link-nome').focus(); return; }
    if (!/^\d{6}$/.test(codigo)) { avisoLink('Informe o código de 6 dígitos.', true); linkEl('link-codigo').focus(); return; }
    try {
      const r = await postLink('ciencia', { token, codigo, nome });
      linkEl('msg-link').classList.add('hidden');
      concluidoLink(`Ciência registrada em ${quando(r.decidido_em)}. Versão lida (SHA-256): ${r.hash_lido}`);
    } catch (err) {
      avisoLink(err.status === 404 ? 'Este link deixou de valer (o documento pode ter mudado). Peça um novo a quem enviou.' : err.message, true);
    }
  });
}

function showStep(stepNum) {
  document.getElementById('step-request-otp').classList.add('hidden');
  document.getElementById('step-verify-otp').classList.add('hidden');
  document.getElementById('step-reader').classList.add('hidden');

  if (stepNum === 1) document.getElementById('step-request-otp').classList.remove('hidden');
  if (stepNum === 2) document.getElementById('step-verify-otp').classList.remove('hidden');
  if (stepNum === 3) document.getElementById('step-reader').classList.remove('hidden');
}

async function handleRequestOtp(e) {
  e.preventDefault();
  const name = document.getElementById('req-name').value.trim();
  const email = document.getElementById('req-email').value.trim();
  const msgBox = document.getElementById('msg-request');
  msgBox.classList.add('hidden');

  try {
    const res = await fetch('/api/v1/public/policies/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: state.projectId, name, email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao enviar OTP');

    state.name = name;
    state.email = email;

    document.getElementById('sent-email-display').innerText = email;
    msgBox.className = 'alert-box';
    msgBox.innerText = data.message;
    msgBox.classList.remove('hidden');

    if (data.demo_otp) {
      document.getElementById('otp-code').value = data.demo_otp;
    }

    setTimeout(() => showStep(2), 1200);
  } catch (err) {
    msgBox.className = 'alert-box alert-error';
    msgBox.innerText = err.message;
    msgBox.classList.remove('hidden');
  }
}

async function handleVerifyOtp(e) {
  e.preventDefault();
  const otp = document.getElementById('otp-code').value.trim();
  const msgBox = document.getElementById('msg-verify');
  msgBox.classList.add('hidden');

  try {
    const res = await fetch('/api/v1/public/policies/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: state.projectId, email: state.email, otp })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Código inválido');

    state.token = data.token;
    state.name = data.name;

    await loadPolicyList();
    showStep(3);
  } catch (err) {
    msgBox.className = 'alert-box alert-error';
    msgBox.innerText = err.message;
    msgBox.classList.remove('hidden');
  }
}

async function loadPolicyList() {
  try {
    const res = await fetch(`/api/v1/public/policies/list?token=${state.token}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao carregar políticas');

    state.controls = data.controls || [];
    state.acknowledgments = data.acknowledgments || [];

    document.getElementById('client-header-tag').innerText = data.project?.client_name || 'Portal de Políticas';
    document.getElementById('reader-project-name').innerText = data.project?.client_name || 'Diretrizes da Organização';
    document.getElementById('reader-user-info').innerText = `${state.name} (${state.email})`;

    renderPolicyList();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

function renderPolicyList() {
  const container = document.getElementById('policy-list-container');
  if (!state.controls || state.controls.length === 0) {
    container.innerHTML = '<div style="font-size:0.8rem;color:var(--text-dim)">Nenhuma política cadastrada.</div>';
    return;
  }

  container.innerHTML = state.controls.map((ctrl, idx) => {
    const isSigned = state.acknowledgments.some(a => a.policy_type === ctrl.title || a.policy_type === ctrl.id);
    return `
      <div class="policy-item ${idx === 0 ? 'active' : ''}" data-idx="${idx}" id="pol-item-${idx}">
        ${escapeHTML(ctrl.title)}
        ${isSigned ? '<span class="ack-badge">Assinado</span>' : ''}
      </div>
    `;
  }).join('');

  selectPolicy(0);
}

function selectPolicy(idx) {
  document.querySelectorAll('.policy-item').forEach(el => el.classList.remove('active'));
  const activeEl = document.getElementById(`pol-item-${idx}`);
  if (activeEl) activeEl.classList.add('active');

  const ctrl = state.controls[idx];
  state.selectedControl = ctrl;

  const paper = document.getElementById('document-paper-body');
  paper.innerHTML = `
    <div style="border-bottom: 2px solid #00ade8; padding-bottom: 1rem; margin-bottom: 1.5rem;">
      <h2 style="margin: 0; color: #070b14;">${escapeHTML(ctrl.title)}</h2>
      <div style="font-size: 0.8rem; color: #64748b; margin-top: 4px;">Norma Referência: ${escapeHTML(ctrl.standard) || 'ISO 27001 / LGPD'}</div>
    </div>
    <div style="white-space: pre-wrap; font-size: 0.95rem; line-height: 1.6; color: #1e293b;">
      ${escapeHTML(ctrl.description) || 'Conteúdo da política corporativa vigente.'}
    </div>
  `;

  const ackBox = document.getElementById('ack-controls');
  ackBox.classList.remove('hidden');

  const existingAck = state.acknowledgments.find(a => a.policy_type === ctrl.title || a.policy_type === ctrl.id);
  const pendingBox = document.getElementById('ack-pending-box');
  const completedBox = document.getElementById('ack-completed-box');

  if (existingAck) {
    pendingBox.classList.add('hidden');
    completedBox.classList.remove('hidden');
    document.getElementById('ack-details-hash').innerText = `Data/Hora: ${new Date(existingAck.acknowledged_at).toLocaleString()} | IP: ${existingAck.ip_address || 'Registrado'}`;
  } else {
    completedBox.classList.add('hidden');
    pendingBox.classList.remove('hidden');
    document.getElementById('chk-accept').checked = false;
    toggleSignButton(false);
  }
}

function toggleSignButton(enabled) {
  const btn = document.getElementById('btn-sign-ack');
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? '1' : '0.5';
}

async function handleSignAck() {
  if (!state.selectedControl) return;
  try {
    const res = await fetch(`/api/v1/public/policies/ack?token=${state.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy_type: state.selectedControl.title,
        user_name: state.name,
        user_email: state.email
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao registrar ciência');

    state.acknowledgments.push({
      policy_type: state.selectedControl.title,
      acknowledged_at: data.acknowledged_at,
      ip_address: data.ip_address
    });

    renderPolicyList();
    selectPolicy(state.controls.indexOf(state.selectedControl));
  } catch (err) {
    alert('Erro ao assinar: ' + err.message);
  }
}

function logout() {
  state.token = '';
  showStep(1);
}
