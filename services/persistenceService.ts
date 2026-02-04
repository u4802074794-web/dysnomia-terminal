
import { ChatMessage } from '../types';

const DB_NAME = 'DysnomiaDB';
const DB_VERSION = 1;

export interface SectorData {
    address: string;
    name: string;
    symbol: string;
    integrative: string;
    waat: string;
    isSystem: boolean;
}

export interface Range {
    start: number;
    end: number;
}

export interface ChannelMeta {
    address: string;
    scannedRanges: Range[];
    lastUpdated: number;
}

export interface ExportPackage {
    version: string;
    timestamp: number;
    type: 'FULL' | 'MAP' | 'CHAT';
    sectors?: SectorData[];
    channels: {
        address: string;
        meta: ChannelMeta;
        messages: ChatMessage[];
    }[];
}

export type ExportMode = 'FULL' | 'MAP' | 'CHAT';

class PersistenceService {
    private dbPromise: Promise<IDBDatabase> | null = null;

    constructor() {
        this.init();
    }

    private init(): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                if (!db.objectStoreNames.contains('sectors')) {
                    db.createObjectStore('sectors', { keyPath: 'address' });
                }

                if (!db.objectStoreNames.contains('messages')) {
                    const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
                    msgStore.createIndex('tokenAddress', 'tokenAddress', { unique: false });
                    msgStore.createIndex('blockNumber', 'blockNumber', { unique: false });
                    msgStore.createIndex('token_block', ['tokenAddress', 'blockNumber'], { unique: false });
                }

                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'address' });
                }
            };
        });

        return this.dbPromise;
    }

    // --- SECTOR MANAGEMENT ---

    async saveSector(sector: SectorData): Promise<void> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('sectors', 'readwrite');
            tx.objectStore('sectors').put(sector);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getAllSectors(): Promise<SectorData[]> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('sectors', 'readonly');
            const request = tx.objectStore('sectors').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // --- MESSAGE MANAGEMENT ---

    async saveMessages(messages: ChatMessage[], tokenAddress: string): Promise<void> {
        if (messages.length === 0) return;
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('messages', 'readwrite');
            const store = tx.objectStore('messages');
            
            messages.forEach(msg => {
                const msgWithToken = { ...msg, tokenAddress: tokenAddress.toLowerCase() };
                store.put(msgWithToken);
            });

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getMessages(tokenAddress: string, limit: number = 500): Promise<ChatMessage[]> {
        const db = await this.init();
        const addr = tokenAddress.toLowerCase();
        
        return new Promise((resolve, reject) => {
            const tx = db.transaction('messages', 'readonly');
            const index = tx.objectStore('messages').index('token_block');
            
            const range = IDBKeyRange.bound([addr, 0], [addr, Infinity]);
            const request = index.openCursor(range, 'prev'); 
            
            const results: ChatMessage[] = [];
            
            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor && results.length < limit) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results.reverse());
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // --- RANGE TRACKING ---

    async updateScannedRange(tokenAddress: string, start: number, end: number): Promise<void> {
        const db = await this.init();
        const addr = tokenAddress.toLowerCase();

        const meta: ChannelMeta = await new Promise((resolve) => {
            const tx = db.transaction('meta', 'readonly');
            const req = tx.objectStore('meta').get(addr);
            req.onsuccess = () => resolve(req.result || { address: addr, scannedRanges: [], lastUpdated: 0 });
        });

        const newRanges = this.mergeRanges(meta.scannedRanges, { start, end });

        return new Promise((resolve, reject) => {
            const tx = db.transaction('meta', 'readwrite');
            tx.objectStore('meta').put({
                address: addr,
                scannedRanges: newRanges,
                lastUpdated: Date.now()
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getChannelMeta(tokenAddress: string): Promise<ChannelMeta | null> {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('meta', 'readonly');
            const req = tx.objectStore('meta').get(tokenAddress.toLowerCase());
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    private mergeRanges(existing: Range[], newRange: Range): Range[] {
        let ranges = [...existing, newRange];
        ranges.sort((a, b) => a.start - b.start);

        const merged: Range[] = [];
        if (ranges.length === 0) return [];
        
        let current = ranges[0];

        for (let i = 1; i < ranges.length; i++) {
            const next = ranges[i];
            if (current.end + 1 >= next.start) {
                current.end = Math.max(current.end, next.end);
                current.start = Math.min(current.start, next.start);
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        return merged;
    }

    // --- IMPORT / EXPORT ---

    async exportData(mode: ExportMode, tokenAddress?: string): Promise<string> {
        const db = await this.init();
        
        const exportPkg: ExportPackage = {
            version: '1.1',
            timestamp: Date.now(),
            type: mode,
            sectors: [],
            channels: []
        };

        // 1. Export Sectors (If Mode is FULL or MAP)
        if (mode === 'FULL' || mode === 'MAP') {
            exportPkg.sectors = await this.getAllSectors();
        }

        // 2. Export Channels (If Mode is FULL or CHAT)
        if (mode === 'FULL' || mode === 'CHAT') {
            let addressesToExport: string[] = [];
            
            if (tokenAddress) {
                addressesToExport = [tokenAddress.toLowerCase()];
            } else if (mode === 'FULL') {
                const allMeta: ChannelMeta[] = await new Promise((resolve) => {
                    const tx = db.transaction('meta', 'readonly');
                    const req = tx.objectStore('meta').getAll();
                    req.onsuccess = () => resolve(req.result);
                });
                addressesToExport = allMeta.map(m => m.address);
            }

            for (const addr of addressesToExport) {
                const meta = await this.getChannelMeta(addr);
                const messages = await new Promise<ChatMessage[]>((resolve) => {
                    const tx = db.transaction('messages', 'readonly');
                    const index = tx.objectStore('messages').index('tokenAddress');
                    const req = index.getAll(IDBKeyRange.only(addr));
                    req.onsuccess = () => resolve(req.result);
                });

                if (meta) {
                    exportPkg.channels.push({
                        address: addr,
                        meta,
                        messages
                    });
                }
            }
        }

        return JSON.stringify(exportPkg, null, 2);
    }

    async importData(jsonString: string): Promise<{ sectorsAdded: number, messagesAdded: number }> {
        let pkg: ExportPackage;
        try {
            pkg = JSON.parse(jsonString);
        } catch (e) {
            throw new Error("Invalid JSON format");
        }

        let sectorsAdded = 0;
        let messagesAdded = 0;

        // 1. Import Sectors
        if (pkg.sectors && Array.isArray(pkg.sectors)) {
            for (const sector of pkg.sectors) {
                await this.saveSector(sector);
                sectorsAdded++;
            }
        }

        // 2. Import Channels
        if (pkg.channels && Array.isArray(pkg.channels)) {
            for (const channel of pkg.channels) {
                const { address, meta, messages } = channel;
                
                if (messages && messages.length > 0) {
                    await this.saveMessages(messages, address);
                    messagesAdded += messages.length;
                }

                if (meta) {
                    const existingMeta = await this.getChannelMeta(address);
                    let mergedRanges = meta.scannedRanges;
                    
                    if (existingMeta) {
                        let currentRanges = existingMeta.scannedRanges;
                        for (const range of meta.scannedRanges) {
                            currentRanges = this.mergeRanges(currentRanges, range);
                        }
                        mergedRanges = currentRanges;
                    }

                    const db = await this.init();
                    await new Promise<void>((resolve, reject) => {
                        const tx = db.transaction('meta', 'readwrite');
                        tx.objectStore('meta').put({
                            address: address.toLowerCase(),
                            scannedRanges: mergedRanges,
                            lastUpdated: Date.now()
                        });
                        tx.oncomplete = () => resolve();
                        tx.onerror = () => reject(tx.error);
                    });
                }
            }
        }

        return { sectorsAdded, messagesAdded };
    }
}

export const Persistence = new PersistenceService();
