import { SessionData } from '../types';

const DB_NAME = 'chromanumber-db';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

/**
 * Open (or create) the IndexedDB
 */
const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("IndexedDB error:", request.error);
            reject("Could not open database");
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            resolve((event.target as IDBOpenDBRequest).result);
        };
    });
};

/**
 * Save the current session to IndexedDB (key: 'current')
 */
export const saveLastSession = async (data: SessionData): Promise<void> => {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        // We store it with ID 'current' so we can overwrite it easily
        const record = { id: 'current', ...data };

        await new Promise<void>((resolve, reject) => {
            const req = store.put(record);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.error("Failed to save session", e);
        throw e;
    }
};

/**
 * Load the 'current' session from IndexedDB
 */
export const loadLastSession = async (): Promise<SessionData | null> => {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);

        return new Promise((resolve, reject) => {
            const req = store.get('current');
            req.onsuccess = () => {
                if (req.result) {
                    // Remove the 'id' key we added for storage
                    const { id, ...data } = req.result;
                    resolve(data as SessionData);
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.error("Failed to load session", e);
        return null;
    }
};

/**
 * Clear the saved session
 */
export const clearSession = async (): Promise<void> => {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete('current');
    } catch (e) {
        console.error("Failed to clear session", e);
    }
};
