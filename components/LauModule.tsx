import React, { useState, useEffect } from 'react';
import { UserContext, LogEntry } from '../types';
import { Web3Service } from '../services/web3Service';
import { LAU_ABI, LAU_FACTORY_ABI, CHO_ABI, CHAN_ABI, ADDRESSES } from '../constants';
import { ZeroAddress } from 'ethers';

interface LauModuleProps {
  user: UserContext;
  web3: Web3Service | null;
  addLog: (entry: LogEntry) => void;
  setUser: React.Dispatch<React.SetStateAction<UserContext>>;
}

const LauModule: React.FC<LauModuleProps> = ({ user, web3, addLog, setUser }) => {
  const [activeTab, setActiveTab] = useState<'STATUS' | 'LINK' | 'BIRTH'>('STATUS');
  
  // Link State
  const [addressInput, setAddressInput] = useState('');
  
  // Birth State
  const [newName, setNewName] = useState('');
  const [newSymbol, setNewSymbol] = useState('');

  // Update State
  const [usernameInput, setUsernameInput] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [choRegistered, setChoRegistered] = useState<boolean | null>(null);
  
  // Local state for meta, but SAAT is now pushed to UserContext
  const [meta, setMeta] = useState<{eta: string, type: string} | null>(null);

  // Initial Scan for Identity (LAU & YUE)
  useEffect(() => {
      if(web3 && user.address) {
          scanIdentity();
      }
  }, [web3, user.address]);

  // Fetch Attributes when LAU is known
  useEffect(() => {
      if(user.lauAddress && web3) {
          checkChoRegistration(user.lauAddress);
          fetchAttributes(user.lauAddress);
      }
  }, [user.lauAddress, web3]);

  const scanIdentity = async () => {
      if(!web3 || !user.address) return;
      // Don't log spam if we already have them, but valid to check consistency
      if(!user.lauAddress) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: 'Scanning for Identity...' });
      }

      try {
          const cho = web3.getContract(ADDRESSES.CHO, CHO_ABI);
          const chan = web3.getContract(ADDRESSES.CHAN, CHAN_ABI);
          
          const [lauAddr, yueAddr] = await Promise.all([
              cho.GetUserTokenAddress(user.address).catch(() => ZeroAddress),
              chan.Yan(user.address).catch(() => ZeroAddress)
          ]);

          let updates: Partial<UserContext> = {};

          if(lauAddr && lauAddr !== ZeroAddress && lauAddr !== user.lauAddress) {
              updates.lauAddress = lauAddr;
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Identity Detected: ${lauAddr}` });
          }

          if(yueAddr && yueAddr !== ZeroAddress && yueAddr !== user.yue) {
              updates.yue = yueAddr;
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Bridge Detected: ${yueAddr}` });
          }

          if(Object.keys(updates).length > 0) {
              setUser(prev => ({ ...prev, ...updates }));
          }
      } catch(e) {
          console.warn("Identity Scan error", e);
      }
  };

  const checkChoRegistration = async (lauAddr: string) => {
      if(!web3 || !user.address) return;
      try {
          const cho = web3.getContract(ADDRESSES.CHO, CHO_ABI);
          const registeredLau = await cho.GetUserTokenAddress(user.address);
          const isRegistered = registeredLau.toLowerCase() === lauAddr.toLowerCase();
          setChoRegistered(isRegistered);
      } catch(e) {
          console.error("CHO check failed", e);
      }
  };

  const fetchAttributes = async (lauAddr: string) => {
      if(!web3) return;
      try {
          const lau = web3.getContract(lauAddr, LAU_ABI);
          
          // 1. Fetch Saat (Pole, Soul, Aura)
          const [p, s, a] = await Promise.all([
              lau.Saat(0).catch(() => 0n),
              lau.Saat(1).catch(() => 0n),
              lau.Saat(2).catch(() => 0n),
          ]);
          
          // 2. Fetch Metadata, Username, Area
          const [eta, type, username, currentArea] = await Promise.all([
              lau.Eta().catch(() => ZeroAddress),
              lau.Type().catch(() => "UNKNOWN"),
              lau.Username().catch(() => null),
              lau.CurrentArea().catch(() => null),
          ]);
          
          setMeta({ eta, type });

          // 3. Update User Context with fresh data
          setUser(prev => ({
              ...prev,
              username: username || prev.username,
              currentArea: currentArea || prev.currentArea,
              saat: {
                  pole: p.toString(),
                  soul: s.toString(),
                  aura: a.toString()
              }
          }));

      } catch(e) {
          console.error("Attribute fetch failed", e);
          // Only log error if it's a hard failure, silent fail for view reads
      }
  };

  // Helper to generate a unique "Soul Color" based on Saat values
  const getSoulColor = () => {
      if(!user.saat) return '#00ff41'; // Default Green
      try {
          const hue = Number(BigInt(user.saat.pole) % 360n);
          const sat = 50 + Number(BigInt(user.saat.soul) % 50n);
          const light = 40 + Number(BigInt(user.saat.aura) % 30n);
          return `hsl(${hue}, ${sat}%, ${light}%)`;
      } catch { return '#00ff41'; }
  };

  // --- ACTIONS ---

  const linkLau = async () => {
    if (!web3 || !addressInput) return;
    setIsLoading(true);
    addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: 'Initiating Soul Link...' });
    
    try {
      const c = web3.getContract(addressInput, LAU_ABI);
      const [username, area] = await Promise.all([
        c.Username().catch(() => 'Unknown'),
        c.CurrentArea().catch(() => ADDRESSES.VOID)
      ]);

      setUser(prev => ({ 
        ...prev, 
        lauAddress: addressInput, 
        username,
        currentArea: area 
      }));

      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Soul Shell Active: ${username}` });
      setActiveTab('STATUS');
    } catch (e: any) {
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Link Failed: ${e.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const birthLau = async () => {
    if(!web3) return;
    setIsLoading(true);
    addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: 'Requesting Shell Fabrication...' });

    try {
        const factory = web3.getContract(ADDRESSES.LAU_FACTORY, LAU_FACTORY_ABI);
        let tx;
        if(newName && newSymbol) {
             tx = await web3.sendTransaction(factory, 'New(address,string,string)', [user.address, newName, newSymbol]);
        } else {
             tx = await web3.sendTransaction(factory, 'New(address)', [user.address]);
        }

        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Fabrication Started: ${tx.hash}` });
        await web3.waitForReceipt(tx);
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Shell Created. Check wallet activity and Link Address.` });

    } catch(e: any) {
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Birth Failed: ${e.message}` });
    } finally {
        setIsLoading(false);
    }
  };

  const registerInCho = async () => {
      if(!web3 || !user.lauAddress) return;
      setIsLoading(true);
      try {
          const cho = web3.getContract(ADDRESSES.CHO, CHO_ABI);
          const tx = await web3.sendTransaction(cho, 'Enter', [user.lauAddress]);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Registering in CHO: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          setChoRegistered(true);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Identity Registered in Governance.` });
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Registration Failed: ${e.message}` });
      } finally {
          setIsLoading(false);
      }
  };

  const updateUsername = async () => {
      if(!web3 || !user.lauAddress || !usernameInput) return;
      setIsLoading(true);
      try {
          const c = web3.getContract(user.lauAddress, LAU_ABI);
          const tx = await web3.sendTransaction(c, 'Username', [usernameInput]);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Update Signal Sent: ${tx.hash}` });
          await web3.waitForReceipt(tx);
          setUser(prev => ({ ...prev, username: usernameInput }));
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Callsign Updated: ${usernameInput}` });
          setUsernameInput('');
      } catch(e: any) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Update Failed: ${e.message}` });
      } finally {
          setIsLoading(false);
      }
  };

  const soulColor = getSoulColor();

  // --- RENDER ---

  return (
    <div className="h-full p-6 font-mono text-gray-300 flex flex-col">
        
        <div className="mb-6 flex border-b border-dys-border">
            <button 
                onClick={() => setActiveTab('STATUS')}
                className={`px-6 py-2 text-sm font-bold border-t-2 border-r border-l tracking-widest ${activeTab === 'STATUS' ? 'border-dys-green text-dys-green bg-dys-green/10' : 'border-transparent text-gray-600 hover:text-gray-400'}`}
            >
                PROFILE_DOSSIER
            </button>
            <button 
                onClick={() => setActiveTab('LINK')}
                className={`px-6 py-2 text-sm font-bold border-t-2 border-r border-l tracking-widest ${activeTab === 'LINK' ? 'border-dys-cyan text-dys-cyan bg-dys-cyan/10' : 'border-transparent text-gray-600 hover:text-gray-400'}`}
            >
                LINK_SHELL
            </button>
            <button 
                onClick={() => setActiveTab('BIRTH')}
                className={`px-6 py-2 text-sm font-bold border-t-2 border-r border-l tracking-widest ${activeTab === 'BIRTH' ? 'border-dys-gold text-dys-gold bg-dys-gold/10' : 'border-transparent text-gray-600 hover:text-gray-400'}`}
            >
                FABRICATE
            </button>
        </div>

        <div className="border border-dys-green/30 bg-black p-6 max-w-5xl mx-auto w-full relative overflow-hidden flex-1 shadow-[0_0_20px_rgba(0,255,65,0.05)]">
            <div className="absolute top-0 right-0 p-2 text-[10px] text-dys-green border-l border-b border-dys-green/30 font-bold">
                SYS.ID // {activeTab}
            </div>

            {/* PROFILE DOSSIER */}
            {activeTab === 'STATUS' && (
                <div className="flex flex-col lg:flex-row gap-8 h-full overflow-y-auto">
                    
                    {/* LEFT COLUMN: IDENTITY */}
                    <div className="w-full lg:w-1/3 space-y-6">
                        <div className="bg-dys-panel/50 border border-dys-border p-6 flex flex-col items-center text-center relative group">
                             {/* DYNAMIC SOUL AVATAR */}
                             <div 
                                className="w-32 h-32 border-4 rounded-full flex items-center justify-center bg-black mb-4 relative overflow-hidden transition-all duration-500"
                                style={{ borderColor: soulColor }}
                             >
                                 {user.lauAddress ? (
                                     <>
                                        <div 
                                            className="absolute inset-0 animate-pulse-fast" 
                                            style={{ backgroundColor: soulColor, opacity: 0.15 }}
                                        ></div>
                                        <span className="text-4xl z-10" style={{ textShadow: `0 0 10px ${soulColor}` }}>👾</span>
                                     </>
                                 ) : (
                                     <span className="text-4xl text-gray-700">?</span>
                                 )}
                             </div>
                             
                             {user.lauAddress ? (
                                <>
                                    <h2 className="text-2xl font-bold text-white tracking-wider">{user.username || "UNKNOWN_PILOT"}</h2>
                                    <div className="text-[10px] text-dys-green font-mono mt-1 px-2 py-1 bg-dys-green/10 rounded cursor-pointer hover:bg-dys-green/20 transition-colors" title="Copy Address">
                                        {user.lauAddress}
                                    </div>
                                    <div className="mt-4 w-full flex justify-between text-xs border-t border-dys-border pt-4">
                                        <span className="text-gray-500">TYPE</span>
                                        <span className="text-dys-gold">{meta?.type || "LAU"}</span>
                                    </div>
                                </>
                             ) : (
                                 <div className="text-dys-red font-bold">NO SHELL LINKED</div>
                             )}
                        </div>

                        {/* CHO STATUS */}
                        {user.lauAddress && (
                            <div className={`border p-4 flex justify-between items-center ${choRegistered ? 'border-dys-green/30 bg-dys-green/5' : 'border-dys-red/50 bg-dys-red/10'}`}>
                                <div>
                                    <div className="text-[10px] text-gray-500 font-bold uppercase">Governance Status</div>
                                    <div className={`font-bold ${choRegistered ? 'text-dys-green' : 'text-dys-red'}`}>
                                        {choRegistered ? 'REGISTERED CITIZEN' : 'UNREGISTERED ENTITY'}
                                    </div>
                                </div>
                                {!choRegistered && (
                                    <button 
                                        onClick={registerInCho}
                                        disabled={isLoading}
                                        className="px-3 py-1 bg-dys-red hover:bg-red-600 text-black text-xs font-bold transition-colors"
                                    >
                                        REGISTER
                                    </button>
                                )}
                            </div>
                        )}

                        {/* UPDATE FORM */}
                        {user.lauAddress && (
                            <div className="bg-dys-panel border border-dys-border p-4">
                                <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block">Update Callsign</label>
                                <div className="flex gap-2">
                                    <input 
                                        className="flex-1 bg-black border border-dys-border p-2 text-sm text-dys-cyan focus:border-dys-cyan outline-none"
                                        placeholder="New Alias..."
                                        value={usernameInput}
                                        onChange={(e) => setUsernameInput(e.target.value)}
                                    />
                                    <button 
                                        onClick={updateUsername}
                                        disabled={isLoading || !usernameInput}
                                        className="bg-dys-cyan/10 text-dys-cyan border border-dys-cyan hover:bg-dys-cyan hover:text-black px-4 py-2 font-bold transition-all text-xs"
                                    >
                                        SET
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: ATTRIBUTES */}
                    <div className="flex-1 space-y-6">
                        
                        {/* SAAT MATRIX */}
                        <div className="bg-black border border-dys-cyan/30 p-6 relative">
                            <div className="flex justify-between items-center mb-4">
                                <div className="p-1 px-3 text-[9px] text-dys-cyan bg-dys-cyan/10 border-l border-b border-dys-cyan/30 font-mono tracking-widest">
                                    SAAT_ANALYSIS // SOUL_MATRIX
                                </div>
                                <button 
                                    onClick={() => user.lauAddress && fetchAttributes(user.lauAddress)}
                                    className="text-[9px] text-gray-500 hover:text-white border border-gray-700 px-2 py-1"
                                >
                                    REFRESH_DATA
                                </button>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Pole */}
                                <div className="p-4 border border-dys-green/30 bg-dys-green/5 flex flex-col items-center justify-center h-32 hover:bg-dys-green/10 transition-colors group relative overflow-hidden">
                                    <div className="text-3xl mb-2 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all">⏚</div>
                                    <div className="text-xl text-dys-green font-mono font-bold truncate max-w-full">{user.saat?.pole || "---"}</div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">POLE (0)</div>
                                    {user.saat && <div className="absolute bottom-0 left-0 h-1 bg-dys-green" style={{ width: `${Number(BigInt(user.saat.pole) % 100n)}%` }}></div>}
                                </div>
                                {/* Soul */}
                                <div className="p-4 border border-dys-cyan/30 bg-dys-cyan/5 flex flex-col items-center justify-center h-32 hover:bg-dys-cyan/10 transition-colors group relative overflow-hidden">
                                    <div className="text-3xl mb-2 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all">❖</div>
                                    <div className="text-xl text-dys-cyan font-mono font-bold truncate max-w-full">{user.saat?.soul || "---"}</div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">SOUL (1)</div>
                                    {user.saat && <div className="absolute bottom-0 left-0 h-1 bg-dys-cyan" style={{ width: `${Number(BigInt(user.saat.soul) % 100n)}%` }}></div>}
                                </div>
                                {/* Aura */}
                                <div className="p-4 border border-dys-gold/30 bg-dys-gold/5 flex flex-col items-center justify-center h-32 hover:bg-dys-gold/10 transition-colors group relative overflow-hidden">
                                    <div className="text-3xl mb-2 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all">⚡</div>
                                    <div className="text-xl text-dys-gold font-mono font-bold truncate max-w-full">{user.saat?.aura || "---"}</div>
                                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">AURA (2)</div>
                                    {user.saat && <div className="absolute bottom-0 left-0 h-1 bg-dys-gold" style={{ width: `${Number(BigInt(user.saat.aura) % 100n)}%` }}></div>}
                                </div>
                            </div>
                            
                            <div className="mt-4 p-3 bg-dys-panel border border-dys-border text-[10px] text-gray-500 font-mono">
                                <p>Analysis: Attributes are immutable signatures derived from the genesis seed. They determine compatibility with specific QING manifolds and potential reaction yields.</p>
                            </div>
                        </div>

                        {/* METADATA GRID */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                             <div className="bg-dys-panel p-4 border border-dys-border">
                                 <div className="text-[10px] text-gray-500 uppercase mb-1">CURRENT SECTOR</div>
                                 <div className="text-md text-white font-mono truncate">{user.currentArea || "VOID (NULL)"}</div>
                             </div>
                             <div className="bg-dys-panel p-4 border border-dys-border">
                                 <div className="text-[10px] text-gray-500 uppercase mb-1">ETA (PARENT LINK)</div>
                                 <div className="text-md text-white font-mono truncate">{meta?.eta || "UNKNOWN"}</div>
                             </div>
                             <div className="bg-dys-panel p-4 border border-dys-border">
                                 <div className="text-[10px] text-gray-500 uppercase mb-1">LINKED YUE (IOT)</div>
                                 <div className={`text-md font-mono truncate ${user.yue ? 'text-dys-gold' : 'text-gray-600'}`}>
                                     {user.yue || "NOT_DETECTED"}
                                 </div>
                             </div>
                        </div>

                    </div>
                </div>
            )}

            {activeTab === 'LINK' && (
                <div className="flex flex-col items-center justify-center h-full">
                    <div className="w-full max-w-md space-y-6 border border-dys-cyan/20 p-8 bg-dys-panel/50">
                        <div className="text-center">
                            <h3 className="text-dys-cyan font-bold text-xl tracking-widest">MANUAL UPLINK</h3>
                            <p className="text-xs text-gray-500 mt-2">Enter the contract address of your existing LAU Soul Shell to restore identity.</p>
                        </div>
                        <input 
                            className="w-full bg-black border border-dys-border p-4 text-sm text-dys-cyan focus:border-dys-cyan outline-none font-mono text-center"
                            placeholder="0x..."
                            value={addressInput}
                            onChange={(e) => setAddressInput(e.target.value)}
                        />
                        <button 
                            onClick={linkLau}
                            disabled={isLoading}
                            className="w-full bg-dys-cyan/10 text-dys-cyan border border-dys-cyan hover:bg-dys-cyan hover:text-black py-4 font-bold transition-all tracking-widest"
                        >
                            {isLoading ? 'ESTABLISHING UPLINK...' : 'INITIATE NEURAL LINK'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'BIRTH' && (
                <div className="flex flex-col items-center justify-center h-full">
                     <div className="w-full max-w-md space-y-6 border border-dys-gold/20 p-8 bg-dys-panel/50">
                        <div className="text-center mb-6">
                            <h3 className="text-dys-gold font-bold text-xl tracking-widest">FABRICATE SOUL SHELL</h3>
                            <p className="text-xs text-gray-500 mt-2">Calls the LAU Factory to mint a new identity contract. This process requires gas and creates a permanent on-chain entity.</p>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] uppercase text-gray-500 font-bold">Callsign</label>
                                <input 
                                    className="w-full bg-black border border-dys-border p-3 text-sm focus:border-dys-gold outline-none font-mono"
                                    placeholder="e.g. Neo"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-gray-500 font-bold">Symbol</label>
                                <input 
                                    className="w-full bg-black border border-dys-border p-3 text-sm focus:border-dys-gold outline-none font-mono"
                                    placeholder="e.g. ONE"
                                    value={newSymbol}
                                    onChange={(e) => setNewSymbol(e.target.value)}
                                />
                            </div>
                        </div>

                        <button 
                            onClick={birthLau}
                            disabled={isLoading}
                            className="w-full bg-dys-gold/10 text-dys-gold border border-dys-gold hover:bg-dys-gold hover:text-black py-4 font-bold transition-all mt-6 tracking-widest"
                        >
                            {isLoading ? 'FABRICATING...' : 'EXECUTE FABRICATION'}
                        </button>
                    </div>
                </div>
            )}

        </div>
    </div>
  );
};

export default LauModule;