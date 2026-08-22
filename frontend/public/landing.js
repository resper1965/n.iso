// Landing pública (index.html) — script externalizado do HTML para o S2/CSP
// (permite remover 'unsafe-inline' de script-src; servido como 'self').
//
// Preços vêm da API pública — não hardcoded, para nunca divergir do que o
// backend de fato cobra (src/routes/public.ts:/pricing).
(async function () {
    const grid = document.getElementById('pricing-grid');
    if (!grid) return;
    try {
        const r = await fetch('/api/v1/public/pricing');
        const d = await r.json();
        if (!d.ok || !Array.isArray(d.tiers)) throw new Error('formato inesperado');
        grid.innerHTML = d.tiers.map((t, i) => `
            <div class="pricing-card fade-up ${i === 1 ? 'featured' : ''}" style="animation-delay:${i * 0.1}s">
                <div class="pricing-name">${t.name}</div>
                <div class="pricing-price"><span style="font-size:0.7rem">a partir de</span><br>${t.price}</div>
                <ul class="pricing-features">
                    ${t.features.map(f => `<li>${f}</li>`).join('')}
                </ul>
                <a class="btn-primary" style="width:100%" href="/login" role="button">Comecar</a>
            </div>
        `).join('');
    } catch (e) {
        grid.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;text-align:center;grid-column:1/-1">Não foi possível carregar os planos agora. <a href="/login">Entre em contato pelo login</a>.</p>';
    }
})();
