import React from 'react';

const AuditPortalView: React.FC = () => {
  return (
    <div className="bg-slate-50 min-h-screen font-sans text-slate-900">
      {/* Header Estilo Auditoria (Mais formal e limpo) */}
      <header className="bg-white border-b border-slate-200 p-6 shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">n</div>
            <div>
              <h1 className="text-xl font-bold">nISO Audit Portal</h1>
              <p className="text-xs text-slate-500 uppercase tracking-widest">External Auditor Access | Valid for 30 days</p>
            </div>
          </div>
          <div className="text-right">
            <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">
              ● Live Compliance Data
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Sidebar: Summary */}
        <div className="md:col-span-1 space-y-6">
          <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-sm font-bold uppercase text-slate-400 mb-4">Audit Subject</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block">Organization</label>
                <span className="font-semibold text-lg">Ness. Labs Inc.</span>
              </div>
              <div>
                <label className="text-xs text-slate-500 block">Standard</label>
                <span className="font-semibold">ISO 27001:2022 + ISO 27701</span>
              </div>
              <div className="pt-4 border-t border-slate-100">
                 <div className="flex justify-between text-sm mb-2">
                    <span>Readiness Score</span>
                    <span className="font-bold text-blue-600">92%</span>
                 </div>
                 <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-600 h-full w-[92%]"></div>
                 </div>
              </div>
            </div>
          </section>

          <section className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl shadow-blue-900/10">
            <h2 className="text-sm font-bold uppercase text-blue-400 mb-4">Download Pack</h2>
            <p className="text-xs text-slate-400 mb-4">Download all documentation and evidence logs in a secure ZIP package organized by ISO domains.</p>
            <button 
              onClick={() => alert('Audit Pack (ZIP) is being generated... \n\nFolders:\n01_Governance\n02_Risk\n03_Evidence_Technical\n04_Privacy_PIMS\n\nReady for download in 30 seconds.')}
              className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold transition-all"
            >
              Generate Audit ZIP
            </button>
          </section>
        </div>

        {/* Main Area: Document Tree */}
        <div className="md:col-span-2 space-y-6">
          <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-xl font-bold mb-6">Compliance Artifacts</h2>
            
            <div className="space-y-3">
              {[
                { name: 'ISMS Scope Statement', type: 'Policy', date: '2026-06-28', status: 'Approved' },
                { name: 'Statement of Applicability (SoA)', type: 'Standard', date: '2026-07-01', status: 'Approved' },
                { name: 'Internal Audit Report - Q2 2026', type: 'Evidence', date: '2026-06-15', status: 'Approved' },
                { name: 'Management Review Minutes', type: 'Evidence', date: '2026-06-20', status: 'Approved' },
                { name: 'Risk Assessment & Treatment Plan', type: 'Standard', date: '2026-06-25', status: 'Approved' },
              ].map((doc, i) => (
                <div key={i} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-all cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                       <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">{doc.name}</h4>
                      <div className="flex gap-3 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                        <span>{doc.type}</span>
                        <span>•</span>
                        <span>Modified {doc.date}</span>
                      </div>
                    </div>
                  </div>
                  <button className="text-blue-600 font-bold text-sm hover:underline">View</button>
                </div>
              ))}
            </div>
          </section>

          {/* Transparency & Integrity Log */}
          <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              System Integrity & Change Log
            </h2>
            <div className="space-y-4">
              {[
                { date: '2026-07-02 14:20', actor: 'Consultant', action: 'REPLACE', target: 'Internal Audit Report', note: 'Updated after auditor clarification.' },
                { date: '2026-07-01 09:45', actor: 'nISO Agent', action: 'AUTO-GEN', target: 'SoA v2022', note: 'Generated from CI/CD snapshot.' },
                { date: '2026-06-30 16:30', actor: 'C-Level', action: 'APPROVE', target: 'ISMS Policy', note: 'Formal sign-off captured.' },
              ].map((log, i) => (
                <div key={i} className="flex gap-4 text-sm border-l-2 border-slate-100 pl-4 py-1">
                  <span className="text-slate-400 font-mono text-[10px] whitespace-nowrap">{log.date}</span>
                  <div>
                    <p className="text-slate-700">
                      <span className="font-bold text-blue-600">{log.actor}</span> performed <span className="font-bold">{log.action}</span> on <span className="italic">{log.target}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 italic mt-1">"{log.note}"</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default AuditPortalView;
