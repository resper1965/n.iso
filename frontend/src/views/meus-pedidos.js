// Única tela do papel `stakeholder`. A fatia 2 ocupa o corpo com a lista de pedidos atribuídos
// (`/api/v1/pedidos`); por ora o papel só entra, troca a senha e liga o MFA pelo cartão de perfil.
window.renderMeusPedidos = function renderMeusPedidos(c, h, a) {
    h.textContent = 'Meus pedidos';
    a.innerHTML = '';
    c.innerHTML = '<div class="empty-state fade-in"><h3>Nenhum pedido por enquanto</h3><p>Quando a consultoria ou a sua empresa pedir sua ciência ou aprovação de um documento, ele aparece aqui.</p></div>';
};
