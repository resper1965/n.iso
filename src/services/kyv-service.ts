export interface VendorPosture {
  name: string;
  hasISO27001: boolean;
  hasISO27701: boolean;
  hasSOC2: boolean;
  trustScore: number; // 0-100
}

const TRUSTED_VENDORS: Record<string, VendorPosture> = {
  'cloudflare': { name: 'Cloudflare Inc.', hasISO27001: true, hasISO27701: true, hasSOC2: true, trustScore: 98 },
  'aws': { name: 'Amazon Web Services', hasISO27001: true, hasISO27701: true, hasSOC2: true, trustScore: 98 },
  'google-cloud': { name: 'Google Cloud Platform', hasISO27001: true, hasISO27701: true, hasSOC2: true, trustScore: 97 },
  'github': { name: 'GitHub', hasISO27001: true, hasISO27701: false, hasSOC2: true, trustScore: 92 },
};

export class KYVService {
  /**
   * Avalia um fornecedor e sugere o nível de diligência necessário
   */
  static assessVendor(vendorId: string): { posture: VendorPosture | null, diligenceLevel: 'Low' | 'Medium' | 'High' } {
    const posture = TRUSTED_VENDORS[vendorId.toLowerCase()];
    
    if (!posture) {
      return { posture: null, diligenceLevel: 'High' }; // Fornecedor desconhecido exige auditoria completa
    }

    if (posture.trustScore > 90) {
      return { posture, diligenceLevel: 'Low' }; // Player de mercado certificado
    }

    return { posture, diligenceLevel: 'Medium' };
  }
}
