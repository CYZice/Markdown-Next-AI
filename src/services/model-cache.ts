/**
 * Model Cache Manager
 * 使用 IndexedDB 缓存模型，避免重复下载
 * 模仿 Smart Connections 的缓存策略
 */

/**
 * 缓存项接口
 */
export interface CacheItem {
    key: string;
    data: any;
    timestamp: number;
    size?: number;
}

/**
 * 模型缓存管理器
 * 使用 IndexedDB 持久化存储模型
 */
export class ModelCacheManager {
    private static instance: ModelCacheManager | null = null;
    private db: IDBDatabase | null = null;
    private dbName = 'MardownNextAI-ModelCache';
    private storeName = 'models';
    private dbVersion = 1;
    private initPromise: Promise<void> | null = null;

    private constructor() { }

    /**
     * 获取单例实例
     */
    static getInstance(): ModelCacheManager {
        if (!ModelCacheManager.instance) {
            ModelCacheManager.instance = new ModelCacheManager();
        }
        return ModelCacheManager.instance;
    }

    /**
     * 初始化数据库
     */
    async init(): Promise<void> {
        if (this.db) {
            return;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(this.dbName, this.dbVersion);

                request.onerror = () => {
                    console.error('[ModelCache] Failed to open database');
                    reject(new Error('Failed to open IndexedDB'));
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    console.log('[ModelCache] Database initialized');
                    resolve();
                };

                request.onupgradeneeded = (event) => {
                    const db = (event.target as IDBOpenDBRequest).result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName, { keyPath: 'key' });
                        console.log('[ModelCache] Object store created');
                    }
                };
            } catch (error) {
                console.error('[ModelCache] Error initializing database:', error);
                reject(error);
            }
        });

        return this.initPromise;
    }

    /**
     * 获取缓存
     */
    async get(key: string): Promise<any | null> {
        try {
            await this.init();
            if (!this.db) {
                return null;
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db!.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(key);

                request.onsuccess = () => {
                    const result = request.result;
                    if (result) {
                        console.log(`[ModelCache] Cache hit for key: ${key}`);
                        resolve(result.data);
                    } else {
                        console.log(`[ModelCache] Cache miss for key: ${key}`);
                        resolve(null);
                    }
                };

                request.onerror = () => {
                    console.error('[ModelCache] Error reading from cache');
                    reject(new Error('Failed to read from cache'));
                };
            });
        } catch (error) {
            console.error('[ModelCache] Error getting cache:', error);
            return null;
        }
    }

    /**
     * 设置缓存
     */
    async set(key: string, data: any, size?: number): Promise<boolean> {
        try {
            await this.init();
            if (!this.db) {
                return false;
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db!.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);

                const cacheItem: CacheItem = {
                    key,
                    data,
                    timestamp: Date.now(),
                    size
                };

                const request = store.put(cacheItem);

                request.onsuccess = () => {
                    console.log(`[ModelCache] Cache saved for key: ${key}`);
                    resolve(true);
                };

                request.onerror = () => {
                    console.error('[ModelCache] Error writing to cache');
                    reject(new Error('Failed to write to cache'));
                };
            });
        } catch (error) {
            console.error('[ModelCache] Error setting cache:', error);
            return false;
        }
    }

    /**
     * 删除缓存
     */
    async remove(key: string): Promise<boolean> {
        try {
            await this.init();
            if (!this.db) {
                return false;
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db!.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.delete(key);

                request.onsuccess = () => {
                    console.log(`[ModelCache] Cache removed for key: ${key}`);
                    resolve(true);
                };

                request.onerror = () => {
                    console.error('[ModelCache] Error deleting cache');
                    reject(new Error('Failed to delete cache'));
                };
            });
        } catch (error) {
            console.error('[ModelCache] Error removing cache:', error);
            return false;
        }
    }

    /**
     * 清空所有缓存
     */
    async clear(): Promise<boolean> {
        try {
            await this.init();
            if (!this.db) {
                return false;
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db!.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.clear();

                request.onsuccess = () => {
                    console.log('[ModelCache] All caches cleared');
                    resolve(true);
                };

                request.onerror = () => {
                    console.error('[ModelCache] Error clearing cache');
                    reject(new Error('Failed to clear cache'));
                };
            });
        } catch (error) {
            console.error('[ModelCache] Error clearing cache:', error);
            return false;
        }
    }

    /**
     * 关闭数据库连接
     */
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('[ModelCache] Database closed');
        }
    }
}
