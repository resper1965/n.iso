// Unidade de PolicyGeneratorService (services/policy-generator.ts, era 2.5%).
// Cobre a decisão de aplicabilidade por SoA (shouldGenerate), a validação de
// trust boundary do nome do template e da versão da norma, o fallback de versão
// para v2022 em 404, a interpolação dos placeholders e o ID dinâmico do
// documento. O `assetsFetcher` é dublado — nada toca o binding ASSETS real.
import { describe, it, expect, vi } from 'vitest';
import { PolicyGeneratorService } from '../src/services/policy-generator';
import type { PolicyContext } from '../src/services/policy-generator';

const baseCtx: PolicyContext = {
  organizationName: 'ACME S.A.',
  policyOwner: 'CISO',
  approver: 'CEO',
  status: 'Draft',
  standardVersion: 'v2022',
};

function fetcher(map: Record<string, { status: number; body?: string }>) {
  return {
    fetch: vi.fn(async (req: Request) => {
      const url = new URL(req.url).pathname;
      const hit = map[url];
      if (!hit) return { ok: false, status: 404, text: async () => '' };
      return { ok: hit.status >= 200 && hit.status < 300, status: hit.status, text: async () => hit.body ?? '' };
    }),
  };
}

describe('shouldGenerate', () => {
  const svc = new PolicyGeneratorService('/base');

  it('sem SoA gera qualquer template', () => {
    expect(svc.shouldGenerate('access-control-policy')).toBe(true);
  });

  it('template sem dependências mapeadas sempre gera', () => {
    expect(svc.shouldGenerate('isms-policy', { 'A.5.1': false })).toBe(true);
  });

  it('gera quando ao menos um controle dependente está aplicável', () => {
    // access-control-policy depende de A.5.15 ou A.8.2.
    expect(svc.shouldGenerate('access-control-policy', { 'A.5.15': false, 'A.8.2': true })).toBe(true);
  });

  it('não gera quando todos os controles dependentes são inaplicáveis', () => {
    expect(svc.shouldGenerate('access-control-policy', { 'A.5.15': false, 'A.8.2': false })).toBe(false);
  });

  it('ignora propriedades herdadas (constructor) como se fossem template', () => {
    // 'constructor' não está no mapa próprio → trata como sem dependência → gera.
    expect(svc.shouldGenerate('constructor', { 'A.5.1': true })).toBe(true);
  });
});

describe('generate — validações de trust boundary', () => {
  const svc = new PolicyGeneratorService('/base', fetcher({}));

  it('rejeita nome de template fora do charset seguro', async () => {
    await expect(svc.generate('../etc/passwd', baseCtx)).rejects.toThrow(/inválido/);
  });

  it('rejeita versão de norma desconhecida', async () => {
    await expect(svc.generate('isms-policy', { ...baseCtx, standardVersion: 'v9999' as any })).rejects.toThrow(/Versão de norma/);
  });

  it('bloqueia quando o SoA torna o template inaplicável', async () => {
    await expect(
      svc.generate('access-control-policy', { ...baseCtx, soa: { 'A.5.15': false, 'A.8.2': false } })
    ).rejects.toThrow(/is not applicable/);
  });

  it('erra sem o binding ASSETS', async () => {
    const semFetcher = new PolicyGeneratorService('/base');
    await expect(semFetcher.generate('isms-policy', baseCtx)).rejects.toThrow(/ASSETS/);
  });
});

describe('generate — renderização', () => {
  it('interpola placeholders e injeta o ID dinâmico do documento', async () => {
    const template = [
      '# [Organization Name] Policy',
      'Document ID: POL-OLD-000 | rev',
      'Owner: {{policy_owner}} Approver: {{approver}} Status: {{status}}',
      'Updated: {{date_modified}} Review: {{next_review_date}}',
    ].join('\n');
    const f = fetcher({ '/templates/policies/v2022/isms-policy.md': { status: 200, body: template } });
    const svc = new PolicyGeneratorService('/base', f);
    const out = await svc.generate('isms-policy', baseCtx);

    expect(out).toContain('ACME S.A. Policy'); // [Organization Name] substituído
    expect(out).toContain('Owner: CISO Approver: CEO Status: Draft');
    // ID dinâmico: POL-<3 primeiras do nome em maiúsculo>-<versão>-001.
    expect(out).toContain('POL-ISM-2022-001');
    expect(out).not.toContain('POL-OLD-000');
  });

  it('cai para v2022 quando a versão pedida dá 404', async () => {
    const f = fetcher({
      // v2026 não existe (404); v2022 existe. O `|` delimita o Document ID para
      // o marcador sobreviver à substituição do ID.
      '/templates/policies/v2022/isms-policy.md': { status: 200, body: 'Document ID: POL-X-1 | marker-v2022' },
    });
    const svc = new PolicyGeneratorService('/base', f);
    const out = await svc.generate('isms-policy', { ...baseCtx, standardVersion: 'v2026' });
    expect(out).toContain('marker-v2022');
    // Sufixo do ID reflete a versão realmente resolvida (2022), não a pedida.
    expect(out).toContain('POL-ISM-2022-001');
    // Tentou v2026 primeiro, depois v2022 → dois fetches.
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it('propaga erro quando o template não existe em nenhuma versão', async () => {
    const svc = new PolicyGeneratorService('/base', fetcher({}));
    await expect(svc.generate('isms-policy', baseCtx)).rejects.toThrow(/not found/);
  });
});

describe('listAvailableTemplates', () => {
  it('lista os templates conhecidos incluindo isms-policy e soa-template', async () => {
    const svc = new PolicyGeneratorService('/base');
    const list = await svc.listAvailableTemplates();
    expect(list).toContain('isms-policy');
    expect(list).toContain('soa-template');
    expect(list.length).toBeGreaterThan(10);
  });
});
