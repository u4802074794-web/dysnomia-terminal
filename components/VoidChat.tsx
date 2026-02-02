
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Interface, id } from 'ethers';
import { Web3Service } from '../services/web3Service';
import { ChatMessage, LogEntry } from '../types';
import { VOID_ABI, LAU_ABI, QING_ABI, ADDRESSES, MAP_ABI } from '../constants';
import { ChatCache } from '../services/chatCache';

interface VoidChatProps {
  web3: Web3Service;
  viewAddress: string; // The address we are MONITORING (Void or QING)
  lauArea: string | null; // The address our LAU is physically IN
  lauAddress: string | null;
  addLog: (entry: LogEntry) => void;
}

// 1. SHIO EVENT (Used by VOID) - Non-indexed params based on Solidity
const SHIO_LOG_ABI = ["event LogEvent(uint64 Soul, uint64 Aura, string LogLine)"];

// 2. QING EVENT - Non-indexed params based on Solidity
const QING_LOG_ABI = ["event LogEvent(string Username, uint64 Soul, uint64 Aura, string LogLine)"];

const CHUNK_SIZE = 5000; // Blocks per fetch
const POLL_INTERVAL = 10000; // 10s

const VoidChat: React.FC<VoidChatProps> = ({ web3, viewAddress, lauArea, lauAddress, addLog }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [channelName, setChannelName] = useState('LOADING...');
  
  // Scan State
  const [latestScannedBlock, setLatestScannedBlock] = useState<number>(0);
  const [earliestScannedBlock, setEarliestScannedBlock] = useState<number>(0);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize Area: If lauArea is null/undefined, it usually means Void or uninitialized.
  const currentPhysArea = lauArea || ADDRESSES.VOID;
  const inSync = viewAddress.toLowerCase() === currentPhysArea.toLowerCase();
  const isVoid = viewAddress.toLowerCase() === ADDRESSES.VOID.toLowerCase();

  // Helper to construct contract interfaces
  const getLogConfig = () => {
    const logSourceAddress = isVoid ? ADDRESSES.CHATLOG_SHIO : viewAddress;
    const logEventAbi = isVoid ? SHIO_LOG_ABI : QING_LOG_ABI;
    const logInterface = new Interface(logEventAbi);
    const topicSignature = isVoid 
            ? "LogEvent(uint64,uint64,string)"
            : "LogEvent(string,uint64,uint64,string)";
    return { logSourceAddress, logInterface, topicHash: id(topicSignature) };
  };

  // --- INITIALIZATION & CACHE ---
  useEffect(() => {
    if (!web3 || !viewAddress) return;
    
    // Reset state when view changes
    setInitialLoadComplete(false);
    
    // 1. Check Cache
    const cached = ChatCache.getCache(viewAddress);
    
    if (cached) {
        setMessages(cached.messages);
        setEarliestScannedBlock(cached.earliestBlock);
        setLatestScannedBlock(cached.latestBlock);
        setInitialLoadComplete(true);
    } else {
        setMessages([]);
        setLatestScannedBlock(0);
        setEarliestScannedBlock(0);
    }
    
    // 2. Fetch Channel Name
    const fetchName = async () => {
        if (isVoid) {
            setChannelName("THE VOID (GLOBAL)");
        } else {
            try {
                const contract = web3.getContract(viewAddress, QING_ABI);
                const name = await contract.name();
                setChannelName(`SECTOR: ${name}`);
            } catch(e) { 
                setChannelName(`SECTOR: ${viewAddress.substring(0,8)}`); 
            }
        }
    };
    fetchName();

  }, [web3, viewAddress, isVoid]);


  // --- CORE FETCH LOGIC ---
  const fetchMessagesInRange = async (fromBlock: number, toBlock: number | string): Promise<ChatMessage[]> => {
      const { logSourceAddress, logInterface, topicHash } = getLogConfig();
      const provider = web3.getProvider();

      try {
        const filter = {
            address: logSourceAddress, 
            topics: [topicHash],
            fromBlock: fromBlock,
            toBlock: toBlock
        };

        const logs = await provider.getLogs(filter);
        
        return logs.map((log: any): ChatMessage | null => {
           try {
               const parsed = logInterface.parseLog(log);
               if(!parsed) return null;
               
               let soulId, content, username;

               if (isVoid) {
                   soulId = parsed.args[0].toString();
                   content = parsed.args[2];
                   username = `Soul #${soulId}`;
               } else {
                   username = parsed.args[0];
                   soulId = parsed.args[1].toString();
                   content = parsed.args[3];
               }

               return {
                id: `${log.transactionHash}-${log.index}`,
                sender: `SOUL:${soulId}`, 
                username: username,
                content: content, 
                timestamp: Date.now(), 
                blockNumber: log.blockNumber,
                isMe: false 
              };
           } catch(e) { return null; }
        }).filter((m): m is ChatMessage => m !== null);
      } catch (e) {
          console.warn("Fetch error", e);
          return [];
      }
  };


  // --- LIVE POLLING ---
  useEffect(() => {
      if(!web3 || !viewAddress) return;

      const poll = async () => {
          const provider = web3.getProvider();
          const currentBlock = await provider.getBlockNumber();

          let fromBlock;
          
          if (latestScannedBlock === 0) {
              // First Load (No Cache)
              fromBlock = Math.max(22813947, currentBlock - 2000);
              setEarliestScannedBlock(fromBlock); // Establish baseline
          } else {
              // Incremental Load (Cache exists)
              fromBlock = latestScannedBlock + 1;
          }

          // Safety check
          if (fromBlock > currentBlock) return;

          const newMsgs = await fetchMessagesInRange(fromBlock, 'latest');
          
          if (newMsgs.length > 0 || latestScannedBlock === 0) {
              setMessages(prev => {
                  const existingIds = new Set(prev.map(m => m.id));
                  const uniqueNew = newMsgs.filter(m => !existingIds.has(m.id));
                  const combined = [...prev, ...uniqueNew].sort((a,b) => a.blockNumber - b.blockNumber);
                  
                  ChatCache.setCache(
                      viewAddress, 
                      combined, 
                      latestScannedBlock === 0 ? fromBlock : earliestScannedBlock, 
                      currentBlock
                  );
                  return combined;
              });
          }

          setLatestScannedBlock(currentBlock);
          if(!initialLoadComplete) setInitialLoadComplete(true);
      };

      if (latestScannedBlock === 0) poll();
      
      const interval = setInterval(poll, POLL_INTERVAL);
      return () => clearInterval(interval);

  }, [web3, viewAddress, latestScannedBlock, earliestScannedBlock, initialLoadComplete]);


  // --- HISTORY PAGINATION ---
  const loadHistory = async () => {
      if (earliestScannedBlock <= 22813947 || isLoadingHistory) return;
      setIsLoadingHistory(true);
      const container = containerRef.current;
      const oldScrollHeight = container ? container.scrollHeight : 0;

      try {
          const toBlock = earliestScannedBlock - 1;
          const fromBlock = Math.max(22813947, earliestScannedBlock - CHUNK_SIZE);

          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Retrieving archival signals: Blocks ${fromBlock} - ${toBlock}...` });

          const oldMsgs = await fetchMessagesInRange(fromBlock, toBlock);

          if (oldMsgs.length > 0) {
              setMessages(prev => {
                  const existingIds = new Set(prev.map(m => m.id));
                  const uniqueOld = oldMsgs.filter(m => !existingIds.has(m.id));
                  const combined = [...uniqueOld, ...prev].sort((a,b) => a.blockNumber - b.blockNumber);
                  ChatCache.setCache(viewAddress, combined, fromBlock, latestScannedBlock);
                  return combined;
              });
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Archives Restored: ${oldMsgs.length} signals found.` });
          } else {
               addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `No signals found in this frequency band.` });
          }

          setEarliestScannedBlock(fromBlock);

          requestAnimationFrame(() => {
              if (container) {
                  const newScrollHeight = container.scrollHeight;
                  const heightDiff = newScrollHeight - oldScrollHeight;
                  container.scrollTop = heightDiff > 0 ? heightDiff : 0;
              }
          });

      } catch (e: any) {
           addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Archive retrieval failed: ${e.message}` });
      } finally {
          setIsLoadingHistory(false);
      }
  };


  // --- SCROLL TO BOTTOM ---
  useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom || (initialLoadComplete && messages.length < 20)) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
  }, [messages, initialLoadComplete]);


  // --- SEND HANDLER ---
  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    if (!lauAddress) {
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Pilot Identity Required for Transmission.` });
        return;
    }
    
    // NOTE: We allow sending remotely to QINGs now via QING.Chat(lau, msg)
    // If targeting VOID, we use LAU.Chat(msg) which emits to current area.
    // If not in sync with VOID, we warn but allow trying.

    setIsLoading(true);

    try {
      let tx;
      
      if (isVoid) {
          // TARGET: VOID (Global)
          // We use LAU.Chat() which speaks to the environment.
          // Note: If LAU is in a QING, this will speak to the QING, not VOID global.
          // There is no remote VOID chat function in the abi provided, so we assume LAU.Chat implies local.
          if (!inSync) {
               addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Broadcasting via Neural Link (Remote)...` });
          } else {
               addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Broadcasting to Local Environment...` });
          }
          const lauContract = web3.getContract(lauAddress, LAU_ABI); 
          tx = await web3.sendTransaction(lauContract, 'Chat', [inputText]);

      } else {
          // TARGET: QING SECTOR
          // QING contracts allow remote chat via Chat(UserToken, Message)
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Broadcasting to QING Sector (Narrowbeam)...` });
          const qingContract = web3.getContract(viewAddress, QING_ABI);
          // QING.Chat(address UserToken, string memory MSG)
          tx = await web3.sendTransaction(qingContract, 'Chat', [lauAddress, inputText]);
      }

      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Signal Broadcasted: ${tx.hash}` });

      setInputText('');
      await web3.waitForReceipt(tx);
      
      addLog({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'SUCCESS',
        message: `Transmission Confirmed.`
      });

    } catch (err: any) {
      addLog({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'ERROR',
        message: 'Transmission Failed',
        details: web3.parseError(err)
      });
    } finally {
      setIsLoading(false);
    }
  };

  const attemptTransit = async () => {
      if(!web3 || !lauAddress) return;
      setIsLoading(true);
      try {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'TX', message: `Initiating Transit to ${viewAddress.substring(0,8)}...` });
          const map = web3.getContract(ADDRESSES.MAP, MAP_ABI);
          
          // Note: MAP.Enter calls QING.Join internally. If already joined (paid), it might revert with AlreadyJoined.
          // This is a known protocol quirk.
          const tx = await web3.sendTransaction(map, 'Enter', [lauAddress, viewAddress]);
          
          await web3.waitForReceipt(tx);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'SUCCESS', message: `Transit Complete.` });
      } catch(e: any) {
          const errStr = web3.parseError(e);
          // Check for AlreadyJoined signature 0x17d341bf
          if (errStr.includes("0x17d341bf") || errStr.includes("AlreadyJoined")) {
               addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'INFO', message: `Transit Info: Already Admitted/Located.` });
          } else {
               addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), type: 'ERROR', message: `Transit Failed`, details: errStr });
          }
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="flex flex-col h-full bg-black/50 border-t border-dys-border relative overflow-hidden">
      
      {/* Header */}
      <div className="p-2 border-b border-dys-border bg-dys-panel/50 flex justify-between items-center z-10 shrink-0">
          <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${inSync ? 'bg-dys-green animate-pulse' : 'bg-dys-gold'}`}></div>
              <div>
                  <h3 className="text-dys-cyan font-bold tracking-widest text-[10px] uppercase">
                      COMMS_LINK // {channelName}
                  </h3>
                  <div className="text-[9px] text-gray-500 font-mono">
                      STATUS: {inSync ? "LOCAL_UPLINK" : "REMOTE_RELAY"}
                  </div>
              </div>
          </div>
          <div className="text-[9px] text-gray-600 font-mono">
              RANGE: {earliestScannedBlock} - {latestScannedBlock}
          </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 z-10 scrollbar-thin relative" ref={containerRef}>
        
        {/* Load History Button */}
        <div className="flex justify-center mb-4">
            <button 
                onClick={loadHistory}
                disabled={isLoadingHistory}
                className="text-[10px] text-dys-cyan hover:text-white border border-dys-cyan/30 bg-dys-cyan/5 hover:bg-dys-cyan/20 px-4 py-1 rounded transition-colors disabled:opacity-50 font-bold tracking-widest"
            >
                {isLoadingHistory ? 'DECRYPTING ARCHIVES...' : '▲ LOAD PREVIOUS SIGNALS'}
            </button>
        </div>

        {messages.length === 0 && !isLoadingHistory && (
            <div className="text-center text-gray-700 mt-10 font-mono text-xs">
                -- NO SIGNALS DETECTED IN CURRENT RANGE --
            </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col max-w-[90%] ${msg.isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
            <div className="flex items-baseline gap-2 text-[9px] text-dys-cyan font-mono mb-0.5 opacity-70">
              <span className="font-bold">{msg.username || msg.sender}</span>
              <span className="text-gray-600">[{msg.blockNumber}]</span>
            </div>
            <div className="px-3 py-1.5 border border-dys-border bg-dys-panel/80 text-gray-300">
              <p className="font-mono text-xs whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 bg-dys-panel border-t border-dys-border z-10 shrink-0">
        {!lauAddress ? (
            <div className="text-dys-red font-mono text-center text-[10px] p-2">
                [ERROR] NO IDENTITY DETECTED
            </div>
        ) : (
            <div className="flex gap-0 border border-dys-border bg-black">
                <span className={`px-3 py-2 font-mono text-xs flex items-center border-r border-dys-border ${inSync ? 'text-dys-green' : 'text-dys-gold'}`}>
                    {inSync ? 'LOC:' : 'RMT:'}
                </span>
                
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={inSync ? "Broadcast message..." : "Transmit remote signal..."}
                    disabled={isLoading}
                    className="flex-1 bg-black text-white px-3 py-2 font-mono text-xs focus:outline-none disabled:opacity-50"
                />
                
                {!inSync && (
                    <button 
                        onClick={attemptTransit}
                        disabled={isLoading}
                        title="Physically travel to this sector"
                        className="bg-dys-cyan/10 text-dys-cyan border-l border-dys-border hover:bg-dys-cyan hover:text-black px-3 py-2 text-[10px] font-bold transition-all"
                    >
                        ✈
                    </button>
                )}

                <button
                    onClick={handleSend}
                    disabled={isLoading || !inputText.trim()}
                    className="bg-dys-green/10 text-dys-green hover:bg-dys-green hover:text-black font-bold px-4 py-2 transition-colors disabled:opacity-50 font-mono text-[10px] tracking-wider"
                >
                    {isLoading ? '...' : 'SEND'}
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default VoidChat;
