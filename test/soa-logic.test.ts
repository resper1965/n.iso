import { describe, it, expect } from 'vitest';
import { SoALogicEngine, DiscoveryAnswers } from '../src/services/soa-logic';

describe('SoA Logic Engine', () => {
  const baseAnswers: DiscoveryAnswers = {
    hasCloud: false,
    hasRemoteWork: false,
    hasSoftwareDev: false,
    hasPhysicalOffice: false,
    processesPII: false,
    vendors: [],
    hasMobileDevices: false,
    hasThirdPartyAccess: false,
    hasCriticalData: false,
    handlesPayments: false,
    hasWebApps: false,
    hasAPIs: false,
    hasEncryption: false,
    hasBYOD: false,
    hasCloudMulti: false,
    sector: 'other',
  };

  it('should include cloud controls when hasCloud is true', () => {
    const answers = { ...baseAnswers, hasCloud: true };
    const result = SoALogicEngine.generateDraftSoA(answers);
    const cloudControl = result.find(r => r.controlId === 'A.5.23');
    expect(cloudControl?.isApplicable).toBe(true);
  });

  it('should exclude physical controls when hasPhysicalOffice is false', () => {
    const answers = { ...baseAnswers, hasPhysicalOffice: false };
    const result = SoALogicEngine.generateDraftSoA(answers);
    const physicalControl = result.find(r => r.controlId === 'A.7.2');
    expect(physicalControl?.isApplicable).toBe(false);
  });

  it('should include dev controls when hasSoftwareDev is true', () => {
    const answers = { ...baseAnswers, hasSoftwareDev: true };
    const result = SoALogicEngine.generateDraftSoA(answers);
    const devControl = result.find(r => r.controlId === 'A.8.25');
    expect(devControl?.isApplicable).toBe(true);
  });
});
