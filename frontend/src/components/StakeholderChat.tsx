import React, { useState } from 'react';

const StakeholderChat: React.FC<{ stakeholderRole: string }> = ({ stakeholderRole }) => {
  const [messages, setMessages] = useState([
    { role: 'agent', text: `Olá! Sou o Assistente nISO. Estou aqui para uma breve conversa sobre como o ${stakeholderRole} lida com a segurança e privacidade na organização. Podemos começar?` }
  ]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;

    const newMessages = [...messages, { role: 'user', text: input }];
    setMessages(newMessages);
    setInput('');

    // Simulação de Inteligência Agêntica extraindo evidência
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'agent', 
        text: 'Entendido. Anotei aqui como vocês lidam com esse processo. Isso é fundamental para a nossa evidência do Controle ISO correspondente. Próxima pergunta...' 
      }]);
    }, 1000);
  };

  return (
    <div className="max-w-2xl mx-auto my-10 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[600px]">
      <header className="bg-slate-800 p-6 flex justify-between items-center border-b border-slate-700">
        <div>
          <h2 className="text-xl font-bold text-blue-400">Conversa de Auditoria</h2>
          <p className="text-xs text-slate-400 uppercase tracking-widest">Stakeholder: {stakeholderRole}</p>
        </div>
        <div className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-[10px] font-bold">AGÊNTICO</div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-2xl ${
              m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              <p className="text-sm leading-relaxed">{m.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="p-6 bg-slate-800/50 border-t border-slate-800 flex gap-4">
        <input 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:border-blue-500 transition-all" 
          placeholder="Responda em formato livre..." 
        />
        <button 
          onClick={handleSend}
          className="bg-blue-600 hover:bg-blue-500 p-3 rounded-2xl transition-all shadow-lg shadow-blue-900/20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );
};

export default StakeholderChat;
