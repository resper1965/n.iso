import React from 'react';

interface ClauseRequirement {
  id: string;
  title: string;
  status: 'Missing' | 'Partial' | 'Complete';
  deliverable: string;
}

const ReadinessDashboard: React.FC = () => {
  const requirements: ClauseRequirement[] = [
    { id: '4', title: 'Context of the Organization', status: 'Complete', deliverable: 'ISMS Scope & Context Document' },
    { id: '5', title: 'Leadership', status: 'Partial', deliverable: 'Information Security Policy (Signed)' },
    { id: '6', title: 'Planning', status: 'Partial', deliverable: 'Risk Assessment & SoA' },
    { id: '7', title: 'Support', status: 'Missing', deliverable: 'Competence & Awareness Records' },
    { id: '8', title: 'Operation', status: 'Missing', deliverable: 'Risk Treatment Implementation' },
    { id: '9', title: 'Performance Evaluation', status: 'Missing', deliverable: 'Internal Audit & Mgmt Review' },
    { id: '10', title: 'Improvement', status: 'Missing', deliverable: 'Non-conformity Log' },
  ];

  const calculateProgress = () => {
    const weights = { Complete: 100, Partial: 50, Missing: 0 };
    const total = requirements.reduce((acc, req) => acc + weights[req.status], 0);
    return Math.round(total / requirements.length);
  };

  const progress = calculateProgress();

  return (
    <div className="p-10 bg-slate-900 min-h-screen text-slate-100 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
            Certification Roadmap
          </h1>
          <p className="text-slate-400 mt-2 text-lg">ISO 27001:2022 & ISO 27701 Implementation</p>
        </header>

        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-10">
          <div className="bg-slate-800/80 p-5 rounded-3xl border border-blue-500/20">
            <h4 className="text-[10px] uppercase text-blue-400 font-bold mb-1 tracking-widest text-center">Ready</h4>
            <p className="text-3xl font-black text-center">{progress}%</p>
          </div>

          <div className="bg-slate-800/80 p-5 rounded-3xl border border-emerald-500/20">
            <h4 className="text-[10px] uppercase text-emerald-400 font-bold mb-1 tracking-widest text-center">Approved</h4>
            <p className="text-3xl font-black text-center">1/7</p>
          </div>

          <div className="md:col-span-3 flex items-center bg-slate-800/30 p-5 rounded-3xl border border-slate-800">
             <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-emerald-500 h-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
             </div>
          </div>
        </div>

        {/* Phase Roadmap */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
           {[
             { phase: '0', title: 'Context & Scope', status: 'Completed', color: 'blue' },
             { phase: '1', title: 'Risk Assessment', status: 'In Progress', color: 'blue' },
             { phase: '2', title: 'Formalization', status: 'Pending', color: 'slate' },
             { phase: '3', title: 'Internal Audit', status: 'Scheduled', color: 'slate' }
           ].map(p => (
            <div key={p.phase} className={`bg-slate-800/50 p-6 rounded-3xl border ${p.color === 'blue' ? 'border-blue-500/30' : 'border-slate-800'}`}>
              <h4 className="text-[10px] uppercase text-slate-500 font-bold mb-1 tracking-widest">Phase {p.phase}</h4>
              <p className="font-bold text-slate-200">{p.title}</p>
              <p className={`text-[10px] mt-2 font-bold ${p.color === 'blue' ? 'text-blue-400' : 'text-slate-600'}`}>{p.status}</p>
            </div>
           ))}
        </div>

        {/* Detailed Controls */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold mb-6 text-slate-400 flex items-center gap-2">
             <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
             Clause Requirements
          </h2>
          {requirements.map(req => (
            <div key={req.id} className="bg-slate-800/40 border border-slate-800/50 p-6 rounded-3xl flex items-center justify-between hover:bg-slate-800/60 transition-all group">
              <div className="flex items-center gap-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${
                  req.status === 'Complete' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  req.status === 'Partial' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                  'bg-slate-900 text-slate-700'
                }`}>
                  {req.id}
                </div>
                <div>
                  <h3 className="font-bold text-slate-100">{req.title}</h3>
                  <p className="text-xs text-slate-500 font-medium">Deliverable: {req.deliverable}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                 <div className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-tighter ${
                    req.status === 'Complete' ? 'bg-emerald-500/10 text-emerald-500' :
                    req.status === 'Partial' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-900 text-slate-600'
                 }`}>
                    {req.status === 'Complete' ? 'Approved' : req.status}
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReadinessDashboard;
