import React, { useState, useEffect } from 'react';
import { Web3Service } from '../services/web3Service';
import { LogEntry } from '../types';
import { Interface, FunctionFragment, isAddress } from "ethers";
import { CONTRACT_REGISTRY, ERC20_ABI, DYSNOMIA_ABIS } from '../constants';

interface ContractStudioProps {
  web3: Web3Service;
  addLog: (entry: LogEntry) => void;
}

interface ContractInfo {
    address: string;
    name: string;
    type: string;
    functions: FunctionFragment[];
    abi: any[];
}

const ContractStudio: React.FC<ContractStudioProps> = ({ web3, addLog }) => {
  const [activeTab, setActiveTab] = useState<'READ' | 'WRITE'>('READ');
  const [addressInput, setAddressInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  
  // Function execution state
  const [inputs, setInputs] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [expandedFunc, setExpandedFunc] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Load a contract by address
  const loadContract = async (addr: string, knownName?: string, knownType?: string) => {
    if (!isAddress(addr)) {
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Invalid Address: ${addr}` });
        return;
    }
    
    setLoading(true);
    setAddressInput(addr);
    setContractInfo(null);
    setResults({});
    setInputs({});

    try {
        let abi = ERC20_ABI;
        let type = knownType || 'ERC20';
        let name = knownName || 'Unknown';

        // 1. Try to detect Dysnomia Type dynamically
        const basicContract = web3.getContract(addr, ["function Type() view returns (string)", "function name() view returns (string)"]);
        
        try {
            const detectedType = await basicContract.Type();
            if (detectedType && DYSNOMIA_ABIS[detectedType]) {
                type = detectedType;
                abi = [...ERC20_ABI, ...DYSNOMIA_ABIS[detectedType]]; // Combine base ERC20 with specific
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Detected Dysnomia Contract: ${type}` });
            }
        } catch (e) {
            // Not a Dysnomia contract with Type()
        }

        try {
            const detectedName = await basicContract.name();
            if (detectedName) name = detectedName;
        } catch (e) {}

        // Parse ABI to functions
        const iface = new Interface(abi);
        const functions: FunctionFragment[] = [];
        iface.forEachFunction((f) => functions.push(f));
        
        setContractInfo({
            address: addr,
            name,
            type,
            functions,
            abi: abi as any[]
        });

    } catch (e: any) {
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Load Failed: ${e.message}` });
    } finally {
        setLoading(false);
    }
  };

  const handleExecute = async (func: FunctionFragment, args: string[]) => {
      if(!contractInfo) return;
      
      const funcKey = func.format();
      setResults(prev => ({ ...prev, [funcKey]: 'Executing...' }));

      try {
        const contract = web3.getContract(contractInfo.address, contractInfo.abi);
        
        if (['view', 'pure'].includes(func.stateMutability)) {
            const res = await contract[func.name](...args);
            setResults(prev => ({ ...prev, [funcKey]: res.toString() }));
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Read ${func.name}: Success` });
        } else {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Simulating ${func.name}...` });
            const sim = await web3.simulateTransaction(contract, func.name, args);
            
            if(sim.success) {
                const tx = await web3.sendTransaction(contract, func.name, args);
                setResults(prev => ({ ...prev, [funcKey]: `Tx Sent: ${tx.hash}` }));
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Tx Sent: ${tx.hash}` });
            } else {
                setResults(prev => ({ ...prev, [funcKey]: `Error: ${sim.error}` }));
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Simulation Failed` });
            }
        }
      } catch (e: any) {
         setResults(prev => ({ ...prev, [funcKey]: `Error: ${e.message}` }));
         addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Execution Error`, details: e.message });
      }
  };

  // Filter functions based on active tab
  const visibleFunctions = contractInfo?.functions.filter(f => {
      const isRead = ['view', 'pure'].includes(f.stateMutability);
      return activeTab === 'READ' ? isRead : !isRead;
  }).sort((a,b) => a.name.localeCompare(b.name)) || [];

  return (
    <div className="flex h-full bg-dys-black text-gray-300 font-mono overflow-hidden">
        
        {/* Sidebar: Contract Registry */}
        <div className="w-64 bg-dys-panel border-r border-dys-border flex flex-col shrink-0">
            <div className="p-4 border-b border-dys-border bg-black/20">
                <h3 className="text-dys-cyan font-bold tracking-widest text-sm mb-2">CONTRACT REGISTRY</h3>
                <div className="relative">
                    <input 
                        className="w-full bg-black border border-dys-border p-2 text-xs text-dys-green placeholder-gray-700 focus:border-dys-cyan outline-none"
                        placeholder="Load Custom Address..."
                        value={addressInput}
                        onChange={(e) => setAddressInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadContract(addressInput)}
                    />
                    <button 
                        onClick={() => loadContract(addressInput)}
                        className="absolute right-1 top-1 text-xs text-dys-cyan hover:text-white"
                    >
                        LOAD
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-thin">
                {Object.entries(CONTRACT_REGISTRY).map(([category, contracts]) => (
                    <div key={category}>
                        <div className="text-[10px] text-gray-500 font-bold uppercase mb-1 px-2">{category}</div>
                        <div className="space-y-1">
                            {Object.entries(contracts).map(([name, addr]) => (
                                <button
                                    key={addr}
                                    onClick={() => loadContract(addr, name)}
                                    className={`w-full text-left px-3 py-2 text-xs hover:bg-dys-cyan/10 hover:text-dys-cyan border-l-2 transition-all ${
                                        contractInfo?.address === addr 
                                        ? 'border-dys-cyan bg-dys-cyan/5 text-dys-cyan' 
                                        : 'border-transparent text-gray-400'
                                    }`}
                                >
                                    <div className="font-bold truncate">{name}</div>
                                    <div className="text-[9px] opacity-50 truncate">{addr}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Main Content: Interaction Deck */}
        <div className="flex-1 flex flex-col min-w-0">
            {contractInfo ? (
                <>
                    {/* Contract Header */}
                    <div className="p-6 border-b border-dys-border bg-gradient-to-r from-dys-panel to-black">
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className="text-2xl text-white font-bold tracking-tight flex items-center gap-3">
                                    {contractInfo.name}
                                    <span className="text-xs bg-dys-border px-2 py-0.5 rounded text-dys-gold border border-dys-gold/30">
                                        {contractInfo.type}
                                    </span>
                                </h2>
                                <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 font-mono">
                                    <span>{contractInfo.address}</span>
                                    <button 
                                        onClick={() => navigator.clipboard.writeText(contractInfo.address)}
                                        className="hover:text-dys-cyan"
                                        title="Copy Address"
                                    >
                                        📋
                                    </button>
                                </div>
                            </div>
                            <div className="text-right text-xs">
                                <div className="text-gray-500">FUNCTIONS</div>
                                <div className="text-xl text-dys-cyan font-bold">{contractInfo.functions.length}</div>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-dys-border bg-dys-panel">
                        <button 
                            onClick={() => setActiveTab('READ')}
                            className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${
                                activeTab === 'READ' ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            READ DATA
                        </button>
                        <button 
                            onClick={() => setActiveTab('WRITE')}
                            className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${
                                activeTab === 'WRITE' ? 'border-dys-red text-dys-red bg-dys-red/5' : 'border-transparent text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            WRITE / EXECUTE
                        </button>
                    </div>

                    {/* Functions List */}
                    <div className="flex-1 overflow-y-auto p-6 bg-black/50">
                        <div className="space-y-4 max-w-4xl mx-auto">
                            {visibleFunctions.map((func) => {
                                const funcKey = func.format();
                                const isExpanded = expandedFunc === funcKey;
                                
                                return (
                                    <div 
                                        key={funcKey} 
                                        className={`border transition-all duration-200 ${
                                            isExpanded 
                                            ? 'border-dys-cyan bg-dys-panel shadow-[0_0_20px_rgba(0,240,255,0.1)]' 
                                            : 'border-dys-border bg-black hover:border-gray-600'
                                        }`}
                                    >
                                        <button 
                                            onClick={() => setExpandedFunc(isExpanded ? null : funcKey)}
                                            className="w-full text-left px-4 py-3 flex justify-between items-center"
                                        >
                                            <span className={`font-bold text-sm ${activeTab === 'READ' ? 'text-blue-300' : 'text-orange-300'}`}>
                                                {func.name}
                                            </span>
                                            <div className="flex gap-2 text-xs text-gray-600">
                                                {func.inputs.length > 0 && <span>({func.inputs.length} args)</span>}
                                                <span>{isExpanded ? '−' : '+'}</span>
                                            </div>
                                        </button>

                                        {isExpanded && (
                                            <div className="px-4 pb-4 pt-0 border-t border-dys-border/50">
                                                <div className="space-y-3 mt-4">
                                                    {func.inputs.map((input, idx) => (
                                                        <div key={idx}>
                                                            <label className="block text-[10px] uppercase text-gray-500 mb-1">
                                                                {input.name || `arg${idx}`} ({input.type})
                                                            </label>
                                                            <input 
                                                                className="w-full bg-black border border-dys-border p-2 text-sm text-white focus:border-dys-cyan outline-none"
                                                                placeholder={`Enter ${input.type}...`}
                                                                value={inputs[funcKey]?.[idx] || ''}
                                                                onChange={(e) => {
                                                                    setInputs(prev => {
                                                                        const newArgs = [...(prev[funcKey] || [])];
                                                                        newArgs[idx] = e.target.value;
                                                                        return { ...prev, [funcKey]: newArgs };
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                    
                                                    <button 
                                                        onClick={() => handleExecute(func, inputs[funcKey] || [])}
                                                        className={`w-full py-2 font-bold text-sm transition-colors mt-2 ${
                                                            activeTab === 'READ' 
                                                            ? 'bg-blue-600 hover:bg-blue-500 text-white' 
                                                            : 'bg-dys-red hover:bg-red-500 text-black'
                                                        }`}
                                                    >
                                                        {activeTab === 'READ' ? 'QUERY' : 'TRANSACT'}
                                                    </button>
                                                </div>

                                                {results[funcKey] && (
                                                    <div className="mt-4 p-3 bg-black border border-gray-800 relative group">
                                                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button 
                                                                onClick={() => setShowRaw(!showRaw)}
                                                                className="text-[10px] bg-gray-800 px-2 py-1 hover:bg-gray-700"
                                                            >
                                                                {showRaw ? 'FMT' : 'RAW'}
                                                            </button>
                                                        </div>
                                                        <span className="block text-[10px] text-gray-500 mb-1">RESULT</span>
                                                        <div className="text-sm font-mono text-dys-green break-all whitespace-pre-wrap">
                                                            {results[funcKey]}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {visibleFunctions.length === 0 && (
                                <div className="text-center text-gray-500 mt-20">
                                    No {activeTab.toLowerCase()} functions found for this contract.
                                </div>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                    <div className="text-6xl mb-4 opacity-20">⚡</div>
                    <p className="text-lg">Select a contract from the registry</p>
                    <p className="text-sm mt-2 opacity-50">or enter an address to begin engineering</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default ContractStudio;