import './style.css';
import { S } from './state.js';
import { api, API_BASE } from './api.js';
import { showToast, openModal, closeModal, escapeHTML } from './ui.js';
import { navigate, render } from './router.js';
import './data/wizards.js';
import './data/assessment.js';
import './data/journeys.js';

import './views/commercial.js';
import './views/project.js';
import './views/grc.js';
import './views/compliance.js';
import './views/monitor.js';

// View Modules
import './views/dashboard.js';
import './views/admin.js';
import './views/ai.js';
import './views/privacy.js';

// The rest of the app code will be migrated in subsequent phases
// For now, import remaining inline code below
console.log('[nISO] Modules loaded:', { S, api, navigate });
import './globals.js';
