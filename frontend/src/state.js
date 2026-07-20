export     const S = {
        view: 'dashboard', lang: 'pt',
        token: localStorage.getItem('niso_token') || null,
        user: localStorage.getItem('niso_user') ? JSON.parse(localStorage.getItem('niso_user')) : null,
        activeProject: localStorage.getItem('niso_activeProject') ? JSON.parse(localStorage.getItem('niso_activeProject')) : null,
        leads: [], assessments: [], projects: [], controls: [],
        currentLead: null, currentAssessment: null, currentProject: localStorage.getItem('niso_activeProject') ? JSON.parse(localStorage.getItem('niso_activeProject')) : null,
        currentBlock: 1, blockAnswers: {},
        editingPhase: null,
        phaseConfig: null,
        phaseChecks: JSON.parse(localStorage.getItem('niso_phaseChecks') || '{}'),
        generatingProposal: false
    };

window.S = S;
