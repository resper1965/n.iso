const fs = require('fs');

// 1. Revert constants.ts
const constantsFile = 'src/constants.ts';
let constLines = fs.readFileSync(constantsFile, 'utf8').split('\n');
const startIdx = constLines.findIndex(l => l.includes("export type ChecklistItem = { id: string; text: string; category:"));

let checklistContent = '';
if (startIdx !== -1) {
  checklistContent = constLines.slice(startIdx).join('\n');
  constLines.splice(startIdx, constLines.length - startIdx);
  fs.writeFileSync(constantsFile, constLines.join('\n'));
}

if (checklistContent.trim().length > 0) {
  fs.writeFileSync('src/checklists.ts', checklistContent);
}

// 3. Update index.ts to import from checklists.ts
const indexFile = 'src/index.ts';
let indexLines = fs.readFileSync(indexFile, 'utf8').split('\n');

const cImport = indexLines.findIndex(l => l.includes("from './constants'"));
if (cImport !== -1 && indexLines[cImport].includes('PHASE_CHECKLISTS')) {
  indexLines[cImport] = indexLines[cImport].replace(', PHASE_CHECKLISTS, ChecklistItem', '');
}
indexLines.splice(1, 0, "import { PHASE_CHECKLISTS, ChecklistItem } from './checklists';");
fs.writeFileSync(indexFile, indexLines.join('\n'));

// 4. Update policies.ts
const policiesFile = 'src/routes/policies.ts';
let policiesLines = fs.readFileSync(policiesFile, 'utf8').split('\n');
const pImportIdx = policiesLines.findIndex(l => l.includes("from '../constants'") && l.includes('PHASE_CHECKLISTS'));
if (pImportIdx !== -1) {
  policiesLines[pImportIdx] = "import { PHASE_CHECKLISTS, ChecklistItem } from '../checklists';";
} else {
  const oldImport = policiesLines.findIndex(l => l.includes("from '../index'") && l.includes('PHASE_CHECKLISTS'));
  if (oldImport !== -1) {
    policiesLines[oldImport] = "import { PHASE_CHECKLISTS, ChecklistItem } from '../checklists';";
  } else {
    policiesLines.splice(1, 0, "import { PHASE_CHECKLISTS, ChecklistItem } from '../checklists';");
  }
}

// Ensure escapeHtml is imported in policies.ts from '../helpers'
const helpersImport = policiesLines.findIndex(l => l.includes("from '../helpers'"));
if (helpersImport !== -1 && !policiesLines[helpersImport].includes('escapeHtml')) {
  policiesLines[helpersImport] = policiesLines[helpersImport].replace("logAudit", "logAudit, escapeHtml");
}

fs.writeFileSync(policiesFile, policiesLines.join('\n'));
console.log('Fixed imports');
