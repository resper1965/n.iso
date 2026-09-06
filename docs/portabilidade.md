# Portabilidade do tenant

> `GET /api/v1/projects/<id>/export` — o cliente inteiro, num arquivo.
> Item 4.6 do `enterprise-grade-plan.md`.

## Por que existe

LGPD, art. 18, V: o titular tem direito à portabilidade. O cliente deste produto
é controlador dos dados que põe aqui, e sem um caminho de saída "seus dados são
seus" é frase de contrato sem implementação — além de ser das primeiras coisas
que uma auditoria de fornecedor pergunta.

## O que sai

Um JSON com duas partes: `manifesto` e `dados`.

As tabelas são **descobertas do próprio banco** — toda tabela com coluna
`project_id`, filtrada por ela — e não lidas de uma lista escrita à mão. A razão
é concreta: uma lista daria export incompleto no dia em que alguém criasse uma
tabela, e **export incompleto é pior que nenhum, porque parece completo**.
`test/portabilidade.test.ts` cria uma tabela nova em tempo de teste e exige que
ela apareça.

## O que NÃO sai, e por quê

Declarado no próprio manifesto, em `nao_incluido` — manifesto que só lista o que
veio deixa o resto parecer inexistente.

| Fora | Motivo |
| :--- | :--- |
| Arquivos de evidência (R2) | Vão as chaves, os hashes e os tamanhos na tabela `evidence`; o conteúdo sai por download individual. Base64 multiplica o tamanho por 1,33 e um export de 500 MB estoura o limite de resposta do Worker. |
| Vetores do Vectorize | Derivados dos documentos, reconstruíveis por reingestão. Exportar embedding é exportar artefato do modelo, não dado do cliente. |
| `api_keys` e `auditor_tokens` | Têm `project_id` e passariam pela descoberta automática. São **credenciais**, não dado do titular: um export que as carrega vira cópia viva de credenciais, guardada onde quer que o cliente ponha o arquivo. |

## Assinatura

O manifesto sempre traz `sha256` do payload — isso prova **integridade**: o
arquivo não foi alterado depois de gerado.

Prova de **origem** é a assinatura, e ela é **Ed25519**, não HMAC. A diferença
importa e é o motivo de o desenho ter mudado: uma assinatura existe para provar
origem a **quem recebe**, e com HMAC quem consegue verificar também consegue
forjar. O recipiente de um export de portabilidade é o cliente — às vezes o
sucessor dele, que nem conta tem aqui — e entregar a ele uma chave capaz de
fabricar exports falsos anularia o objetivo.

Com Ed25519 a chave privada nunca sai do Worker; a pública é publicada:

```bash
curl https://niso.ness.workers.dev/api/v1/public/export-public-key
# {"alg":"Ed25519","chave":{"kty":"OKP","crv":"Ed25519","x":"..."}}
```

Também versionada em `docs/export-public-key.json`, para quem quiser conferir
que a chave servida é a mesma que o repositório declara.

### Verificar um export recebido

```js
// Node 22+, sem dependência
import { webcrypto as c } from 'node:crypto';
const { manifesto, dados } = JSON.parse(await fs.readFile('export.json', 'utf8'));
const { chave } = await (await fetch('https://niso.ness.workers.dev/api/v1/public/export-public-key')).json();

const pub = await c.subtle.importKey('jwk', chave, { name: 'Ed25519' }, false, ['verify']);
const ok  = await c.subtle.verify(
  { name: 'Ed25519' }, pub,
  Uint8Array.from(atob(manifesto.assinatura), ch => ch.charCodeAt(0)),
  new TextEncoder().encode(JSON.stringify(dados)),   // sem indentação: a forma assinada
);
console.log(ok ? 'assinatura confere' : 'ASSINATURA INVÁLIDA');
```

### Configurar (ou rotacionar) a chave

```bash
node -e "const{webcrypto:c}=require('crypto');(async()=>{
  const p=await c.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  console.log('PRIVADA:', Buffer.from(await c.subtle.exportKey('pkcs8',p.privateKey)).toString('base64'));
  const j=await c.subtle.exportKey('jwk',p.publicKey); delete j.key_ops; delete j.ext;
  console.log('PUBLICA:', JSON.stringify(j));})()"

npx wrangler secret put EXPORT_SIGNING_KEY     # cole a PRIVADA
# e ponha a PUBLICA em `vars.EXPORT_PUBLIC_KEY` do wrangler.jsonc + docs/export-public-key.json
```

Sem a chave o export **continua saindo**, com `assinatura: null` e o motivo em
`assinatura_ausente`. Recusar o export por falta de configuração transformaria
um direito do titular em refém de setup; dizer que está assinado quando não está
seria pior.

Chave presente mas ilegível é reportada de forma **diferente** de chave ausente
(`"presente mas inválida"`): uma rotação malfeita que passasse como "ainda não
configurado" não seria investigada por ninguém.

## Quem pode baixar

Quem tem acesso ao projeto. A guarda é o `projectAccessMiddleware`, a mesma de
todas as rotas sob `/api/v1/projects/<id>/...` — o cliente vizinho recebe 403, e
há teste para isso. `somenteNess` **não** é usado: o dado é do cliente, e o
direito de levá-lo é dele. Papel read-only alcança, porque é GET.

## Limite conhecido

O export é montado em memória e devolvido numa resposta só. Para um tenant
grande isso encontra o limite do Worker antes de encontrar o do cliente. Quando
isso acontecer, o caminho é gerar em R2 e devolver URL assinada — não paginar o
export, que reintroduz o risco de arquivo incompleto que a descoberta automática
existe para evitar.
