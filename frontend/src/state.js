// Parse seguro de valores do localStorage: um valor corrompido (escrita truncada,
// edição manual, cota) não deve derrubar o boot do app. Em caso de erro, limpa a
// chave e retorna null para permitir recuperação.
function safeParse(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        try { localStorage.removeItem(key); } catch { /* noop */ }
        return null;
    }
}

export     const S = {
        view: 'dashboard', lang: 'pt',
        token: localStorage.getItem('niso_token') || null,
        user: safeParse('niso_user'),
        activeProject: safeParse('niso_activeProject'),
        leads: [], assessments: [], projects: [], controls: [],
        currentLead: null, currentAssessment: null, currentProject: safeParse('niso_activeProject'),
        currentBlock: 1, blockAnswers: {},
        editingPhase: null,
        phaseConfig: null,
        phaseChecks: safeParse('niso_phaseChecks') || {},
        generatingProposal: false
    };

window.S = S;
