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
  standard?: string;
  role?: string;
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

const OLD_RULES: Rule[] = [
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

const PIMS_RULES: Rule[] = [
  // Table A.1 - PII Controller Controls (20 controls)
  { controlId: 'A.1.1', title: 'Identify lawful basis and processing purposes', condition: always, justificationTrue: 'Legal basis identification is mandatory for Controllers.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.2', title: 'Obtaining and recording consent', condition: pii, justificationTrue: 'Consent records are required when processing PII.', justificationFalse: 'No PII processing requiring consent.', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.3', title: 'Privacy notice transparency and details', condition: always, justificationTrue: 'Notice of privacy practices is required for transparency.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.4', title: 'PII Principal rights handling', condition: pii, justificationTrue: 'Rights of access, correction, and erasure must be supported.', justificationFalse: 'No direct PII principal rights to handle.', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.5', title: 'Privacy by design and default', condition: always, justificationTrue: 'Privacy engineering is required for systems design.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.6', title: 'Data minimization and retention limits', condition: always, justificationTrue: 'Retention limit enforcement is required.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.7', title: 'Data accuracy and quality assurance', condition: always, justificationTrue: 'PII accuracy must be maintained.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.8', title: 'Privacy impact assessment (PIA/DPIA)', condition: pii, justificationTrue: 'DPIA required for processing activities.', justificationFalse: 'No high-risk PII processing requiring DPIA.', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.9', title: 'Transfer of PII across jurisdictions', condition: cloud, justificationTrue: 'Cloud data transfers involve cross-border compliance.', justificationFalse: 'No international PII transfers.', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.10', title: 'Sharing PII with third parties', condition: thirdParty, justificationTrue: 'PII shared with third-party suppliers.', justificationFalse: 'No PII sharing with third parties.', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.11', title: 'PII principal feedback mechanisms', condition: pii, justificationTrue: 'Complaints and feedback handling for principals.', justificationFalse: 'No direct principal feedback interface.', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.12', title: 'Automated decision-making limitations', condition: dev, justificationTrue: 'Automated processing rules apply to software systems.', justificationFalse: 'No automated decision-making.', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.13', title: 'Privacy officer appointment', condition: always, justificationTrue: 'DPO/Privacy manager assignment is required.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.14', title: 'PII disclosure to authorities', condition: always, justificationTrue: 'Procedures for legal disclosures of PII.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.15', title: 'PII principal notification of breach', condition: always, justificationTrue: 'Breach notification procedures for principals.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.16', title: 'PII controller accountability records', condition: always, justificationTrue: 'Accountability documentation is mandatory.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.17', title: 'PII security by design requirements', condition: always, justificationTrue: 'Security requirements in project management.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.18', title: 'PII minimization in testing', condition: dev, justificationTrue: 'Use of masked data in test environments.', justificationFalse: 'No test environments processing PII.', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.19', title: 'PII retention policies', condition: always, justificationTrue: 'Retention rules for all controller records.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Controller' },
  { controlId: 'A.1.20', title: 'PII de-identification and anonymization', condition: always, justificationTrue: 'Anonymization techniques for archival data.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Controller' },

  // Table A.2 - PII Processor Controls (15 controls)
  { controlId: 'A.2.1', title: 'Customer agreement compliance', condition: always, justificationTrue: 'Mandatory for PII Processors under customer contracts.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.2', title: 'Limitation of PII processing purpose', condition: always, justificationTrue: 'Processing restricted to customer instructions.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.3', title: 'Subcontractor authorization and agreements', condition: thirdParty, justificationTrue: 'Sub-processors require customer authorization.', justificationFalse: 'No sub-processors used.', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.4', title: 'Assistance with PII principal rights', condition: always, justificationTrue: 'Assisting Controller in resolving principal requests.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.5', title: 'PII incident notification to Controller', condition: always, justificationTrue: 'Immediate notification of breaches to Controller.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.6', title: 'Assistance with DPIAs', condition: always, justificationTrue: 'Assisting Controller with impact assessments.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.7', title: 'PII return or deletion at end of service', condition: always, justificationTrue: 'Obligation to delete or return PII post-contract.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.8', title: 'PII transmission and transport security', condition: always, justificationTrue: 'Secure transport of customer PII.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.9', title: 'PII access control for processor staff', condition: always, justificationTrue: 'Staff access to customer PII restricted.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.10', title: 'Record of processing activities for processors', condition: always, justificationTrue: 'Processor ROPA maintenance.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.11', title: 'Sub-processor tracking and audits', condition: thirdParty, justificationTrue: 'Oversight of sub-processors required.', justificationFalse: 'No sub-processors to audit.', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.12', title: 'PII disclosure request procedures', condition: always, justificationTrue: 'Handling statutory requests for customer PII.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.13', title: 'Assistance with compliance audits', condition: always, justificationTrue: 'Supporting Controller audits of the PIMS.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.14', title: 'PII temporary storage and caching', condition: always, justificationTrue: 'Secure caching and temp file policies.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },
  { controlId: 'A.2.15', title: 'Processor security accountability', condition: always, justificationTrue: 'Demonstrated security posture to Controllers.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Processor' },

  // Table A.3 - Common Privacy and Security Controls (43 controls)
  { controlId: 'A.3.1', title: 'PIMS policies and objectives', condition: always, justificationTrue: 'PIMS policies and objectives must be documented.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.2', title: 'PIMS roles and responsibilities', condition: always, justificationTrue: 'Clear assignment of PIMS duties.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.3', title: 'Segregation of duties for PII', condition: always, justificationTrue: 'Prevents unauthorized access to PII.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.4', title: 'PII awareness and training', condition: always, justificationTrue: 'Staff training on privacy and PII handling.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.5', title: 'Confidentiality agreements for PIMS', condition: always, justificationTrue: 'NDAs covering PII processing.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.6', title: 'Disciplinary process for privacy breaches', condition: always, justificationTrue: 'Enforcement of privacy policy compliance.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.7', title: 'PIMS asset inventory', condition: always, justificationTrue: 'Inventory of PII assets and databases.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.8', title: 'PII classification and tagging', condition: always, justificationTrue: 'Identifying PII classification levels.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.9', title: 'Acceptable use of PII assets', condition: always, justificationTrue: 'Acceptable use rules for database access.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.10', title: 'Access control for PII databases', condition: always, justificationTrue: 'Logical access controls for databases.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.11', title: 'Identity and authentication for PII', condition: always, justificationTrue: 'MFA and password controls for PII access.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.12', title: 'Privileged access rights to PII', condition: always, justificationTrue: 'Restricting DBA and admin access to PII.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.13', title: 'Use of cryptography for PII', condition: always, justificationTrue: 'Encryption of PII at rest and in transit.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.14', title: 'Physical security of PII locations', condition: physical, justificationTrue: 'Physical protection for on-premise PII.', justificationFalse: 'No physical premises containing PII.', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.15', title: 'Secure areas for PII processing', condition: physical, justificationTrue: 'Premises access controls for PII rooms.', justificationFalse: 'No physical secure areas.', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.16', title: 'Clear desk and clear screen for PII', condition: always, justificationTrue: 'Preventing shoulder surfing of PII.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.17', title: 'PII storage media security', condition: always, justificationTrue: 'Safe disposal of media containing PII.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.18', title: 'Capacity management for PIMS', condition: always, justificationTrue: 'Ensuring database storage availability.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.19', title: 'Malware protection on PII endpoints', condition: always, justificationTrue: 'Antivirus and EDR on PII processing endpoints.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.20', title: 'Vulnerability management for PIMS', condition: always, justificationTrue: 'Scanning databases and PIMS servers.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.21', title: 'Configuration management for databases', condition: always, justificationTrue: 'Hardening profiles for DBMS.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.22', title: 'PII backup and recovery', condition: always, justificationTrue: 'Redundant backups for PII availability.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.23', title: 'Logging of PII database access', condition: always, justificationTrue: 'Query logs and access auditing.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.24', title: 'Monitoring of PII access events', condition: always, justificationTrue: 'SOC monitoring for PII access anomalies.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.25', title: 'Clock synchronization for PIMS', condition: always, justificationTrue: 'Ensuring log timestamp integrity.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.26', title: 'Network security for PII transfer', condition: always, justificationTrue: 'TLS and VPN requirements.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.27', title: 'Segregation of PII networks', condition: (a) => critical(a) || payments(a), justificationTrue: 'Network isolation for database zones.', justificationFalse: 'No network isolation requirement identified.', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.28', title: 'Secure development for PIMS', condition: dev, justificationTrue: 'Privacy requirements in development.', justificationFalse: 'No software development activities.', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.29', title: 'Web application security for PII', condition: webApps, justificationTrue: 'WAF and security tests for customer portals.', justificationFalse: 'No web applications processing PII.', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.30', title: 'Secure coding for privacy', condition: dev, justificationTrue: 'Prevention of OWASP Top 10 vulnerabilities.', justificationFalse: 'No coding activities.', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.31', title: 'Separation of PII environments', condition: dev, justificationTrue: 'Production database isolation.', justificationFalse: 'No development environments.', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.32', title: 'Change management for PIMS', condition: always, justificationTrue: 'Database schema change controls.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.33', title: 'Test data privacy', condition: dev, justificationTrue: 'Masking customer PII in test environments.', justificationFalse: 'No test environments processing PII.', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.34', title: 'Supplier relationship policies for PIMS', condition: thirdParty, justificationTrue: 'Supplier evaluations for privacy.', justificationFalse: 'No supplier relationships.', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.35', title: 'Supplier agreements for PII', condition: thirdParty, justificationTrue: 'PIMS requirements in contracts.', justificationFalse: 'No supplier contracts.', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.36', title: 'Sub-processor security monitoring', condition: thirdParty, justificationTrue: 'Auditing supplier compliance.', justificationFalse: 'No supplier services to monitor.', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.37', title: 'PII breach incident management planning', condition: always, justificationTrue: 'Incident plan covering PII leakage.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.38', title: 'Triage and assessment of privacy events', condition: always, justificationTrue: 'Privacy breach assessment rules.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.39', title: 'Response to PII breaches', condition: always, justificationTrue: 'Regulatory/customer notification workflow.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.40', title: 'Disaster recovery for PIMS', condition: always, justificationTrue: 'PIMS recovery time objectives (RTO).', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.41', title: 'Legal and regulatory PIMS compliance', condition: always, justificationTrue: 'General legal compliance review.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.42', title: 'Independent PIMS audits', condition: always, justificationTrue: 'Independent review of privacy controls.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' },
  { controlId: 'A.3.43', title: 'Documented operating procedures for PIMS', condition: always, justificationTrue: 'Written procedures for database admins.', justificationFalse: '', standard: 'ISO 27701:2025', role: 'Both' }
];

const RULES: Rule[] = [
  ...OLD_RULES.map(r => ({ ...r, standard: 'ISO 27001:2022' })),
  ...PIMS_RULES
];

export class SoALogicEngine {
  /** Dedução inteligente de aplicabilidade baseada no Assessment e Standard/Role */
  static generateDraftSoA(answers: DiscoveryAnswers, standard: string = 'ISO 27001:2022', orgRole: string = 'Both'): SoADecision[] {
    const rules = RULES.filter(r => {
      if (r.standard !== standard) return false;
      if (standard === 'ISO 27701:2025') {
        if (r.role === 'Controller' && orgRole === 'Processor') return false;
        if (r.role === 'Processor' && orgRole === 'Controller') return false;
      }
      return true;
    });

    return rules.map((r) => {
      const applicable = r.condition(answers);
      return {
        controlId: r.controlId,
        isApplicable: applicable,
        justification: applicable ? r.justificationTrue : r.justificationFalse,
      };
    });
  }
}
