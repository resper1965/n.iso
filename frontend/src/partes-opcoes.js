import { api } from './api.js';
import { escapeHTML } from './ui.js';

// Responsável do cadastro de partes (fatia 1.4), para os <select> de risco, CAPA e RoPA. Só partes ativas.
// Falha ou lista vazia: sobra a opção em branco e o texto livre continua valendo.
export async function opcoesDePartes(projectId, selecionada) {
    let partes = [];
    try { partes = await api('GET', `/api/v1/projects/${projectId}/partes?status=ativa`); } catch (e) { /* só a opção em branco */ }
    if (!Array.isArray(partes)) partes = [];
    return '<option value="">-- Sem responsável cadastrado --</option>' + partes
        .map(p => `<option value="${escapeHTML(p.id)}" ${p.id === selecionada ? 'selected' : ''}>${escapeHTML(p.nome)}</option>`).join('');
}
