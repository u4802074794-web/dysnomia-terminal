
import { Contract, InterfaceAbi } from "ethers";

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  LAU = 'LAU_IDENTITY',
  LAU_REGISTRY = 'LAU_REGISTRY',
  YUE = 'YUE_BRIDGE',
  QING = 'QING_NAV',
  MAP = 'MAP',
  VOID_CHAT = 'VOID_CHAT',
  CONTRACT_STUDIO = 'CONTRACT_STUDIO',
  SETTINGS = 'SETTINGS'
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'ERROR' | 'TX' | 'AI' | 'SUCCESS';
  message: string;
  details?: any;
}

export interface UserContext {
  address: string | null;
  isConnected: boolean;
  providerType: 'INJECTED' | 'MNEMONIC' | 'READ_ONLY';
  balance: string;
  lauAddress: string | null;
  username: string | null;
  currentArea: string | null; // The address of the QING or VOID the user is in
  yue: string | null; // Linked YUE address
  qings: string[]; // List of known QING addresses
  saat?: {
      pole: string;
      soul: string;
      aura: string;
  };
  // Unified Map Sync State
  mapSync: {
      isScanning: boolean;
      progress: string;
      triggerSync: () => void;
      stopSync: () => void;
  };
}

export interface DysnomiaContract {
  name: string;
  address: string;
  type: 'CORE' | 'ASSET' | 'USER' | 'CUSTOM';
  abi: InterfaceAbi;
}

export interface ChatMessage {
  id: string;
  sender: string;
  username?: string;
  content: string;
  timestamp: number;
  blockNumber: number;
  isMe: boolean;
}

export interface ContractInteractionRequest {
    contractName: string; // The name in the registry, or "CUSTOM"
    address?: string; // Optional override or for instances
    functionName?: string;
    args?: any[];
    description?: string;
}
