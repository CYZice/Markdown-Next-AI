/**
 * External Module Loader
 * 运行时动态加载外部库，避免打包
 * 支持从 CDN 加载 transformers.js
 */

/**
 * 外部模块加载器
 * 在运行时动态从 CDN 加载库，不打包进插件
 */
export class ExternalModuleLoader {
    private static loadedModules: Map<string, any> = new Map();
    private static loadingPromises: Map<string, Promise<any>> = new Map();

    /**
     * 加载 transformers.js 库
     * 从 Hugging Face CDN 加载，避免打包
     */
    static async loadTransformers(): Promise<any> {
        const key = 'transformers';

        // 检查已加载的模块
        if (this.loadedModules.has(key)) {
            return this.loadedModules.get(key);
        }

        // 检查是否正在加载
        if (this.loadingPromises.has(key)) {
            return this.loadingPromises.get(key);
        }

        // 开始加载
        const loadPromise = this._loadTransformersFromCDN();
        this.loadingPromises.set(key, loadPromise);

        try {
            const module = await loadPromise;
            this.loadedModules.set(key, module);
            return module;
        } finally {
            this.loadingPromises.delete(key);
        }
    }

    /**
     * 动态加载 Transformers.js 库
     * 从 Hugging Face CDN 加载，避免打包
     */
    private static async _loadTransformersFromCDN(): Promise<any> {
        try {
            console.log('[ExternalLoader] Loading transformers.js from CDN...');

            // 通过 script 标签加载（推荐方式，避免 eval）
            const transformers = await this._loadViaScript(
                'https://cdn-allow-origin.huggingface.co/transformers.js@3/dist/transformers.min.js'
            );

            console.log('[ExternalLoader] Transformers.js loaded successfully');
            return transformers;
        } catch (error) {
            console.error('[ExternalLoader] Failed to load transformers.js from CDN:', error);
            // 降级方案：尝试使用 unpkg CDN
            return this._loadTransformersFromUnpkg();
        }
    }

    /**
     * 从 unpkg CDN 加载（备选方案）
     */
    private static async _loadTransformersFromUnpkg(): Promise<any> {
        try {
            console.log('[ExternalLoader] Trying unpkg CDN as fallback...');

            const transformers = await this._loadViaScript(
                'https://unpkg.com/@xenova/transformers@3/dist/transformers.min.js'
            );

            console.log('[ExternalLoader] Transformers.js loaded from unpkg');
            return transformers;
        } catch (error) {
            console.error('[ExternalLoader] Failed to load from unpkg:', error);
            throw new Error(
                'Failed to load transformers.js from all CDN sources. ' +
                'Please check your internet connection.'
            );
        }
    }

    /**
     * 通过 script 标签加载外部库
     * 避免使用 eval，更安全且兼容性更好
     */
    private static _loadViaScript(url: string): Promise<any> {
        return new Promise((resolve, reject) => {
            // 检查全局作用域是否已加载
            const globalVar = (window as any).transformers;
            if (globalVar) {
                console.log('[ExternalLoader] Transformers already loaded in global scope');
                resolve(globalVar);
                return;
            }

            // 创建 script 标签
            const script = document.createElement('script');
            script.src = url;
            script.type = 'text/javascript';
            script.async = true;

            script.onload = () => {
                const loaded = (window as any).transformers;
                if (loaded) {
                    console.log(`[ExternalLoader] Successfully loaded from ${url}`);
                    resolve(loaded);
                } else {
                    reject(new Error(`Transformers not found in global scope after loading ${url}`));
                }
            };

            script.onerror = () => {
                reject(new Error(`Failed to load script from ${url}`));
            };

            // 设置 crossorigin 属性以支持 CORS
            script.setAttribute('crossorigin', 'anonymous');

            // 添加到 DOM
            document.head.appendChild(script);
        });
    }

    /**
     * 使用全局脚本标签加载（备选方案）
     * 某些情况下 dynamic import 可能不工作
     */
    static async loadTransformersViaScript(): Promise<any> {
        return this._loadViaScript(
            'https://cdn-allow-origin.huggingface.co/transformers.js@3/dist/transformers.min.js'
        );
    }

    /**
     * 清除已加载的模块
     */
    static clearModuleCache(moduleName?: string): void {
        if (moduleName) {
            this.loadedModules.delete(moduleName);
            console.log(`[ExternalLoader] Module cache cleared for: ${moduleName}`);
        } else {
            this.loadedModules.clear();
            console.log('[ExternalLoader] All module caches cleared');
        }
    }

    /**
     * 获取模块加载状态
     */
    static getModuleStatus(moduleName: string): 'loaded' | 'loading' | 'not-loaded' {
        if (this.loadedModules.has(moduleName)) {
            return 'loaded';
        }
        if (this.loadingPromises.has(moduleName)) {
            return 'loading';
        }
        return 'not-loaded';
    }
}
