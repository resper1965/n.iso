import React, { useState } from 'react';

interface Control {
  id: string;
  category: 'Organizational' | 'People' | 'Physical' | 'Technological';
  title: string;
  isApplicable: boolean;
  justification: string;
}

const SoAEditor: React.FC = () => {
  const [viewMode, setViewMode] = useState<'ISMS' | 'PIMS'>('ISMS');
  const [controls, setControls] = useState<Control[]>([
    { id: 'A.5.1', category: 'Organizational', title: 'Policies for information security', isApplicable: true, justification: 'Base for ISMS governance.' },
    { id: 'A.5.7', category: 'Organizational', title: 'Threat intelligence', isApplicable: true, justification: 'Proactive threat monitoring.' },
    { id: 'A.5.23', category: 'Organizational', title: 'Cloud services security', isApplicable: true, justification: 'Using Cloudflare Workers and Neon DB.' },
    { id: 'A.6.7', category: 'People', title: 'Remote working', isApplicable: true, justification: 'Remote-first organization.' },
    { id: 'A.7.4', category: 'Physical', title: 'Physical security monitoring', isApplicable: false, justification: 'Virtual office with no physical data center.' },
    { id: 'A.8.10', category: 'Technological', title: 'Information deletion', isApplicable: true, justification: 'Compliance with GDPR/LGPD.' },
    { id: 'A.8.11', category: 'Data masking', title: 'Data masking', isApplicable: true, justification: 'Protecting PII in test environments.' },
    { id: 'A.8.25', category: 'Technological', title: 'Secure SDLC', isApplicable: true, justification: 'Ensuring security in code development.' },
    { id: 'P.7.2', category: 'Organizational', title: 'Customer Data Privacy', isApplicable: true, justification: 'Handling SaaS user PII.' },
    { id: 'P.7.3', category: 'Technological', title: 'Data Encryption (PII)', isApplicable: true, justification: 'AES-256 for user personal data.' },
  ]);

  const toggleApplicability = (id: string) => {
    setControls(prev => prev.map(c => 
      c.id === id ? { ...c, isApplicable: !c.isApplicable } : c
    ));
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-blue-400">Statement of Applicability (SoA) .</h1>
          <div className="flex gap-4 mt-4">
            <button 
              onClick={() => setViewMode('ISMS')}
              className={`pb-2 px-4 transition-all ${viewMode === 'ISMS' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-slate-500'}`}
            >
              ISMS (ISO 27001)
            </button>
            <button 
              onClick={() => setViewMode('PIMS')}
              className={`pb-2 px-4 transition-all ${viewMode === 'PIMS' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-slate-500'}`}
            >
              PIMS (ISO 27701)
            </button>
          </div>
        </div>
        <button className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20">
          Publish v1.0
        </button>
      </header>

      <div className="space-y-4">
        {['Organizational', 'People', 'Physical', 'Technological'].map(cat => (
          <div key={cat} className={`${controls.filter(c => c.category === cat && (viewMode === 'ISMS' ? c.id.startsWith('A') : c.id.startsWith('P'))).length === 0 ? 'hidden' : 'mb-8'}`}>
            <h2 className="text-xl font-semibold mb-4 text-slate-300 border-b border-slate-800 pb-2">{cat} Controls</h2>
            <div className="grid gap-3">
              {controls.filter(c => c.category === cat && (viewMode === 'ISMS' ? c.id.startsWith('A') : c.id.startsWith('P'))).map(ctrl => (
                <div key={ctrl.id} className={`p-4 rounded-xl border transition-all ${ctrl.isApplicable ? 'bg-slate-800 border-blue-500/50' : 'bg-slate-900/50 border-slate-800 grayscale'}`}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-blue-400 text-sm">{ctrl.id}</span>
                      <h3 className="font-medium">{ctrl.title}</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={ctrl.isApplicable} onChange={() => toggleApplicability(ctrl.id)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                  {ctrl.isApplicable && (
                    <div className="mt-3 text-sm text-slate-500 italic bg-slate-950/50 p-2 rounded-lg">
                      Justification: {ctrl.justification}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SoAEditor;
