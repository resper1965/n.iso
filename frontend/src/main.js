import './style.css';
import { S } from './state.js';
import { api, API_BASE } from './api.js';
import { showToast, openModal, closeModal, escapeHTML } from './ui.js';
import { navigate, render } from './router.js';
import './data/wizards.js';
import './data/assessment.js';
import './data/journeys.js';

// The rest of the app code will be migrated in subsequent phases
// For now, import remaining inline code below
console.log('[nISO] Modules loaded:', { S, api, navigate });
