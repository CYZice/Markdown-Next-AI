import { Notice } from "obsidian";
import { IMAGE_CONSTANTS } from "../constants";
import type { ImageData } from "../types";

/**
 * 图片处理器类
 * 负责处理图片的粘贴、选择、预览等功能
 */
export class ImageHandler {
    private images: ImageData[] = [];
    private maxFileSize: number = IMAGE_CONSTANTS.MAX_FILE_SIZE;
    private allowedTypes: readonly string[] = IMAGE_CONSTANTS.ALLOWED_TYPES;

    /**
     * 处理粘贴事件中的图片
     */
    handlePaste(event: ClipboardEvent, callback?: (imageData: ImageData) => void): void {
        const items = event.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.indexOf("image") !== -1) {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    this.processImageFile(file, callback);
                }
                break;
            }
        }
    }

    /**
     * 处理文件选择
     */
    handleFileSelect(files: FileList, callback?: (imageData: ImageData) => void): void {
        for (const file of Array.from(files)) {
            if (this.allowedTypes.includes(file.type)) {
                this.processImageFile(file, callback);
            } else {
                new Notice("不支持的文件类型: " + file.type);
            }
        }
    }

    /**
     * 处理图片文件
     */
    processImageFile(file: File, callback?: (imageData: ImageData) => void): void {
        if (file.size > this.maxFileSize) {
            new Notice("图片文件过大，请选择小于10MB的图片");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            const imageData: ImageData = {
                id: String(Date.now() + Math.random()),
                name: file.name,
                size: file.size,
                type: file.type,
                base64: result,
                url: result
            };
            this.images.push(imageData);
            if (callback) callback(imageData);
        };
        reader.onerror = () => {
            new Notice("读取图片失败");
        };
        reader.readAsDataURL(file);
    }

    /**
     * 移除图片
     */
    removeImage(id: string, callback?: (id: string) => void): void {
        this.images = this.images.filter(img => img.id !== id);
        if (callback) callback(id);
    }

    /**
     * 获取所有图片
     */
    getImages(): ImageData[] {
        return this.images;
    }

    /**
     * 添加图片
     */
    addImage(imageData: ImageData): void {
        this.images.push(imageData);
    }

    /**
     * 清空所有图片
     */
    clear(): void {
        this.images = [];
    }

    /**
     * 创建图片预览元素
     */
    clearImages(): void {
        this.images = [];
    }

    /**
     * 创建图片预览元素
     */
    createImagePreview(imageData: ImageData, onRemove?: () => void): HTMLElement {
        const previewEl = document.createElement("div");
        previewEl.className = "markdown-next-ai-image-preview";
        previewEl.setAttribute("data-image-id", String(imageData.id));
        previewEl.innerHTML = `
            <div class="markdown-next-ai-image-container">
                <img src="${imageData.url}" alt="${imageData.name}" class="markdown-next-ai-preview-img">
                <button class="markdown-next-ai-remove-image" title="删除图片">✕</button>
            </div>
        `;

        const removeBtn = previewEl.querySelector(".markdown-next-ai-remove-image") as HTMLButtonElement;
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            this.removeImage(String(imageData.id), () => {
                if (onRemove) onRemove();
            });
            previewEl.remove();
        };

        return previewEl;
    }

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes: number): string {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
}
