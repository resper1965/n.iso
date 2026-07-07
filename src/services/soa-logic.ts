// ponytail: data-driven SoA engine — 93 rules, one loop
export interface DiscoveryAnswers {
  hasCloud: boolean;
  hasRemoteWork: boolean;
  hasSoftwareDev: boolean;
  hasPhysicalOffice: boolean;
  processesPII: boolean;
  vendors: string[];
  hasMobileDevices: boolean;
  hasThirdPartyAccess: boolean;
  hasCriticalData: boolean;
  handlesPayments: boolean;
  hasWebApps: boolean;
  hasAPIs: boolean;
  hasEncryption: boolean;
  hasBYOD: boolean;
  hasCloudMulti: boolean;
  sector: string;
}

export interface SoADecision {
  controlId: string;
  isApplicable: boolean;
  justification: string;
}

interface Rule {
  controlId: string;
  title: string;
  condition: (a: DiscoveryAnswers) => boolean;
  justificationTrue: string;
  justificationFalse: string;
}

// Helpers for common conditions
const always = () => true;
const cloud = (a: DiscoveryAnswers) => a.hasCloud;
const dev = (a: DiscoveryAnswers) => a.hasSoftwareDev;
const pii = (a: DiscoveryAnswers) => a.processesPII;
const physical = (a: DiscoveryAnswers) => a.hasPhysicalOffice;
const remote = (a: DiscoveryAnswers) => a.hasRemoteWork;
const mobile = (a: DiscoveryAnswers) => a.hasMobileDevices;
const thirdParty = (a: DiscoveryAnswers) => a.hasThirdPartyAccess || a.vendors.length > 0;
const critical = (a: DiscoveryAnswers) => a.hasCriticalData;
const payments = (a: DiscoveryAnswers) => a.handlesPayments;
const webApps = (a: DiscoveryAnswers) => a.hasWebApps;
const apis = (a: DiscoveryAnswers) => a.hasAPIs;
const byod = (a: DiscoveryAnswers) => a.hasBYOD;
const multiCloud = (a: DiscoveryAnswers) => a.hasCloudMulti;
const regulated = (a: DiscoveryAnswers) => ['finance', 'health', 'government'].includes(a.sector);

const RULES: Rule[] = [
  // ═══════════════════════════════════════════════════════════════
  // A.5 Organizational Controls (37)
  // ═══════════════════════════════════════════════════════════════
  { controlId: 'A.5.1', title: 'Policies for information security', condition: always, justificationTrue: 'Universal ISMS requirement.', justificationFalse: '' },
  { controlId: 'A.5.2', title: 'Information security roles and responsibilities', condition: always, justificationTrue: 'Required for clear accountability.', justificationFalse: '' },
  { controlId: 'A.5.3', title: 'Segregation of duties', condition: always, justificationTrue: 'Prevents fraud and error through duty separation.', justificationFalse: '' },
  { controlId: 'A.5.4', title: 'Management responsibilities', condition: always, justificationTrue: 'Management commitment is foundational to ISMS.', justificationFalse: '' },
  { controlId: 'A.5.5', title: 'Contact with authorities', condition: always, justificationTrue: 'Required for incident reporting and compliance.', justificationFalse: '' },
  { controlId: 'A.5.6', title: 'Contact with special interest groups', condition: always, justificationTrue: 'Threat intelligence and best practice sharing.', justificationFalse: '' },
  { controlId: 'A.5.7', title: 'Threat intelligence', condition: always, justificationTrue: 'Proactive threat awareness is universally beneficial.', justificationFalse: '' },
  { controlId: 'A.5.8', title: 'Information security in project management', condition: always, justificationTrue: 'Security must be embedded in all projects.', justificationFalse: '' },
  { controlId: 'A.5.9', title: 'Inventory of information and other associated assets', condition: always, justificationTrue: 'Asset inventory is foundational to risk management.', justificationFalse: '' },
  { controlId: 'A.5.10', title: 'Acceptable use of information and other associated assets', condition: always, justificationTrue: 'Defines acceptable behavior for all personnel.', justificationFalse: '' },
  { controlId: 'A.5.11', title: 'Return of assets', condition: always, justificationTrue: 'Required for personnel offboarding.', justificationFalse: '' },
  { controlId: 'A.5.12', title: 'Classification of information', condition: always, justificationTrue: 'Data classification drives proportional protection.', justificationFalse: '' },
  { controlId: 'A.5.13', title: 'Labelling of information', condition: always, justificationTrue: 'Labelling supports classification enforcement.', justificationFalse: '' },
  { controlId: 'A.5.14', title: 'Information transfer', condition: always, justificationTrue: 'All organizations transfer information externally.', justificationFalse: '' },
  { controlId: 'A.5.15', title: 'Access control', condition: always, justificationTrue: 'Logical access control is universally required.', justificationFalse: '' },
  { controlId: 'A.5.16', title: 'Identity management', condition: always, justificationTrue: 'Unique identity for accountability.', justificationFalse: '' },
  { controlId: 'A.5.17', title: 'Authentication information', condition: always, justificationTrue: 'Credential management is universally required.', justificationFalse: '' },
  { controlId: 'A.5.18', title: 'Access rights', condition: always, justificationTrue: 'Provisioning and review of access rights.', justificationFalse: '' },
  { controlId: 'A.5.19', title: 'Information security in supplier relationships', condition: thirdParty, justificationTrue: 'Third-party/vendor relationships identified.', justificationFalse: 'No supplier or third-party relationships identified.' },
  { controlId: 'A.5.20', title: 'Addressing information security within supplier agreements', condition: thirdParty, justificationTrue: 'Contractual security clauses needed for suppliers.', justificationFalse: 'No supplier agreements to address.' },
  { controlId: 'A.5.21', title: 'Managing information security in the ICT supply chain', condition: thirdParty, justificationTrue: 'ICT supply chain risks identified.', justificationFalse: 'No ICT supply chain dependencies.' },
  { controlId: 'A.5.22', title: 'Monitoring, review and change management of supplier services', condition: thirdParty, justificationTrue: 'Ongoing supplier oversight required.', justificationFalse: 'No supplier services to monitor.' },
  { controlId: 'A.5.23', title: 'Information security for use of cloud services', condition: cloud, justificationTrue: 'Cloud infrastructure in use.', justificationFalse: 'No cloud services identified.' },
  { controlId: 'A.5.24', title: 'Information security incident management planning and preparation', condition: always, justificationTrue: 'Incident preparedness is universal.', justificationFalse: '' },
  { controlId: 'A.5.25', title: 'Assessment and decision on information security events', condition: always, justificationTrue: 'Event triage process required.', justificationFalse: '' },
  { controlId: 'A.5.26', title: 'Response to information security incidents', condition: always, justificationTrue: 'Incident response capability required.', justificationFalse: '' },
  { controlId: 'A.5.27', title: 'Learning from information security incidents', condition: always, justificationTrue: 'Continuous improvement from incidents.', justificationFalse: '' },
  { controlId: 'A.5.28', title: 'Collection of evidence', condition: always, justificationTrue: 'Evidence preservation for investigations.', justificationFalse: '' },
  { controlId: 'A.5.29', title: 'Information security during disruption', condition: always, justificationTrue: 'Security continuity during disruptions.', justificationFalse: '' },
  { controlId: 'A.5.30', title: 'ICT readiness for business continuity', condition: always, justificationTrue: 'ICT continuity planning is universally needed.', justificationFalse: '' },
  { controlId: 'A.5.31', title: 'Legal, statutory, regulatory and contractual requirements', condition: always, justificationTrue: 'Compliance obligations exist for all organizations.', justificationFalse: '' },
  { controlId: 'A.5.32', title: 'Intellectual property rights', condition: always, justificationTrue: 'IP protection applies to all organizations.', justificationFalse: '' },
  { controlId: 'A.5.33', title: 'Protection of records', condition: always, justificationTrue: 'Record retention and protection required.', justificationFalse: '' },
  { controlId: 'A.5.34', title: 'Privacy and protection of PII', condition: pii, justificationTrue: 'PII processing identified — privacy controls mandatory.', justificationFalse: 'No PII processing identified.' },
  { controlId: 'A.5.35', title: 'Independent review of information security', condition: always, justificationTrue: 'Independent assurance is an ISMS requirement.', justificationFalse: '' },
  { controlId: 'A.5.36', title: 'Compliance with policies, rules and standards for information security', condition: always, justificationTrue: 'Compliance verification is universal.', justificationFalse: '' },
  { controlId: 'A.5.37', title: 'Documented operating procedures', condition: always, justificationTrue: 'Operational procedures must be documented.', justificationFalse: '' },

  // ═══════════════════════════════════════════════════════════════
  // A.6 People Controls (8)
  // ═══════════════════════════════════════════════════════════════
  { controlId: 'A.6.1', title: 'Screening', condition: always, justificationTrue: 'Background verification for all personnel.', justificationFalse: '' },
  { controlId: 'A.6.2', title: 'Terms and conditions of employment', condition: always, justificationTrue: 'Security responsibilities in employment contracts.', justificationFalse: '' },
  { controlId: 'A.6.3', title: 'Information security awareness, education and training', condition: always, justificationTrue: 'Security awareness is universal.', justificationFalse: '' },
  { controlId: 'A.6.4', title: 'Disciplinary process', condition: always, justificationTrue: 'Consequences for policy violations.', justificationFalse: '' },
  { controlId: 'A.6.5', title: 'Responsibilities after termination or change of employment', condition: always, justificationTrue: 'Post-employment obligations required.', justificationFalse: '' },
  { controlId: 'A.6.6', title: 'Confidentiality or non-disclosure agreements', condition: always, justificationTrue: 'NDAs protect sensitive information.', justificationFalse: '' },
  { controlId: 'A.6.7', title: 'Remote working', condition: remote, justificationTrue: 'Remote work arrangements identified.', justificationFalse: 'No remote working arrangements.' },
  { controlId: 'A.6.8', title: 'Information security event reporting', condition: always, justificationTrue: 'All personnel must be able to report events.', justificationFalse: '' },

  // ═══════════════════════════════════════════════════════════════
  // A.7 Physical Controls (14)
  // ═══════════════════════════════════════════════════════════════
  { controlId: 'A.7.1', title: 'Physical security perimeters', condition: physical, justificationTrue: 'Physical office/facility identified.', justificationFalse: 'Fully remote/cloud — no physical perimeter.' },
  { controlId: 'A.7.2', title: 'Physical entry', condition: physical, justificationTrue: 'Physical access control needed for premises.', justificationFalse: 'No physical premises requiring entry control.' },
  { controlId: 'A.7.3', title: 'Securing offices, rooms and facilities', condition: physical, justificationTrue: 'Physical spaces require securing.', justificationFalse: 'No offices or facilities to secure.' },
  { controlId: 'A.7.4', title: 'Physical security monitoring', condition: physical, justificationTrue: 'Monitoring of physical premises required.', justificationFalse: 'No physical premises to monitor.' },
  { controlId: 'A.7.5', title: 'Protecting against physical and environmental threats', condition: physical, justificationTrue: 'Environmental protection for facilities.', justificationFalse: 'No facilities exposed to physical threats.' },
  { controlId: 'A.7.6', title: 'Working in secure areas', condition: physical, justificationTrue: 'Secure area procedures for sensitive operations.', justificationFalse: 'No secure areas defined.' },
  { controlId: 'A.7.7', title: 'Clear desk and clear screen', condition: always, justificationTrue: 'Applies to all workstations including remote.', justificationFalse: '' },
  { controlId: 'A.7.8', title: 'Equipment siting and protection', condition: physical, justificationTrue: 'Equipment in physical premises needs protection.', justificationFalse: 'No on-premise equipment to protect.' },
  { controlId: 'A.7.9', title: 'Security of assets off-premises', condition: (a) => remote(a) || mobile(a), justificationTrue: 'Assets used outside premises require protection.', justificationFalse: 'No off-premises asset usage identified.' },
  { controlId: 'A.7.10', title: 'Storage media', condition: always, justificationTrue: 'Media handling applies to all organizations.', justificationFalse: '' },
  { controlId: 'A.7.11', title: 'Supporting utilities', condition: physical, justificationTrue: 'Power/cooling for on-premise infrastructure.', justificationFalse: 'No on-premise infrastructure requiring utilities.' },
  { controlId: 'A.7.12', title: 'Cabling security', condition: physical, justificationTrue: 'Physical cabling in premises.', justificationFalse: 'No physical cabling to protect.' },
  { controlId: 'A.7.13', title: 'Equipment maintenance', condition: always, justificationTrue: 'All equipment requires maintenance.', justificationFalse: '' },
  { controlId: 'A.7.14', title: 'Secure disposal or re-use of equipment', condition: always, justificationTrue: 'Secure disposal applies universally.', justificationFalse: '' },

  // ═══════════════════════════════════════════════════════════════
  // A.8 Technological Controls (34)
  // ═══════════════════════════════════════════════════════════════
  { controlId: 'A.8.1', title: 'User endpoint devices', condition: always, justificationTrue: 'Endpoint security is universally required.', justificationFalse: '' },
  { controlId: 'A.8.2', title: 'Privileged access rights', condition: always, justificationTrue: 'Privileged access management is universal.', justificationFalse: '' },
  { controlId: 'A.8.3', title: 'Information access restriction', condition: always, justificationTrue: 'Need-to-know access restriction.', justificationFalse: '' },
  { controlId: 'A.8.4', title: 'Access to source code', condition: dev, justificationTrue: 'Source code access control for development teams.', justificationFalse: 'No software development — no source code to protect.' },
  { controlId: 'A.8.5', title: 'Secure authentication', condition: always, justificationTrue: 'Secure authentication is universal.', justificationFalse: '' },
  { controlId: 'A.8.6', title: 'Capacity management', condition: always, justificationTrue: 'Resource capacity planning is universal.', justificationFalse: '' },
  { controlId: 'A.8.7', title: 'Protection against malware', condition: always, justificationTrue: 'Malware protection is universally required.', justificationFalse: '' },
  { controlId: 'A.8.8', title: 'Management of technical vulnerabilities', condition: always, justificationTrue: 'Vulnerability management is universal.', justificationFalse: '' },
  { controlId: 'A.8.9', title: 'Configuration management', condition: always, justificationTrue: 'Secure configuration baselines required.', justificationFalse: '' },
  { controlId: 'A.8.10', title: 'Information deletion', condition: always, justificationTrue: 'Data lifecycle management is universal.', justificationFalse: '' },
  { controlId: 'A.8.11', title: 'Data masking', condition: (a) => pii(a) || critical(a), justificationTrue: 'Sensitive/PII data requires masking in non-production.', justificationFalse: 'No sensitive data requiring masking.' },
  { controlId: 'A.8.12', title: 'Data leakage prevention', condition: (a) => critical(a) || pii(a) || regulated(a), justificationTrue: 'DLP needed for sensitive/regulated data.', justificationFalse: 'No high-risk data leakage scenarios identified.' },
  { controlId: 'A.8.13', title: 'Information backup', condition: always, justificationTrue: 'Backup is universally required.', justificationFalse: '' },
  { controlId: 'A.8.14', title: 'Redundancy of information processing facilities', condition: (a) => critical(a) || regulated(a), justificationTrue: 'Critical/regulated operations require redundancy.', justificationFalse: 'No critical systems requiring redundancy.' },
  { controlId: 'A.8.15', title: 'Logging', condition: always, justificationTrue: 'Activity logging is universal.', justificationFalse: '' },
  { controlId: 'A.8.16', title: 'Monitoring activities', condition: always, justificationTrue: 'Security monitoring is universal.', justificationFalse: '' },
  { controlId: 'A.8.17', title: 'Clock synchronization', condition: always, justificationTrue: 'Time synchronization for log correlation.', justificationFalse: '' },
  { controlId: 'A.8.18', title: 'Use of privileged utility programs', condition: always, justificationTrue: 'Restricting privileged utilities is universal.', justificationFalse: '' },
  { controlId: 'A.8.19', title: 'Installation of software on operational systems', condition: always, justificationTrue: 'Software installation controls are universal.', justificationFalse: '' },
  { controlId: 'A.8.20', title: 'Networks security', condition: always, justificationTrue: 'Network security is universally required.', justificationFalse: '' },
  { controlId: 'A.8.21', title: 'Security of network services', condition: always, justificationTrue: 'Network service security is universal.', justificationFalse: '' },
  { controlId: 'A.8.22', title: 'Segregation of networks', condition: (a) => critical(a) || payments(a) || regulated(a), justificationTrue: 'Network segmentation for sensitive environments.', justificationFalse: 'No requirement for network segregation identified.' },
  { controlId: 'A.8.23', title: 'Web filtering', condition: (a) => physical(a) || !remote(a), justificationTrue: 'Web filtering for managed environments.', justificationFalse: 'Fully remote workforce — web filtering deferred to endpoint controls.' },
  { controlId: 'A.8.24', title: 'Use of cryptography', condition: always, justificationTrue: 'Cryptography for data protection is universal.', justificationFalse: '' },
  { controlId: 'A.8.25', title: 'Secure development life cycle', condition: dev, justificationTrue: 'SDLC security for in-house development.', justificationFalse: 'No software development activities.' },
  { controlId: 'A.8.26', title: 'Application security requirements', condition: (a) => dev(a) || webApps(a), justificationTrue: 'Application security requirements for dev/web apps.', justificationFalse: 'No applications developed or operated.' },
  { controlId: 'A.8.27', title: 'Secure system architecture and engineering principles', condition: (a) => dev(a) || webApps(a), justificationTrue: 'Secure architecture for systems in scope.', justificationFalse: 'No system engineering activities.' },
  { controlId: 'A.8.28', title: 'Secure coding', condition: dev, justificationTrue: 'Secure coding standards for development teams.', justificationFalse: 'No coding activities identified.' },
  { controlId: 'A.8.29', title: 'Security testing in development and acceptance', condition: dev, justificationTrue: 'Security testing in SDLC.', justificationFalse: 'No development requiring security testing.' },
  { controlId: 'A.8.30', title: 'Outsourced development', condition: (a) => thirdParty(a) && dev(a), justificationTrue: 'Outsourced development relationships identified.', justificationFalse: 'No outsourced development.' },
  { controlId: 'A.8.31', title: 'Separation of development, test and production environments', condition: dev, justificationTrue: 'Environment separation for development teams.', justificationFalse: 'No development environments to separate.' },
  { controlId: 'A.8.32', title: 'Change management', condition: always, justificationTrue: 'Change management is universal.', justificationFalse: '' },
  { controlId: 'A.8.33', title: 'Test information', condition: dev, justificationTrue: 'Test data protection for development activities.', justificationFalse: 'No test environments requiring data protection.' },
  { controlId: 'A.8.34', title: 'Protection of information systems during audit testing', condition: always, justificationTrue: 'Audit testing safeguards are universal.', justificationFalse: '' },
];

export class SoALogicEngine {
  /** Dedução inteligente de aplicabilidade baseada no Assessment */
  static generateDraftSoA(answers: DiscoveryAnswers): SoADecision[] {
    return RULES.map((r) => {
      const applicable = r.condition(answers);
      return {
        controlId: r.controlId,
        isApplicable: applicable,
        justification: applicable ? r.justificationTrue : r.justificationFalse,
      };
    });
  }
}
