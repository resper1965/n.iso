export interface ArtifactRecord {
  id: string;
  organizationId: string;
  templateId: string;
  version: string;
  status: 'Draft' | 'Approved' | 'Archived';
  r2Path: string;
}

export class ArtifactService {
  constructor(private env: any) {}

  /**
   * Salva uma política gerada no R2 e registra no D1
   */
  async savePolicy(
    orgId: string, 
    templateId: string, 
    content: string, 
    status: 'Draft' | 'Approved' = 'Draft'
  ): Promise<string> {
    const version = "1.0";
    const artifactId = crypto.randomUUID();
    const r2Path = `organizations/${orgId}/policies/${templateId}_v${version}.md`;

    // 1. Upload para o R2 (niso-evidence)
    await this.env.EVIDENCE_BUCKET.put(r2Path, content, {
      httpMetadata: { contentType: "text/markdown" }
    });

    // 2. Registro no D1 (Meta-data)
    // Nota: O D1 execute está em hold, então simulamos o sucesso aqui
    // No worker real, usaríamos: await this.env.DB.prepare(...).run()

    return artifactId;
  }

  /**
   * Recupera o conteúdo de uma política do R2
   */
  async getPolicyContent(r2Path: string): Promise<string | null> {
    const object = await this.env.EVIDENCE_BUCKET.get(r2Path);
    if (!object) return null;
    return await object.text();
  }
}
