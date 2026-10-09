import './style.css';
import { S } from './state.js';
import { api } from './api.js';
import './ui.js';
import { navigate } from './router.js';
import { initDelegation } from './delegation.js';
import './data/wizards.js';
import './data/assessment.js';

import './views/commercial.js';
import './views/project.js';
import './views/grc.js';
import './views/partes.js';
import './views/documentos.js';
import './views/compliance.js';
import './views/monitor.js';

// View Modules
import './views/dashboard.js';
import './views/admin.js';
import './views/conectar-agente.js';
import './views/catalogo.js';
import './views/config-comercial.js';
import './views/organizacoes.js';
import './views/propostas.js';
import './views/trocar-senha.js';
import './views/meus-pedidos.js';
import './views/ai.js';
import './views/privacy.js';
import './views/security.js';

// The rest of the app code will be migrated in subsequent phases
// For now, import remaining inline code below
console.log('[nISO] Modules loaded:', { S, api, navigate });
import './globals.js';

// S2: delegação de eventos (substitui onclick inline, view a view). Um listener
// no document cobre todo conteúdo renderizado.
initDelegation();
