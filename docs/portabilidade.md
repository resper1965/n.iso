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

Prova de **origem** exige assinatura, e para isso configure o segredo:

```bash
npx wrangler secret put EXPORT_SIGNING_KEY
```

Chave própria, e não a `TOKEN_ENC_KEY` que já existe: reusar uma chave para
cifrar token e para assinar export junta dois domínios de comprometimento que
não têm por que se tocar.

Sem o segredo o export **continua saindo**, com `assinatura: null` e o motivo
escrito em `assinatura_ausente`. Recusar o export por falta de configuração
transformaria um direito do titular em refém de setup; dizer que está assinado
quando não está seria pior. Fica explícito.

Conferir uma assinatura recebida:

```bash
# `dados` é o objeto sob a chave "dados", serializado sem espaços — a mesma
# forma que o Worker assinou (JSON.stringify sem indentação).
jq -cj '.dados' export.json | openssl dgst -sha256 -hmac "$EXPORT_SIGNING_KEY"
```

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
