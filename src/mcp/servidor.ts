/** Handler do MCP remoto em /mcp. A Task 4 do plano 2026-09-29-receita-agentes-mcp-remoto o completa. */
export async function handlerMcp(req: Request, env: any, ctx: any, fetchHono: (r: Request, e: any, c?: any) => Response | Promise<Response>): Promise<Response> {
  return new Response('MCP em construção', { status: 501 });
}
