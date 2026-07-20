const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf8');

// 1. type Variables -> export type Variables
code = code.replace('type Variables = {', 'export type Variables = {');

// 2. Remove helpers
code = code.replace(/\/\*\* Gera um ULID-like[^]+\nfunction genId\(\): string \{[^}]+\}\n/m, '');
code = code.replace(/\/\/ ─── Helper: gravar log de auditoria ───\nasync function logAudit\([^]+?\}\n/m, '');
code = code.replace(/\/\/ ─── Helper: criar notificação ───\nasync function createNotification\([^]+?\}\n/m, '');
code = code.replace(/\/\*\* Verifica se o usuário tem acesso ao projeto[^]+?function requireProjectAccess\([^]+?\}\n/m, '');
code = code.replace(/\/\*\* Verifica se o recurso pertence ao projeto[^]+?async function requireResourceAccess\([^]+?\}\n/m, '');

// 4. Remove riskLevel and risks endpoints
code = code.replace(/function riskLevel\([^]+?\}\n/m, '');
code = code.replace(/app\.get\('\/api\/v1\/projects\/:id\/risks',[^]+?\}\);\n/m, '');
code = code.replace(/app\.post\('\/api\/v1\/projects\/:id\/risks',[^]+?\}\);\n/m, '');
code = code.replace(/app\.put\('\/api\/v1\/risks\/:id',[^]+?\}\);\n/m, '');
code = code.replace(/app\.delete\('\/api\/v1\/risks\/:id',[^]+?\}\);\n/m, '');
code = code.replace(/app\.get\('\/api\/v1\/projects\/:id\/risks\/history',[^]+?\}\);\n/m, '');

// 6 & 7. Update calls
code = code.replace(/requireResourceAccess\(c,\s*('[^']+')\s*,\s*([a-zA-Z0-9_]+)\)/g, 'requireResourceAccess(c.env.DB, $1, $2, c.get(\'user\'))');
code = code.replace(/requireProjectAccess\(c,\s*([a-zA-Z0-9_]+)\)/g, 'requireProjectAccess(c.get(\'user\'), $1)');

// 8. Add imports
code = code.replace('// ─── Helpers ───\n', '// ─── Helpers ───\n\nimport { genId, logAudit, createNotification, requireResourceAccess, requireProjectAccess } from \'./helpers\';\nimport risks from \'./routes/risks\';\n');

// 9. Mount router
code = code.replace('app.get(\'/*\',', 'app.route(\'\', risks);\napp.get(\'/*\',');

fs.writeFileSync('src/index.ts', code);
