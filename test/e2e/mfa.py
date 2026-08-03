"""Exercita o fluxo de MFA na interface, de ponta a ponta, num navegador real.

Não confere só "a tela abriu": ativa o segundo fator com um código TOTP
calculado aqui, faz logout, e refaz o login exigindo o código. Se qualquer
etapa falhar, o usuário ficaria trancado para fora — que é exatamente o defeito
que este teste existe para impedir.
"""
import base64, hmac, hashlib, os, struct, time, sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8787"
SHOT = os.environ.get("NISO_E2E_SHOTS", "/tmp")


def totp(secret_b32: str, t: int | None = None) -> str:
    """TOTP RFC 6238, HMAC-SHA1, 6 dígitos, janela de 30s."""
    key = base64.b32decode(secret_b32.upper() + "=" * (-len(secret_b32) % 8))
    counter = int((t or time.time()) // 30)
    mac = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    off = mac[-1] & 0x0F
    code = (struct.unpack(">I", mac[off:off + 4])[0] & 0x7FFFFFFF) % 1000000
    return f"{code:06d}"


falhas = []


def check(cond, msg):
    print(("  OK   " if cond else "  FALHA") + " " + msg)
    if not cond:
        falhas.append(msg)


with sync_playwright() as p:
    # O Chromium do ambiente é build 1194; o playwright do pip espera outro.
    b = p.chromium.launch(headless=True, executable_path="/opt/pw-browsers/chromium")
    page = b.new_page()
    page.set_default_timeout(8000)  # falhar rápido em vez de pendurar 30s por ação
    erros_console = []
    page.on("console", lambda m: erros_console.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: erros_console.append(f"pageerror: {e}"))

    print("\n1. Login sem MFA")
    # `networkidle` nunca chega: a aplicação faz polling de notificações.
    page.goto(BASE, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_selector("#login-email", timeout=20000)
    page.fill("#login-email", "teste@ness.io")
    page.fill("#login-password", "password123")
    page.click("#standard-login-box button[type=submit]")
    page.wait_for_timeout(2500)
    check(page.locator("#login-overlay.hidden").count() == 1, "entrou na aplicação")

    print("\n2. Abrir perfil e chegar na tela de segurança")
    page.click("#sidebar-user-card")
    page.wait_for_timeout(600)
    check(page.locator("text=Autenticação em duas etapas").count() > 0,
          "perfil mostra a entrada de duas etapas")
    page.click("button:has-text('Gerenciar')")
    page.wait_for_timeout(1200)
    check(page.locator("#mfa-setup-pass").count() == 1, "tela pede a senha para ativar")

    print("\n3. Senha errada é recusada")
    page.fill("#mfa-setup-pass", "senha-errada")
    page.click("button:has-text('Ativar')")
    page.wait_for_timeout(1200)
    check("Senha incorreta" in (page.locator("#mfa-erro").inner_text() or ""),
          "senha errada não gera segredo")

    print("\n4. Senha certa gera QR e segredo")
    page.fill("#mfa-setup-pass", "password123")
    page.click("button:has-text('Ativar')")
    page.wait_for_timeout(1500)
    img = page.locator("img[alt*='QR']")
    check(img.count() == 1, "QR renderizado")
    src = img.get_attribute("src") or ""
    check(src.startswith("data:image/"), "QR é data URI (compatível com o CSP)")
    page.click("summary:has-text('Não consegue escanear')")
    page.wait_for_timeout(300)
    secret = (page.locator("code").first.inner_text() or "").strip()
    check(len(secret) >= 16, f"segredo exibido para entrada manual ({len(secret)} chars)")
    page.screenshot(path=f"{SHOT}/mfa-01-qr.png")

    print("\n5. Código errado não ativa")
    page.fill("#mfa-codigo", "000000")
    page.click("button:has-text('Confirmar e ativar')")
    page.wait_for_timeout(1200)
    check((page.locator("#mfa-erro").inner_text() or "") != "", "código inválido é recusado")

    print("\n6. Código válido ativa e mostra os códigos de recuperação")
    page.fill("#mfa-codigo", totp(secret))
    page.click("button:has-text('Confirmar e ativar')")
    page.wait_for_timeout(1800)
    txt = page.locator("#modal-content").inner_text()
    check("Segundo fator ativado" in txt, "ativação confirmada")
    linhas = [l for l in txt.split("\n") if len(l.strip()) >= 8 and "-" in l or l.strip().isalnum()]
    check(page.locator("button:has-text('Baixar .txt')").count() == 1, "oferece baixar os códigos")
    page.screenshot(path=f"{SHOT}/mfa-02-recuperacao.png")

    print("\n7. Logout e novo login: agora exige o segundo fator")
    page.click("button:has-text('Já guardei')")
    page.wait_for_timeout(400)
    page.evaluate("doLogout()")
    page.wait_for_timeout(600)
    page.fill("#login-email", "teste@ness.io")
    page.fill("#login-password", "password123")
    page.click("#standard-login-box button[type=submit]")
    page.wait_for_timeout(2000)
    check(page.locator("#mfa-login-box").is_visible(), "caixa do segundo fator aparece")
    check(page.locator("#login-overlay.hidden").count() == 0, "NÃO entrou só com a senha")
    page.screenshot(path=f"{SHOT}/mfa-03-login.png")

    print("\n8. Código errado no login não deixa entrar")
    page.fill("#mfa-login-code", "000000")
    page.click("#mfa-login-box button[type=submit]")
    page.wait_for_timeout(1500)
    check(page.locator("#login-overlay.hidden").count() == 0, "código errado é barrado")
    check((page.locator("#mfa-login-error").inner_text() or "") != "", "erro é exibido")

    print("\n9. Código certo entra")
    page.fill("#mfa-login-code", totp(secret))
    page.click("#mfa-login-box button[type=submit]")
    page.wait_for_timeout(2500)
    check(page.locator("#login-overlay.hidden").count() == 1, "entrou com o segundo fator")

    print("\n10. Status mostra ativo, e desativar exige senha")
    page.click("#sidebar-user-card")
    page.wait_for_timeout(500)
    page.click("button:has-text('Gerenciar')")
    page.wait_for_timeout(1200)
    t = page.locator("#modal-content").inner_text()
    check("Ativa" in t, "status mostra ativa")
    check("8" in t or "restantes" in t.lower(), "mostra códigos de recuperação restantes")
    check(page.locator("#mfa-off-pass").count() == 1, "desativar pede senha")
    page.screenshot(path=f"{SHOT}/mfa-04-ativo.png")

    print("\n11. Desativar derruba a sessão, como o backend faz")
    page.fill("#mfa-off-pass", "password123")
    page.click("button:has-text('Desativar')")
    page.wait_for_timeout(2000)
    check(page.locator("#login-overlay.hidden").count() == 0,
          "voltou para o login (sessões revogadas)")

    reais = [e for e in erros_console if "favicon" not in e.lower()]
    print(f"\nErros de console: {len(reais)}")
    for e in reais[:5]:
        print("   ", e[:160])

    b.close()

print("\n" + "=" * 60)
if falhas:
    print(f"FALHAS: {len(falhas)}")
    for f in falhas:
        print("  -", f)
    sys.exit(1)
print("Todas as verificações passaram.")
