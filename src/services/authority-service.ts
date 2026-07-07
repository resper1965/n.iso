export interface AuthorityContact {
  id: string;
  agencyName: string;
  purpose: string; // Ex: Incident Reporting, Regulatory Compliance
  contactPerson: string;
  email: string;
  phone: string;
  lastContactDate?: Date;
}

export class AuthorityService {
  static getMandatoryContacts(): AuthorityContact[] {
    return [
      {
        id: 'auth-01',
        agencyName: 'ANPD (Autoridade Nacional de Proteção de Dados)',
        purpose: 'Data Breach Notification / LGPD Compliance',
        contactPerson: 'Ouvidoria',
        email: 'anpd@anpd.gov.br',
        phone: '+55 61 2026-xxxx'
      },
      {
        id: 'auth-02',
        agencyName: 'CERT.br',
        purpose: 'Security Incident Coordination',
        contactPerson: 'Incident Response Team',
        email: 'cert@cert.br',
        phone: '+55 11 5509-xxxx'
      }
    ];
  }
}
