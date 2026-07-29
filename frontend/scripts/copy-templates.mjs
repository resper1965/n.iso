// Copia os templates de política do backend para dist/ para que sejam servidos
// pelo binding ASSETS do Worker (PolicyGeneratorService busca-os via ASSETS.fetch
// em http://assets/templates/policies/<versao>/<nome>.md). Sem esta cópia, os
// templates ficam apenas em src/templates e a geração de política 404 em runtime.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../src/templates/policies');
const dest = resolve(here, '../dist/templates/policies');

if (!existsSync(src)) {
  console.error(`[copy-templates] fonte não encontrada: ${src}`);
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-templates] copiado ${src} -> ${dest}`);
