import React, { useState, useEffect } from 'react';
import { UserContext, LogEntry } from '../types';
import { Web3Service } from '../services/web3Service';
import { SEI_ABI, CHAN_ABI, YUE_ABI, ADDRESSES } from '../constants';
import { ZeroAddress, formatUnits, parseUnits } from 'ethers';

interface YueModuleProps {
  user: UserContext;
  web3: Web3Service | null;
  addLog: (entry: LogEntry) => void;
}

const YueModule: React.FC<YueModuleProps> = ({ user, web3, addLog }) => {
  const [activeTab, setActiveTab] = useState<'STATUS' | 'REACTOR' | 'CREATE'>('CREATE');
  
  // YUE Context
  const [yueAddress, setYueAddress] = useState<string | null>(null);
  const [yueDetails, setYueDetails] = useState<{ origin: string, chan: string, type: string } | null>(null);

  // Create State
  const [yueName, setYueName] = useState('');
  const [yueSymbol, setYueSymbol] = useState('');
  
  // Reactor State (Hong/Hung)
  const [assetA, setAssetA] = useState(ADDRESSES.WPLS);
  const [assetB, setAssetB] = useState(ADDRESSES.ATROPA);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);

  // Scanner State
  const [scanResult, setScanResult] = useState<{bar: string, rate: string} | null>(null);

  useEffect(() => {
      if(user.address && web3) {
          findYue(user.address);
      }
  }, [user.address, web3]);

  // If YUE found, switch to STATUS view by default
  useEffect(() => {
      if(yueAddress) {
          fetchYueDetails();
          setActiveTab('STATUS');
      }
  }, [yueAddress]);

  // Check allowance whenever relevant fields change
  useEffect(() => {
      checkAllowance();
  }, [web3, yueAddress, assetA, amount, activeTab]);

  const findYue = async (wallet: string) => {
      try {
          const chan = web3?.getContract(ADDRESSES.CHAN, CHAN_ABI);
          if(!chan) return;
          const yue = await chan.Yan(wallet);
          if(yue && yue !== ZeroAddress) {
              setYueAddress(yue);
          } else {
              setActiveTab('CREATE');
          }
      } catch(e) {
          console.error("Yue lookup failed", e);
      }
  };

  const fetchYueDetails = async () => {
      if(!web3 || !yueAddress) return;
      try {
          const yue = web3.getContract(yueAddress, YUE_ABI);
          const [origin, chan, type] = await Promise.all([
              yue.Origin().catch(() => ZeroAddress),
              yue.Chan().catch(() => ZeroAddress),
              yue.Type().catch(() => 'UNKNOWN')
          ]);
          setYueDetails({ origin, chan, type });
      } catch(e) {
          console.error("Yue details fetch failed", e);
      }
  };

  const checkAllowance = async () => {
      if (!web3 || !user.address || !yueAddress || activeTab !== 'REACTOR' || !amount) {
          setNeedsApproval(false);
          return;
      }
      try {
          // Simple heuristic: if address input looks valid
          if(assetA.length === 42) {
            const val = parseUnits(amount, 18);
            const allowance = await web3.checkAllowance(assetA, user.address, yueAddress);
            setNeedsApproval(allowance < val);
          }
      } catch(e) {
          // If parse fails or contract invalid, assume no approval needed or handle error elsewhere
          setNeedsApproval(false);
      }
  };

  const scanAsset = async (asset: string) => {
      if(!web3 || !yueAddress) return;
      setScanResult(null);
      try {
          const yue = web3.getContract(yueAddress, YUE_ABI);
          
          // Check Bar (Pressure/Balance?)
          const barData = await yue.Bar(asset).catch(() => [0n, 0n]);
          
          // Check Rate against WPLS (Base)
          const rateData = await yue.GetAssetRate(asset, ADDRESSES.WPLS).catch(() => 0n);

          setScanResult({
              bar: `${formatUnits(barData[0], 18)} / ${formatUnits(barData[1], 18)}`,
              rate: formatUnits(rateData, 18)
          });
      } catch(e) {
          console.error("Scan failed", e);
      }
  };

  const createYue = async () => {
      if(!web3 || !user.address || !user.lauAddress) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Creation Failed: Pilot & LAU required.` });
          return;
      }
      setLoading(true);
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Initializing SEI Reactor for YUE creation...` });
      
      try {
          // SEI.Start(address lau, string memory name, string memory symbol)
          const sei = web3.getContract(ADDRESSES.SEI, SEI_ABI);
          const tx = await web3.sendTransaction(sei, 'Start', [user.lauAddress, yueName, yueSymbol]);
          
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `SEI Pulse Sent: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `YUE Bridge Established.` });
          findYue(user.address); 
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Creation Error: ${web3.parseError(e)}` });
      } finally {
          setLoading(false);
      }
  };

  const approveAsset = async () => {
      if(!web3 || !yueAddress) return;
      setLoading(true);
      try {
          const tx = await web3.approve(assetA, yueAddress);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Approving Asset: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Asset Approved.` });
          checkAllowance();
      } catch(e: any) {
           addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Approval Failed: ${web3.parseError(e)}` });
      } finally {
          setLoading(false);
      }
  };

  const executeReactor = async (method: 'Hong' | 'Hung') => {
      if(!web3 || !yueAddress) return;
      setLoading(true);
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Initiating ${method} Sequence...` });
      
      try {
          const yue = web3.getContract(yueAddress, YUE_ABI);
          // Parsing to 18 decimals assumes standard tokens
          const parsedAmount = parseUnits(amount, 18);
          
          const tx = await web3.sendTransaction(yue, method, [assetA, assetB, parsedAmount]);
          
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Reaction Sent: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `${method} Complete.` });
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Reaction Failed: ${web3.parseError(e)}` });
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="h-full p-6 font-mono text-gray-300 flex flex-col items-center">
         <div className="w-full max-w-5xl border border-dys-border bg-black relative flex flex-col h-full md:h-auto">
            
            {/* Header / Tabs */}
            <div className="flex border-b border-dys-border">
                <button 
                    onClick={() => setActiveTab('STATUS')}
                    disabled={!yueAddress}
                    className={`px-6 py-3 font-bold text-xs tracking-widest transition-colors ${activeTab === 'STATUS' ? 'bg-dys-gold/20 text-dys-gold' : 'text-gray-500 hover:text-white disabled:opacity-30'}`}
                >
                    SYSTEM_STATUS
                </button>
                <button 
                    onClick={() => setActiveTab('REACTOR')}
                    disabled={!yueAddress}
                    className={`px-6 py-3 font-bold text-xs tracking-widest transition-colors ${activeTab === 'REACTOR' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-500 hover:text-white disabled:opacity-30'}`}
                >
                    MATTER_REACTOR
                </button>
                <button 
                    onClick={() => setActiveTab('CREATE')}
                    className={`px-6 py-3 font-bold text-xs tracking-widest transition-colors ${activeTab === 'CREATE' ? 'bg-dys-green/20 text-dys-green' : 'text-gray-500 hover:text-white'}`}
                >
                    FABRICATION
                </button>
            </div>

            <div className="p-8 flex-1 overflow-y-auto">
                
                {/* STATUS TAB */}
                {activeTab === 'STATUS' && yueAddress && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Info Card */}
                        <div className="border border-dys-gold/30 bg-dys-gold/5 p-6 relative">
                            <div className="absolute top-0 right-0 bg-dys-gold text-black text-[9px] font-bold px-2 py-1">ONLINE</div>
                            <h3 className="text-xl text-dys-gold font-bold mb-6 flex items-center gap-2">
                                <span>💠</span> YUE CORE
                            </h3>
                            
                            <div className="space-y-4 text-xs font-mono">
                                <div>
                                    <div className="text-gray-500 uppercase tracking-wider mb-1">CONTRACT ADDRESS</div>
                                    <div className="text-white select-all">{yueAddress}</div>
                                </div>
                                <div>
                                    <div className="text-gray-500 uppercase tracking-wider mb-1">TYPE_DESIGNATION</div>
                                    <div className="text-dys-cyan">{yueDetails?.type || "ANALYZING..."}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-gray-500 uppercase tracking-wider mb-1">ORIGIN (PILOT)</div>
                                        <div className="text-gray-300 truncate" title={yueDetails?.origin}>{yueDetails?.origin}</div>
                                    </div>
                                    <div>
                                        <div className="text-gray-500 uppercase tracking-wider mb-1">CHAN (UPLINK)</div>
                                        <div className="text-gray-300 truncate" title={yueDetails?.chan}>{yueDetails?.chan}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Asset Scanner */}
                        <div className="border border-dys-cyan/30 bg-dys-cyan/5 p-6 flex flex-col">
                             <h3 className="text-dys-cyan font-bold mb-4 text-sm tracking-widest">ASSET_DIAGNOSTICS</h3>
                             <div className="flex gap-2 mb-4">
                                 <input 
                                    className="flex-1 bg-black border border-dys-border p-2 text-xs text-dys-cyan focus:border-dys-cyan outline-none"
                                    placeholder="Enter Asset Address (0x...)"
                                    onChange={(e) => scanAsset(e.target.value)}
                                 />
                             </div>
                             
                             {/* Quick Select */}
                             <div className="flex gap-2 mb-6 flex-wrap">
                                 {[
                                     {n: 'WPLS', a: ADDRESSES.WPLS}, 
                                     {n: 'ATROPA', a: ADDRESSES.ATROPA}, 
                                     {n: 'AFFECTION', a: ADDRESSES.AFFECTION}
                                 ].map(t => (
                                     <button 
                                        key={t.n}
                                        onClick={() => scanAsset(t.a)}
                                        className="text-[10px] border border-gray-700 hover:border-dys-cyan px-2 py-1 text-gray-500 hover:text-dys-cyan transition-colors"
                                     >
                                         {t.n}
                                     </button>
                                 ))}
                             </div>

                             <div className="flex-1 bg-black border border-dys-border p-4 relative">
                                 {scanResult ? (
                                     <div className="space-y-3">
                                         <div>
                                             <div className="text-[10px] text-gray-500 uppercase">BAR (PRESSURE/CAPACITY)</div>
                                             <div className="text-lg text-white font-bold">{scanResult.bar}</div>
                                         </div>
                                         <div>
                                             <div className="text-[10px] text-gray-500 uppercase">EXCHANGE_RATE (vs WPLS)</div>
                                             <div className="text-lg text-dys-green font-bold">{scanResult.rate}</div>
                                         </div>
                                     </div>
                                 ) : (
                                     <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-700 animate-pulse">
                                         AWAITING_SCAN_TARGET...
                                     </div>
                                 )}
                             </div>
                        </div>
                    </div>
                )}

                {/* REACTOR TAB */}
                {activeTab === 'REACTOR' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                         <div className="flex flex-col justify-center text-xs text-gray-400 space-y-4">
                             <p>
                                 <strong className="text-purple-400">HONG</strong> (Expansion): Translates matter from Input A to Input B based on internal YUE rates.
                             </p>
                             <p>
                                 <strong className="text-purple-400">HUNG</strong> (Contraction): Inverts the translation, recovering original assets if stability permits.
                             </p>
                             <div className="border-l-2 border-purple-500 pl-4 py-2 bg-purple-900/10 italic mt-4">
                                 "Matter cannot be created or destroyed, only translated through the YUE manifold."
                             </div>
                         </div>

                         <div className="border border-purple-500/30 bg-black p-6 space-y-4">
                             <div>
                                 <label className="text-[10px] text-purple-400 font-bold uppercase">Asset A (Input)</label>
                                 <input 
                                    className="w-full bg-dys-panel border border-dys-border p-3 text-xs text-white focus:border-purple-500 outline-none mt-1"
                                    value={assetA}
                                    onChange={(e) => setAssetA(e.target.value)}
                                 />
                             </div>
                             <div>
                                 <label className="text-[10px] text-purple-400 font-bold uppercase">Asset B (Target)</label>
                                 <input 
                                    className="w-full bg-dys-panel border border-dys-border p-3 text-xs text-white focus:border-purple-500 outline-none mt-1"
                                    value={assetB}
                                    onChange={(e) => setAssetB(e.target.value)}
                                 />
                             </div>
                             <div>
                                 <label className="text-[10px] text-purple-400 font-bold uppercase">Quantum (Amount)</label>
                                 <input 
                                    className="w-full bg-dys-panel border border-dys-border p-3 text-xs text-white focus:border-purple-500 outline-none mt-1"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.0"
                                 />
                             </div>
                             
                             <div className="grid grid-cols-2 gap-4 mt-6">
                                 {needsApproval ? (
                                     <button 
                                        onClick={approveAsset}
                                        disabled={loading}
                                        className="col-span-2 py-3 bg-dys-gold/20 text-dys-gold border border-dys-gold hover:bg-dys-gold hover:text-black font-bold text-xs tracking-wider transition-all animate-pulse"
                                     >
                                         APPROVE ASSET ACCESS
                                     </button>
                                 ) : (
                                     <>
                                        <button 
                                            onClick={() => executeReactor('Hong')}
                                            disabled={loading}
                                            className="py-3 bg-purple-600/20 text-purple-400 border border-purple-600 hover:bg-purple-600 hover:text-white font-bold text-xs tracking-wider transition-all"
                                        >
                                            EXECUTE HONG
                                        </button>
                                        <button 
                                            onClick={() => executeReactor('Hung')}
                                            disabled={loading}
                                            className="py-3 bg-dys-panel text-gray-500 border border-gray-700 hover:border-purple-400 hover:text-purple-400 font-bold text-xs tracking-wider transition-all"
                                        >
                                            EXECUTE HUNG
                                        </button>
                                     </>
                                 )}
                             </div>
                         </div>
                    </div>
                )}

                {/* CREATE TAB */}
                {activeTab === 'CREATE' && (
                    <div className="max-w-md mx-auto mt-10 space-y-6">
                        <div className="text-center">
                            <h3 className="text-dys-green font-bold text-lg mb-2">BRIDGE FABRICATION</h3>
                            <p className="text-xs text-gray-500">
                                Initialize a new IOT Bridge via the SEI Reactor. This creates a YUE contract linked to your LAU Identity.
                            </p>
                        </div>
                        
                        <div className="space-y-4 border border-dys-green/20 p-6 bg-dys-green/5">
                            <div>
                                <label className="text-[10px] text-dys-green font-bold uppercase">Designation (Name)</label>
                                <input 
                                    className="w-full bg-black border border-dys-border p-3 text-sm text-dys-green focus:border-dys-green outline-none font-mono mt-1"
                                    value={yueName}
                                    onChange={(e) => setYueName(e.target.value)}
                                    placeholder="e.g. ALPHA BRIDGE"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-dys-green font-bold uppercase">Sigil (Symbol)</label>
                                <input 
                                    className="w-full bg-black border border-dys-border p-3 text-sm text-dys-green focus:border-dys-green outline-none font-mono mt-1"
                                    value={yueSymbol}
                                    onChange={(e) => setYueSymbol(e.target.value)}
                                    placeholder="e.g. A-IOT"
                                />
                            </div>
                            <button 
                                onClick={createYue}
                                disabled={loading || !yueName}
                                className="w-full py-4 bg-dys-green/10 text-dys-green border border-dys-green hover:bg-dys-green hover:text-black transition-all text-xs font-bold uppercase tracking-widest mt-4"
                            >
                                {loading ? 'FABRICATING...' : 'INITIATE SEI REACTOR'}
                            </button>
                        </div>
                    </div>
                )}

            </div>
         </div>
    </div>
  );
};

export default YueModule;