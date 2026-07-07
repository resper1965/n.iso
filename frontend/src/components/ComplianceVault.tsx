import React, { useState } from 'react';

interface Artifact {
  id: string;
  name: string;
  category: string;
  status: 'Draft' | 'Approved';
  updatedAt: string;
}

const ComplianceVault: React.FC = () => {
  const [artifacts] = useState<Artifact[]>([
    { id: '1', name: 'ISMS Policy', category: 'Policy', status: 'Approved', updatedAt: '02/07/2026' },
    { id: '2', name: 'PIMS Privacy Policy', category: 'Policy', status: 'Draft', updatedAt: '02/07/2026' },
    { id: '3', name: 'Risk Register', category: 'Record', status: 'Draft', updatedAt: '02/07/2026' },
    { id: '4', name: 'Secure SDLC Standard', category: 'Standard', status: 'Approved', updatedAt: '02/07/2026' },
  ]);

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-blue-400">Compliance Vault .</h1>
        <p className="text-slate-400">ISO 27001 & 27701 Mandatory Documentation</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {artifacts.map((art) => (
          <div key={art.id} className="bg-slate-800 border border-slate-700 p-5 rounded-xl hover:border-blue-500 transition-all cursor-pointer group">
            <div className="flex justify-between items-start mb-4">
              <span className={`text-xs px-2 py-1 rounded-full ${art.category === 'Policy' ? 'bg-purple-900 text-purple-200' : 'bg-green-900 text-green-200'}`}>
                {art.category}
              </span>
              <span className={`text-xs font-bold ${art.status === 'Approved' ? 'text-blue-400' : 'text-amber-400'}`}>
                ● {art.status}
              </span>
            </div>
            <h3 className="text-lg font-semibold mb-2 group-hover:text-blue-300">{art.name}</h3>
            <p className="text-slate-500 text-sm">Last updated: {art.updatedAt}</p>
            
            <div className="mt-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg">View</button>
              <button className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-lg">Approve</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ComplianceVault;
