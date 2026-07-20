# Manual de Credenciamento e Integração do Assinador Eletrônico gov.br

Este documento descreve o passo a passo para que a organização obtenha as credenciais oficiais (`client_id` e `client_secret`) junto ao Governo Federal brasileiro (ITI) e configure o ecossistema do nISO em produção.

---

## 1. Requisitos Obrigatórios
Antes de iniciar a solicitação, certifique-se de que cumpre os pré-requisitos:

1. **Conta gov.br do Responsável**: O responsável pela solicitação deve possuir uma conta gov.br de nível **Prata** ou **Ouro**.
2. **Domínio Homologado (Apenas para Produção)**: Conforme a *Portaria SGD/MGI nº 7.076 de 2 de outubro de 2024*, a liberação de chaves para o ambiente de produção exige que o sistema esteja hospedado em um domínio oficial governamental (ex: `.gov.br`, `.jus.br`, `.leg.br`, `.tc.br`, `.edu.br`) ou que o órgão integrador possua convênio/delegação específica autorizada.
   > [!NOTE]
   > Para o ambiente de **Homologação/Testes**, o domínio pode ser genérico (como `niso.ness.workers.dev` ou `localhost`).

---

## 2. Passo a Passo para Solicitação de Credenciais

### Passo 1: Acessar o Portal de Serviços do Governo
1. Acesse o site do serviço oficial:
   [Serviço de Integração aos Produtos de Identidade Digital GOV.BR](https://www.gov.br/governodigital/pt-br/estrategias-e-governanca-digital/transformacao-digital/servico-de-integracao-aos-produtos-de-identidade-digital-gov.br)
2. Clique no botão verde **"Iniciar"** no canto direito da tela.
3. Faça login com a conta **gov.br** corporativa/gestor.

### Passo 2: Preencher o Protocolo de Solicitação
Informe os seguintes metadados da aplicação nISO no formulário:
*   **Nome do Serviço/Aplicação**: `nISO - Agentic GRC System`
*   **Finalidade**: `Assinatura eletrônica avançada de políticas de segurança da informação e termos de responsabilidade (ISO 27001/ISO 27701).`
*   **URL de Retorno (Redirect URI) - Homologação**:
    `https://niso.ness.workers.dev/api/v1/govbr/callback`
*   **Escopos Solicitados**:
    *   `sign` (Permite assinar um hash SHA-256 por vez. Recomendado para maior segurança) ou `signature_session` (Para assinatura de múltiplos documentos em lote).
    *   `govbr` (Certificado digital do gov.br para assinaturas avançadas avançadas).
    *   `icp_brasil` (Opcional: permite assinaturas qualificadas com certificados ICP-Brasil em nuvem).

### Passo 3: Aguardar Análise e Emissão
*   **Ambiente de Homologação (Testes)**: Liberado em até **3 dias úteis**. O ITI enviará as chaves para o e-mail cadastrado no protocolo.
*   **Ambiente de Produção (Real)**: Liberado em até **5 dias úteis**, após validação do fluxo em homologação.

---

## 3. Configuração de Variáveis de Ambiente no nISO
Assim que receber o `client_id` e o `client_secret` do ITI, você deve adicioná-los às variáveis de ambiente do Cloudflare Worker para ativar a conexão direta.

### No arquivo `wrangler.toml`:
Edite a seção `[vars]` ou configure diretamente no painel do Cloudflare/Wrangler Secret:

```toml
[vars]
# Define o ambiente da assinatura: 'homologation' ou 'production'
GOVBR_ENVIRONMENT = "homologation" 
GOVBR_CLIENT_ID = "niso-app-client-id-fornecido-pelo-iti"
```

E configure o segredo via CLI para segurança das chaves privadas:
```bash
npx wrangler secret put GOVBR_CLIENT_SECRET
```
*(Digite o client_secret recebido do governo quando solicitado no console).*

---

## 4. Roteiro de Homologação Técnica (Exigência do Governo)
Para liberar o ambiente de **Produção**, o governo exige o envio de um vídeo gravado demonstrando que o sistema trata as seguintes regras:

1.  **Fluxo de Conta Bronze (Mensagem de Erro)**:
    *   O vídeo deve mostrar um usuário de conta Bronze tentando assinar.
    *   O sistema deve exibir explicitamente a mensagem:
        > *"É necessário possuir conta gov.br nível prata ou ouro para utilizar o serviço de assinatura. Clique aqui para realizar o upgrade da conta."*
    *   O link de upgrade deve direcionar para: [https://confiabilidades.acesso.gov.br/](https://confiabilidades.acesso.gov.br/)
2.  **Fluxo de Conta Prata/Ouro (Sucesso)**:
    *   Demonstrar a autenticação de um usuário Prata ou Ouro.
    *   Inserir o código de autorização SMS (em homologação usa-se `12345`).
    *   Concluir a assinatura e retornar para a tela do nISO exibindo o selo de assinado.
3.  **Validação da Assinatura**:
    *   Fazer o download do PDF assinado e validar o hash no portal oficial:
        *   Para homologação: [https://validar.staging.iti.br](https://validar.staging.iti.br)
        *   Para produção: [https://validar.iti.gov.br](https://validar.iti.gov.br)
