function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Parse seguro + validação de forma do localStorage. Um valor corrompido (JSON
// inválido) OU com forma inesperada (array/primitivo/objeto malformado) não deve
// entrar no estado nem derrubar o boot. Em qualquer falha, limpa a chave e retorna
// null (permite recuperação). `isValid` valida a forma esperada (padrão: objeto plano).
function safeParse(key, isValid = isPlainObject) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!isValid(parsed)) throw new Error('forma inesperada');
        return parsed;
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
