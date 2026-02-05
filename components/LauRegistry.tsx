
import React, { useState, useEffect, useRef } from 'react';
import { Web3Service } from '../services/web3Service';
import { LogEntry, UserContext } from '../types';
import { ADDRESSES, LAU_ABI, CHO_ABI, QING_ABI } from '../constants';
import { Persistence, LauData } from '../services/persistenceService';
import { isAddress, ZeroAddress } from 'ethers';

interface LauRegistryProps {
    web3: Web3Service | null;
    user: UserContext;
    addLog: (entry: LogEntry) => void;
    setUser: React.Dispatch<React.SetStateAction<UserContext>>;
    initialSearchTerm?: string;
}

// Helpers for Soul Sigil
const getSoulTheme = (soulIdStr: string) => {
    let hash = 0;
    for (let i = 0; i < soulIdStr.length; i++) {
        hash = soulIdStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash) % 360;
    const primary = `hsl(${h1}, 75%, 60%)`;
    const hash2 = (hash * 1664525 + 1013904223) | 0;
    const h2 = Math.abs(hash2) % 360;
    const secondary = `hsl(${h2}, 85%, 70%)`;
    return { primary, secondary };
};

const SoulSigil: React.FC<{ soulId: string, size?: number }> = ({ soulId, size = 32 }) => {
    const { primary, secondary } = getSoulTheme(soulId);
    const generateMatrix = () => {
        let hash = 0;
        for (let i = 0; i < soulId.length; i++) {
            hash = soulId.charCodeAt(i) + ((hash << 5) - hash);
        }
        const shapeBits = [];
        for(let i = 0; i < 15; i++) shapeBits.push(((hash >> i) & 1) === 1);
        const colorHash = (hash * 1664525 + 1013904223) | 0;
        const colorBits = [];
        for(let i = 0; i < 15; i++) colorBits.push(((colorHash >> i) & 1) === 1);
        return { shapeBits, colorBits };
    };
    const { shapeBits, colorBits } = generateMatrix();
    return (
        <svg width={size} height={size} viewBox="0 0 5 5" shapeRendering="crispEdges" className="bg-black border border-white/10 shrink-0">
            <rect x="0" y="0" width="5" height="5" fill="#050505" />
            {Array.from({ length: 5 }).map((_, y) => (
                Array.from({ length: 3 }).map((_, x) => {
                    const idx = y * 3 + x;
                    if (shapeBits[idx]) {
                        const fill = colorBits[idx] ? secondary : primary;
                        return (
                            <React.Fragment key={`${x}-${y}`}>
                                <rect x={x} y={y} width="1" height="1" fill={fill} />
                                {x < 2 && <rect x={4 - x} y={y} width="1" height="1" fill={fill} />}
                            </React.Fragment>
                        );
                    }
                    return null;
                })
            ))}
        </svg>
    );
};

const LauRegistry: React.FC<LauRegistryProps> = ({ web3, user, addLog, initialSearchTerm = '' }) => {
    const [laus, setLaus] = useState<LauData[]>([]);
    const [searchQuery, setSearchQuery] = useState(initialSearchTerm);
    const [isMining, setIsMining] = useState(false);
    const [loading, setLoading] = useState(false);
    const [miningStatus, setMiningStatus] = useState<string>('');
    
    // Manual Add State
    const [manualAddress, setManualAddress] = useState('');
    
    // Details
    const [selectedLau, setSelectedLau] = useState<LauData | null>(null);
    const [fetchedDetails, setFetchedDetails] = useState<any>(null);
    
    const abortControllerRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial Load
    useEffect(() => {
        loadData();
    }, []);

    // Respond to prop changes for search (deep linking)
    useEffect(() => {
        if (initialSearchTerm) {
            setSearchQuery(initialSearchTerm);
        }
    }, [initialSearchTerm]);

    const loadData = async () => {
        const storedLaus = await Persistence.getAllLaus();
        storedLaus.sort((a,b) => b.timestamp - a.timestamp);
        setLaus(storedLaus);
    };

    const handleClearCache = async () => {
        if (window.confirm("WARNING: This will wipe all local data (Chat History, Registry, Maps). Continue?")) {
            await Persistence.clearDatabase();
            setLaus([]);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Local Database Purged.` });
            window.location.reload();
        }
    };

    // Filter Logic
    const filteredLaus = laus.filter(l => 
        l.address.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (l.username && l.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
        l.owner.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.soulId && l.soulId.includes(searchQuery))
    );

    // Manual Add Logic
    const handleManualAdd = async () => {
        if (!web3 || !manualAddress || !isAddress(manualAddress)) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Invalid Address Format.` });
            return;
        }
        
        setLoading(true);
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Probing Address: ${manualAddress}...` });

        try {
            const lauContract = web3.getContract(manualAddress, LAU_ABI);
            
            // Check multiple potential valid indicators
            const [username, owner, type, area, saat1] = await Promise.all([
                lauContract.Username().catch(() => null),
                lauContract.owner().catch(() => null),
                lauContract.Type().catch(() => null),
                lauContract.CurrentArea().catch(() => null),
                lauContract.Saat(1).catch(() => 0n)
            ]);

            // Be permissive: If ANY call succeeded with a valid-looking result, assume it's a LAU
            if (username || owner || (type && type.includes('LAU')) || area) {
                const newData: LauData = {
                    address: manualAddress,
                    owner: owner || "UNKNOWN",
                    blockNumber: 0, // Unknown if manually added
                    timestamp: Date.now(),
                    username: username || "UNKNOWN",
                    soulId: saat1 > 0n ? saat1.toString() : undefined
                };
                
                await Persistence.saveLau(newData);
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Identity Added: ${username || manualAddress}` });
                await loadData();
                setManualAddress('');
            } else {
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `No valid signal from address.` });
            }

        } catch (e: any) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Probe Failed: ${e.message}` });
        } finally {
            setLoading(false);
        }
    };

    // --- DEEP DISCOVERY MINING ---
    const cancelDiscovery = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsMining(false);
            setMiningStatus("CANCELLED");
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Discovery Aborted by User.` });
        }
    };

    const runDeepDiscovery = async () => {
        if (!web3) return;
        setIsMining(true);
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Initializing Deep Discovery Protocol...` });

            // 1. Gather Unique Souls from Chat Logs
            setMiningStatus("MINING CHAT LOGS...");
            const sectors = await Persistence.getAllSectors();
            const channels = [ADDRESSES.VOID, ...sectors.map(s => s.address)];
            const souls = new Set<string>();
            
            // Optimization: We won't scan literally every message if there are millions, but we scan local DB
            for (const ch of channels) {
                if (signal.aborted) break;
                // Fetch recent messages from local DB
                const msgs = await Persistence.getMessages(ch, 2000); 
                msgs.forEach(m => {
                    // Try to parse soul ID from sender if it's purely numeric
                    if (m.sender && !isNaN(Number(m.sender))) souls.add(m.sender);
                });
            }

            const totalCandidates = souls.size;
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Identified ${souls.size} Soul Signatures. Resolving...` });

            // 3. Resolve Souls to Wallets to LAUs via CHO
            const cho = web3.getContract(ADDRESSES.CHO, CHO_ABI);
            let resolvedCount = 0;
            let newlyFound = 0;

            const soulArray = Array.from(souls);
            
            // Process in small batches to avoid blocking UI
            for (let i = 0; i < soulArray.length; i++) {
                if (signal.aborted) break;
                const soulId = soulArray[i];
                
                // Skip if we already have this soulId linked to a LAU
                const existingLau = laus.find(l => l.soulId === soulId);
                if (existingLau) continue;

                setMiningStatus(`RESOLVING SOUL ${i+1}/${soulArray.length} [ID: ${soulId}]`);

                try {
                    // Step A: Soul -> Wallet
                    const wallet = await cho.GetAddressBySoul(soulId);
                    if (!wallet || wallet === ZeroAddress) continue;

                    // Step B: Wallet -> LAU
                    const lauAddress = await cho.GetUserTokenAddress(wallet);
                    if (!lauAddress || lauAddress === ZeroAddress) continue;

                    // Step C: Check if exists by Address (double check)
                    const exists = laus.find(l => l.address.toLowerCase() === lauAddress.toLowerCase());
                    if (exists) {
                        // Optional: Update existing record with soulId if missing
                        if (!exists.soulId) {
                            await Persistence.saveLau({ ...exists, soulId });
                        }
                        continue;
                    }

                    // Step D: Validate & Fetch Details
                    const lauContract = web3.getContract(lauAddress, LAU_ABI);
                    const username = await lauContract.Username().catch(() => "Unknown");

                    const newLau: LauData = {
                        address: lauAddress,
                        owner: wallet,
                        blockNumber: 0, // Unknown
                        timestamp: Date.now(),
                        username,
                        soulId: soulId
                    };

                    await Persistence.saveLau(newLau);
                    newlyFound++;
                    resolvedCount++;
                    
                    // Minor delay to respect RPC rate limits
                    await new Promise(r => setTimeout(r, 20));

                } catch (e) {
                    // Soul might not be registered or RPC error
                }
            }

            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Deep Discovery Complete. ${newlyFound} New Entities Cataloged.` });
            await loadData();

        } catch (e: any) {
            if (e.message !== "Aborted") {
                console.error(e);
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Mining Error: ${e.message}` });
            }
        } finally {
            setIsMining(false);
            setMiningStatus("");
            abortControllerRef.current = null;
        }
    };

    // Detail View Logic
    const viewDetails = async (lau: LauData) => {
        setSelectedLau(lau);
        setFetchedDetails(null);
        if (!web3) return;

        try {
            const contract = web3.getContract(lau.address, LAU_ABI);
            const [username, area, saat0, saat1, saat2] = await Promise.all([
                contract.Username().catch(() => null),
                contract.CurrentArea().catch(() => null),
                contract.Saat(0).catch(() => 0n),
                contract.Saat(1).catch(() => 0n),
                contract.Saat(2).catch(() => 0n)
            ]);

            const soulId = saat1 > 0n ? saat1.toString() : lau.soulId;

            // Update local persistence with fresh data
            if ((username && username !== lau.username) || (soulId && soulId !== lau.soulId)) {
                const updatedLau = { ...lau, username: username || lau.username, soulId };
                await Persistence.saveLau(updatedLau);
                setLaus(prev => prev.map(l => l.address === lau.address ? updatedLau : l));
            }

            setFetchedDetails({
                username,
                currentArea: area,
                saat: { pole: saat0.toString(), soul: saat1.toString(), aura: saat2.toString() }
            });

        } catch(e) { console.error(e); }
    };

    // Import/Export
    const handleExport = async () => {
        try {
            const json = await Persistence.exportData('LAU');
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dysnomia_lau_registry_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Registry Exported.` });
        } catch(e: any) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Export Failed: ${e.message}` });
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                setLoading(true);
                const result = await Persistence.importData(event.target?.result as string);
                setLoading(false);
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Imported: ${result.lausAdded} Identities.` });
                loadData();
            } catch(e: any) {
                setLoading(false);
                addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Import Failed: ${e.message}` });
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="h-full flex flex-col bg-dys-black p-4 md:p-8 font-mono text-gray-300">
            <div className="w-full max-w-6xl mx-auto flex flex-col h-full gap-4">
                
                {/* TOP BAR */}
                <div className="flex flex-col gap-4 border-b border-dys-border pb-4 shrink-0">
                    <div className="flex justify-between items-end">
                        <div>
                            <h2 className="text-2xl text-dys-green font-bold tracking-tighter">LAU REGISTRY // SOUL_INDEX</h2>
                            <div className="text-xs text-gray-500 mt-1">
                                KNOWN ENTITIES: <span className="text-white font-bold">{laus.length}</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                className="bg-black border border-dys-border p-2 text-xs text-dys-green focus:border-dys-green outline-none w-48"
                                placeholder="Filter Address/Name/ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <button 
                                onClick={isMining ? cancelDiscovery : runDeepDiscovery}
                                className={`px-4 py-2 font-bold text-xs border transition-all flex items-center gap-2 ${isMining ? 'bg-dys-red text-black border-dys-red animate-pulse' : 'bg-dys-green/10 text-dys-green border-dys-green/50 hover:bg-dys-green hover:text-black'}`}
                            >
                                {isMining ? 'STOP SCAN' : 'DEEP DISCOVERY'}
                            </button>
                        </div>
                    </div>

                    {/* CONTROL PANEL */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* MANUAL ADD */}
                        <div className="bg-dys-panel border border-dys-border p-3">
                             <div className="text-[10px] text-gray-500 font-bold uppercase mb-2">Manual Import (Probe)</div>
                             <div className="flex gap-2">
                                 <input 
                                     className="flex-1 bg-black border border-dys-border p-2 text-xs text-dys-cyan focus:border-dys-cyan outline-none"
                                     placeholder="Enter LAU Address..."
                                     value={manualAddress}
                                     onChange={(e) => setManualAddress(e.target.value)}
                                 />
                                 <button 
                                    onClick={handleManualAdd}
                                    disabled={loading || !manualAddress}
                                    className="bg-dys-cyan/10 text-dys-cyan border border-dys-cyan hover:bg-dys-cyan hover:text-black px-3 py-1 font-bold text-xs"
                                 >
                                     IMPORT
                                 </button>
                             </div>
                        </div>
                        
                        {/* MINING STATUS */}
                        <div className="bg-dys-panel border border-dys-border p-3 flex flex-col justify-center">
                            <div className="flex justify-between items-center mb-1">
                                <div className="text-[10px] text-gray-500 font-bold uppercase">Discovery Status</div>
                            </div>
                            <div className="bg-black border border-gray-800 p-2 h-8 flex items-center justify-center">
                                {isMining ? (
                                    <span className="text-[10px] text-dys-gold font-mono animate-pulse">{miningStatus}</span>
                                ) : (
                                    <span className="text-[10px] text-gray-600 font-mono">IDLE - READY TO MINE LOGS</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* MAIN CONTENT */}
                <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
                    
                    {/* LIST */}
                    <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start pb-4">
                        {filteredLaus.map((lau) => {
                            // Use soulId for avatar if available, otherwise fallback to address part
                            const seed = lau.soulId || lau.address.substring(2, 8);
                            return (
                                <button 
                                    key={lau.address}
                                    onClick={() => viewDetails(lau)}
                                    className={`text-left p-4 border transition-all group relative overflow-hidden flex items-start gap-4 h-24 ${selectedLau?.address === lau.address ? 'border-dys-green bg-dys-green/10' : 'border-dys-border bg-black hover:border-dys-green/50'}`}
                                >
                                    <SoulSigil soulId={seed} size={48} /> 
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-bold text-sm truncate ${selectedLau?.address === lau.address ? 'text-white' : 'text-gray-400 group-hover:text-dys-green'}`}>
                                            {lau.username || "UNKNOWN_PILOT"}
                                        </div>
                                        <div className="text-[10px] text-gray-600 font-mono truncate">{lau.address}</div>
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[9px] text-gray-700">
                                                {lau.blockNumber > 0 ? `BLK: ${lau.blockNumber}` : "DISCOVERED"}
                                            </span>
                                            {lau.soulId && <span className="text-[9px] text-dys-gold">SOUL: {lau.soulId}</span>}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                        
                        {filteredLaus.length === 0 && (
                            <div className="col-span-full text-center text-gray-600 py-10 italic">
                                No entities found. Use 'Deep Discovery' to mine logs or import manually.
                            </div>
                        )}
                    </div>

                    {/* DETAILS PANEL */}
                    {selectedLau && (
                        <div className="w-80 md:w-96 bg-dys-panel border border-dys-border flex flex-col shrink-0 overflow-hidden">
                            <div className="p-4 border-b border-dys-border bg-black/50 shrink-0">
                                <h3 className="text-dys-green font-bold text-sm tracking-widest">ENTITY_DOSSIER</h3>
                            </div>
                            
                            <div className="p-6 flex flex-col items-center border-b border-dys-border/50 shrink-0">
                                <SoulSigil soulId={selectedLau.soulId || selectedLau.address.substring(2, 8)} size={96} />
                                <div className="mt-4 text-xl font-bold text-white">{fetchedDetails?.username || selectedLau.username || "UNKNOWN"}</div>
                                <div className="text-[10px] text-dys-green bg-dys-green/10 px-2 py-1 rounded mt-2 font-mono select-all">
                                    {selectedLau.address}
                                </div>
                            </div>

                            <div className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-thin">
                                <div>
                                    <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Origin (Pilot)</div>
                                    <div className="text-xs text-gray-300 font-mono break-all">{selectedLau.owner}</div>
                                </div>
                                {selectedLau.soulId && (
                                    <div>
                                        <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Soul ID</div>
                                        <div className="text-xs text-dys-gold font-mono">{selectedLau.soulId}</div>
                                    </div>
                                )}
                                <div>
                                    <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Acquisition</div>
                                    <div className="text-xs text-gray-300">
                                        {new Date(selectedLau.timestamp).toLocaleDateString()}
                                    </div>
                                </div>

                                {fetchedDetails && (
                                    <>
                                        <div className="pt-4 border-t border-dys-border/30">
                                            <div className="text-[10px] text-dys-cyan font-bold uppercase mb-2">Current Location</div>
                                            <div className="text-xs text-dys-cyan font-mono break-all">
                                                {fetchedDetails.currentArea || "VOID (NULL)"}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-[10px] text-dys-gold font-bold uppercase mb-2">Saat Matrix</div>
                                            <div className="grid grid-cols-3 gap-2 text-center">
                                                <div className="bg-black border border-dys-border p-2">
                                                    <div className="text-[9px] text-gray-500">POLE</div>
                                                    <div className="text-xs font-bold text-dys-gold">{fetchedDetails.saat.pole}</div>
                                                </div>
                                                <div className="bg-black border border-dys-border p-2">
                                                    <div className="text-[9px] text-gray-500">SOUL</div>
                                                    <div className="text-xs font-bold text-dys-gold">{fetchedDetails.saat.soul}</div>
                                                </div>
                                                <div className="bg-black border border-dys-border p-2">
                                                    <div className="text-[9px] text-gray-500">AURA</div>
                                                    <div className="text-xs font-bold text-dys-gold">{fetchedDetails.saat.aura}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* FOOTER CONTROLS */}
                <div className="border-t border-dys-border pt-4 flex gap-4 justify-end shrink-0">
                     <button onClick={handleClearCache} className="text-[10px] text-dys-red hover:text-white uppercase font-bold border border-transparent hover:border-dys-red px-3 py-1 transition-all mr-auto">NUKE CACHE (RESET DB)</button>
                     <button onClick={handleExport} className="text-[10px] text-gray-500 hover:text-white uppercase font-bold border border-transparent hover:border-gray-500 px-3 py-1 transition-all">EXPORT REGISTRY</button>
                     <label className="text-[10px] text-gray-500 hover:text-white uppercase font-bold border border-transparent hover:border-gray-500 px-3 py-1 transition-all cursor-pointer">
                        {loading ? 'IMPORTING...' : 'IMPORT REGISTRY'}
                        <input type="file" accept=".json" ref={fileInputRef} onChange={handleImport} disabled={loading} className="hidden" />
                     </label>
                </div>

            </div>
        </div>
    );
};

export default LauRegistry;
