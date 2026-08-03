#!/bin/bash
# Prepara o D1 LOCAL do wrangler dev: schema + um usuário de teste.
set -e
cd /home/user/nISO
npx wrangler d1 execute niso-db --local --file schema.sql >/dev/null 2>&1 || true
# Espelha hashPassword() de src/helpers.ts: salt é uma STRING (uuid) codificada
# em UTF-8, não bytes hex. Errar isso faz o login falhar sem dizer por quê.
HASH=$(node -e "
const enc = new TextEncoder();
(async () => {
  const s = crypto.randomUUID();
  const km = await crypto.subtle.importKey('raw', enc.encode('password123'), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt: enc.encode(s), iterations:100000, hash:'SHA-256' }, km, 256);
  const hex = Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,'0')).join('');
  console.log(s + ':' + hex);
})();
")
npx wrangler d1 execute niso-db --local --command \
  "INSERT OR REPLACE INTO users (id,email,password_hash,name,role) VALUES ('u-test','teste@ness.io','$HASH','Teste','platform_admin');" >/dev/null
echo "usuario teste@ness.io / password123 pronto"
