const fs = require('fs');
const indexFile = 'src/index.ts';
const constantsFile = 'src/constants.ts';
const policiesFile = 'src/routes/policies.ts';

let indexLines = fs.readFileSync(indexFile, 'utf8').split('\n');

// Find ChecklistItem and PHASE_CHECKLISTS in index.ts
const startIdx = indexLines.findIndex(l => l.includes('export type ChecklistItem ='));
let endIdx = -1;
if (startIdx !== -1) {
  for (let i = startIdx + 1; i < indexLines.length; i++) {
    if (indexLines[i] === '};') {
      endIdx = i;
      break;
    }
  }
}

if (startIdx !== -1 && endIdx !== -1) {
  const extracted = indexLines.slice(startIdx, endIdx + 1).join('\n');
  indexLines.splice(startIdx - 2, endIdx - startIdx + 4); // remove the block and comments
  fs.writeFileSync(indexFile, indexLines.join('\n'));
  
  // Append to constants.ts
  fs.appendFileSync(constantsFile, '\n' + extracted + '\n');
  
  // Update imports in index.ts
  const importIdx = indexLines.findIndex(l => l.includes('import { BLOCK_QUESTIONS, PHASE_TITLES, POLICY_TEMPLATES }'));
  if (importIdx !== -1) {
    indexLines[importIdx] = indexLines[importIdx].replace('POLICY_TEMPLATES }', 'POLICY_TEMPLATES, PHASE_CHECKLISTS, ChecklistItem }');
    fs.writeFileSync(indexFile, indexLines.join('\n'));
  }
}

// Update policies.ts imports
let policiesLines = fs.readFileSync(policiesFile, 'utf8').split('\n');
for (let i = 0; i < policiesLines.length; i++) {
  if (policiesLines[i].includes("import type { Bindings, Variables, ChecklistItem } from '../index';")) {
    policiesLines[i] = "import type { Bindings, Variables } from '../index';";
  }
  if (policiesLines[i].includes("import { PHASE_CHECKLISTS } from '../index';")) {
    policiesLines[i] = "import { PHASE_CHECKLISTS, ChecklistItem } from '../constants';";
  }
}
fs.writeFileSync(policiesFile, policiesLines.join('\n'));

console.log('Moved PHASE_CHECKLISTS');
