const fs = require('fs');
const file = 'src/index.ts';
let lines = fs.readFileSync(file, 'utf8').split('\n');

function getLines(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

const policiesContent = `import { Hono } from 'hono';
import type { Bindings, Variables, ChecklistItem } from '../index';
import { PHASE_CHECKLISTS } from '../index';
import { genId, logAudit, escapeHtml } from '../helpers';
import { PolicyAgent } from '../agents/policy';
import { MemoryService } from '../services/memory';

const policies = new Hono<{ Bindings: Bindings; Variables: Variables }>();

` +
getLines(2923, 3232) + '\n\n' +
getLines(4323, 4391) + '\n\n' +
getLines(5023, 5358) + '\n\n' +
'export default policies;\n';

const finalPoliciesContent = policiesContent.replace(/app\.(get|post|put|delete)/g, 'policies.$1');
fs.writeFileSync('src/routes/policies.ts', finalPoliciesContent);

// Remove the extracted lines and escapeHtml from index.ts
lines.splice(5022, 5358 - 5022 + 1);
lines.splice(4322, 4391 - 4322 + 1);
lines.splice(2922, 3232 - 2922 + 1);
lines.splice(64, 69 - 64 + 1); // escapeHtml

// Find where to mount
const catchAllIdx = lines.findIndex(l => l.includes("app.route('', risks);"));
if (catchAllIdx !== -1) {
  lines.splice(catchAllIdx + 1, 0, "app.route('', policies);");
}

// Find where to import
const importIdx = lines.findIndex(l => l.includes("import risks from './routes/risks';"));
if (importIdx !== -1) {
  lines.splice(importIdx + 1, 0, "import policies from './routes/policies';");
}

// Add escapeHtml to helpers import
const helpersImportIdx = lines.findIndex(l => l.includes("from './helpers'"));
if (helpersImportIdx !== -1) {
  lines[helpersImportIdx] = lines[helpersImportIdx].replace("requireProjectAccess }", "requireProjectAccess, escapeHtml }");
}

fs.writeFileSync(file, lines.join('\n'));
console.log('Extraction complete!');
