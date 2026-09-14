import { test, expect } from '@playwright/test';

// Bloco de verificação de segurança da tela de entrada: aparece SÓ quando o
// servidor pede, e monta o widget com a chave que ele mandou.
//
// Por que isto é e2e e não jsdom: o defeito que motivou o teste é de CASCATA de
// CSS. `.login-challenge` declara `display: flex`, e folha de autor vence a do
// agente — então o atributo `hidden` virava decoração e o bloco ficava VISÍVEL
// em produção, anunciando "Conclua a verificação de segurança" para quem só
// tinha aberto a página. O jsdom não reproduz: ele devolve `display: none` para
// `[hidden]` de qualquer jeito, então um teste lá passa com e sem a correção —
// foi verificado antes de escrever este arquivo. Só navegador de verdade pega.
//
// O script do Turnstile é interceptado: teste que busca script de terceiro
// depende da rede e da disposição do Cloudflare em servir um headless.

const SITE_KEY = '0xCHAVEDETESTE';

/** Responde ao script do Turnstile com um dublê que registra as chamadas. */
async function dubleDoTurnstile(page) {
  await page.route('**/challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        window.__turnstile = { render: [], reset: 0, remove: 0 };
        let resolver = null;
        window.turnstile = {
          render: (alvo, opcoes) => {
            window.__turnstile.render.push({ alvo: String(alvo), sitekey: opcoes.sitekey });
            document.querySelector(alvo).innerHTML = '<iframe title="dublê"></iframe>';
            // Resolve sozinho, como uma pessoa resolvendo o desafio: é o que
            // reabilita o botão. Sem isto o teste não conseguiria nem clicar de
            // novo — e é esse travamento que protege contra enviar sem token.
            resolver = () => opcoes.callback('token-do-duble');
            setTimeout(resolver, 0);
            return 'widget-1';
          },
          reset: () => { window.__turnstile.reset++; setTimeout(resolver, 0); },
          remove: () => { window.__turnstile.remove++; },
        };
      `,
    })
  );
}

/** Faz `/auth/login` falhar como o servidor faz quando pede desafio. */
async function loginRecusado(page, { comDesafio }) {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'E-mail ou senha incorretos. Restam 4 tentativas antes do bloqueio temporário.',
        challengeRequired: comDesafio,
        ...(comDesafio ? { challengeSiteKey: SITE_KEY } : {}),
        attemptsRemaining: 4,
      }),
    })
  );
}

async function tentarEntrar(page) {
  await page.fill('#login-email', 'alguem@exemplo.invalido');
  await page.fill('#login-password', 'errada');
  await page.click('#login-submit');
}

test.describe('verificação de segurança na entrada', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 401, body: '{}' }));
    await dubleDoTurnstile(page);
  });

  test('numa visita limpa o bloco não aparece', async ({ page }) => {
    await page.goto('/login.html');
    // `toBeHidden` olha a RENDERIZAÇÃO, não o atributo — é essa a diferença que
    // o defeito explorava.
    await expect(page.locator('#login-challenge')).toBeHidden();
  });

  test('o bloco continua escondido quando o servidor NÃO pede desafio', async ({ page }) => {
    await loginRecusado(page, { comDesafio: false });
    await page.goto('/login.html');
    await tentarEntrar(page);
    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-challenge')).toBeHidden();
  });

  test('quando o servidor pede, o bloco aparece e o widget monta com a chave dele', async ({ page }) => {
    await loginRecusado(page, { comDesafio: true });
    await page.goto('/login.html');
    await tentarEntrar(page);

    await expect(page.locator('#login-challenge')).toBeVisible();
    await expect(page.locator('#login-challenge-widget iframe')).toBeVisible();
    const chamadas = await page.evaluate(() => window.__turnstile.render);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].sitekey).toBe(SITE_KEY);
  });

  test('a segunda falha reinicia o widget em vez de montar outro', async ({ page }) => {
    await loginRecusado(page, { comDesafio: true });
    await page.goto('/login.html');
    await tentarEntrar(page);
    await expect(page.locator('#login-challenge-widget iframe')).toBeVisible();
    // O botão só reabilita quando o desafio é resolvido — esperar por isso é
    // parte do que o teste prova.
    await expect(page.locator('#login-submit')).toBeEnabled();
    await tentarEntrar(page);

    // O token do Turnstile é de uso único: sem reiniciar, a tentativa seguinte
    // seria recusada por "token já usado" e a pessoa ficaria presa.
    await expect.poll(() => page.evaluate(() => window.__turnstile.reset)).toBe(1);
    expect(await page.evaluate(() => window.__turnstile.render.length)).toBe(1);
  });
});
