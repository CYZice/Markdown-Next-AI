import { useState, useCallback } from 'react';
import { Notice } from 'obsidian';
import { ImageData } from '../../../types';
import { IMAGE_CONSTANTS } from '../../../constants';

export const useImageUploader = () => {
    const [images, setImages] = useState<ImageData[]>([]);

    const addImage = useCallback((file: File) => {
        if (!IMAGE_CONSTANTS.ALLOWED_TYPES.includes(file.type)) {
            new Notice("不支持的文件类型: " + file.type);
            return;
        }
        if (file.size > IMAGE_CONSTANTS.MAX_FILE_SIZE) {
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
            setImages(prev => [...prev, imageData]);
        };
        reader.onerror = () => {
            new Notice("读取图片失败");
        };
        reader.readAsDataURL(file);
    }, []);

    const handlePaste = useCallback((event: React.ClipboardEvent) => {
        const items = event.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.indexOf("image") !== -1) {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    addImage(file);
                }
                break;
            }
        }
    }, [addImage]);

    const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;

        for (let i = 0; i < files.length; i++) {
            addImage(files[i]);
        }
        // 重置 input value，允许重复选择同一文件
        event.target.value = '';
    }, [addImage]);

    const removeImage = useCallback((index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    }, []);

    const clearImages = useCallback(() => {
        setImages([]);
    }, []);

    return {
        images,
        handlePaste,
        handleFileSelect,
        removeImage,
        clearImages
    };
};
