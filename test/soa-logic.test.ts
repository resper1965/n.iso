import { describe, it, expect } from 'vitest';
import { SoALogicEngine, DiscoveryAnswers } from '../src/services/soa-logic';

describe('SoALogicEngine', () => {
  const minimalAnswers: DiscoveryAnswers = {
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
    sector: 'other'
  };

  const enterpriseAnswers: DiscoveryAnswers = {
    hasCloud: true,
    hasRemoteWork: true,
    hasSoftwareDev: true,
    hasPhysicalOffice: true,
    processesPII: true,
    vendors: ['AWS', 'Stripe'],
    hasMobileDevices: true,
    hasThirdPartyAccess: true,
    hasCriticalData: true,
    handlesPayments: true,
    hasWebApps: true,
    hasAPIs: true,
    hasEncryption: true,
    hasBYOD: true,
    hasCloudMulti: true,
    sector: 'finance'
  };

  describe('Group 1: Basic functionality', () => {
    it('returns an array of SoADecision objects with default ISO 27001:2022 and exactly 93 decisions', () => {
      const soa = SoALogicEngine.generateDraftSoA(minimalAnswers);
      expect(Array.isArray(soa)).toBe(true);
      expect(soa.length).toBe(93);
      soa.forEach(decision => {
        expect(decision).toHaveProperty('controlId');
        expect(decision).toHaveProperty('isApplicable');
        expect(decision).toHaveProperty('justification');
      });
    });
  });

  describe('Group 2: Universal controls (always applicable)', () => {
    it('A.5.1-A.5.6 should always be applicable regardless of answers', () => {
      const soa = SoALogicEngine.generateDraftSoA(minimalAnswers);
      const universalControls = ['A.5.1', 'A.5.2', 'A.5.3', 'A.5.4', 'A.5.5', 'A.5.6'];
      universalControls.forEach(controlId => {
        const decision = soa.find(d => d.controlId === controlId);
        expect(decision?.isApplicable).toBe(true);
      });
    });
  });

  describe('Group 3: Conditional controls', () => {
    it('A.5.23 (cloud) applicable only when hasCloud=true', () => {
      let soa = SoALogicEngine.generateDraftSoA(minimalAnswers);
      expect(soa.find(d => d.controlId === 'A.5.23')?.isApplicable).toBe(false);

      soa = SoALogicEngine.generateDraftSoA({ ...minimalAnswers, hasCloud: true });
      expect(soa.find(d => d.controlId === 'A.5.23')?.isApplicable).toBe(true);
    });

    it('A.8.25-A.8.28 (dev controls) applicable when hasSoftwareDev=true', () => {
      let soa = SoALogicEngine.generateDraftSoA(minimalAnswers);
      const devControls = ['A.8.25', 'A.8.28'];
      devControls.forEach(id => {
        expect(soa.find(d => d.controlId === id)?.isApplicable).toBe(false);
      });

      soa = SoALogicEngine.generateDraftSoA({ ...minimalAnswers, hasSoftwareDev: true });
      devControls.forEach(id => {
        expect(soa.find(d => d.controlId === id)?.isApplicable).toBe(true);
      });
    });

    it('A.7.x (physical) applicable when hasPhysicalOffice=true', () => {
      let soa = SoALogicEngine.generateDraftSoA(minimalAnswers);
      expect(soa.find(d => d.controlId === 'A.7.1')?.isApplicable).toBe(false);

      soa = SoALogicEngine.generateDraftSoA({ ...minimalAnswers, hasPhysicalOffice: true });
      expect(soa.find(d => d.controlId === 'A.7.1')?.isApplicable).toBe(true);
    });

    it('A.6.7 (remote) applicable when hasRemoteWork=true', () => {
      let soa = SoALogicEngine.generateDraftSoA(minimalAnswers);
      expect(soa.find(d => d.controlId === 'A.6.7')?.isApplicable).toBe(false);

      soa = SoALogicEngine.generateDraftSoA({ ...minimalAnswers, hasRemoteWork: true });
      expect(soa.find(d => d.controlId === 'A.6.7')?.isApplicable).toBe(true);
    });
  });

  describe('Group 4: Complex conditions', () => {
    it('enterprise profile should have most controls applicable', () => {
      const soa = SoALogicEngine.generateDraftSoA(enterpriseAnswers);
      const applicableCount = soa.filter(d => d.isApplicable).length;
      expect(applicableCount).toBeGreaterThan(80);
    });

    it('startup profile should have fewer applicable controls', () => {
      const soa = SoALogicEngine.generateDraftSoA(minimalAnswers);
      const applicableCount = soa.filter(d => d.isApplicable).length;
      const enterpriseSoa = SoALogicEngine.generateDraftSoA(enterpriseAnswers);
      const enterpriseCount = enterpriseSoa.filter(d => d.isApplicable).length;
      expect(applicableCount).toBeLessThan(enterpriseCount);
    });
  });

  describe('Group 5: ISO 27701 (PIMS)', () => {
    it('generateDraftSoA with standard=ISO 27701:2025 returns PIMS controls', () => {
      const soa = SoALogicEngine.generateDraftSoA(minimalAnswers, 'ISO 27701:2025');
      // ISO 27701 has 78 controls (20 + 15 + 43)
      expect(soa.length).toBe(78);
    });

    it('orgRole=Controller filters out Processor-only rules', () => {
      const soa = SoALogicEngine.generateDraftSoA(minimalAnswers, 'ISO 27701:2025', 'Controller');
      expect(soa.find(d => d.controlId.startsWith('A.2.'))).toBeUndefined();
      expect(soa.find(d => d.controlId.startsWith('A.1.'))).toBeDefined();
    });

    it('orgRole=Processor filters out Controller-only rules', () => {
      const soa = SoALogicEngine.generateDraftSoA(minimalAnswers, 'ISO 27701:2025', 'Processor');
      expect(soa.find(d => d.controlId.startsWith('A.1.'))).toBeUndefined();
      expect(soa.find(d => d.controlId.startsWith('A.2.'))).toBeDefined();
    });
  });
});
