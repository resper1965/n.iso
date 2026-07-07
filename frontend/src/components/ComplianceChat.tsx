import React, { useState } from 'react';

const ComplianceChat: React.FC = () => {
  const [messages, setMessages] = useState([
    { role: 'agent', text: 'Olá! Sou o Agente nISO. Como posso ajudar na sua jornada de certificação hoje?' }
  ]);

  const simulateSnapshot = () => {
    setMessages(prev => [...prev, { role: 'user', text: 'Capture um Snapshot de Auditoria do pipeline de CI/CD.' }]);
    
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'agent', 
        text: '📸 **Audit Snapshot Capturado!**\n\n' +
              'Coletei evidências pontuais do repositório `ness-labs-app` para o programa de certificação:\n\n' +
              '✅ **A.8.25**: Snapshot do `security-scan` arquivado.\n' +
              '✅ **A.5.3**: Registro de aprovações manuais capturado.\n\n' +
              'Essas evidências foram movidas para a **Pasta de Auditoria (Ph. 3)**. Deseja gerar o Relatório de Conformidade Técnica agora?'
      }]);
    }, 1500);
  };

  return (
    <div className="bg-slate-900 border-l border-slate-800 w-96 flex flex-col h-screen">
      <div className="p-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
        <h2 className="font-bold uppercase text-[10px] tracking-widest text-slate-400">Audit Assistant AI</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
              m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200'
            }`}>
              <pre className="whitespace-pre-wrap font-sans">{m.text}</pre>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-slate-800 space-y-2">
        <button 
          onClick={simulateSnapshot}
          className="w-full bg-blue-600/10 hover:bg-blue-600/20 text-xs py-2 rounded-lg border border-blue-500/30 transition-all text-blue-400 font-bold"
        >
          📸 Capture Audit Snapshot (CI/CD)
        </button>
        <div className="flex gap-2">
          <input className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="Ask nISO Agent..." />
        </div>
      </div>
    </div>
  );
};

export default ComplianceChat;
