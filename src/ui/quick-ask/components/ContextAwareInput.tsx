import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { App } from 'obsidian';
import { ContextItem } from '../../../types';

interface ContextAwareInputProps {
    app: App;
    placeholder?: string;
    onInput?: (text: string) => void;
    onTrigger?: (query: string, rect: DOMRect | null) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    onSubmit?: () => void;
    className?: string;
    style?: React.CSSProperties;
    initialValue?: string;
}

export interface ContextAwareInputHandle {
    insertItem: (item: ContextItem) => void;
    getText: () => string;
    focus: () => void;
    clear: () => void;
}

export const ContextAwareInput = forwardRef<ContextAwareInputHandle, ContextAwareInputProps>(({
    app,
    placeholder = "输入问题...",
    onInput,
    onTrigger,
    onKeyDown,
    onSubmit,
    className,
    style,
    initialValue = ""
}, ref) => {
    const inputRef = useRef<HTMLDivElement>(null);
    const [isEmpty, setIsEmpty] = useState(!initialValue);

    useImperativeHandle(ref, () => ({
        insertItem: (item: ContextItem) => {
            if (!inputRef.current) return;
            insertTag(item);
            handleInput(); // 触发 input 更新状态
        },
        getText: () => {
             return getContent();
        },
        focus: () => {
            inputRef.current?.focus();
        },
        clear: () => {
            if (inputRef.current) {
                inputRef.current.innerHTML = '';
                handleInput();
            }
        }
    }));

    // 初始化内容
    useEffect(() => {
        if (inputRef.current && initialValue) {
             if (inputRef.current.textContent !== initialValue) {
                 inputRef.current.textContent = initialValue;
                 setIsEmpty(false);
             }
        }
    }, []);

    const getContent = () => {
        if (!inputRef.current) return "";
        let text = "";
        inputRef.current.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                if (el.classList.contains("markdown-next-ai-inline-tag")) {
                    const type = el.getAttribute("data-type");
                    const path = el.getAttribute("data-path");
                    text += `@[${type}:${path}]`;
                } else {
                     text += el.textContent;
                }
            }
        });
        return text;
    };

    const handleInput = () => {
        if (!inputRef.current) return;
        
        const hasText = (inputRef.current.textContent || "").trim().length > 0 || inputRef.current.querySelector('.markdown-next-ai-inline-tag');
        setIsEmpty(!hasText);
        
        if (onInput) onInput(getContent());

        // 检查 @ 触发
        checkTrigger();
    };

    const checkTrigger = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        // 确保 selection 在我们的 input 内
        if (!inputRef.current?.contains(range.commonAncestorContainer)) return;

        const node = range.endContainer;
        const offset = range.endOffset;

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || "";
            // 向前查找 @
            const lastAt = text.lastIndexOf('@', offset - 1);
            if (lastAt !== -1) {
                // 检查 @ 前面是否是空白或行首
                if (lastAt === 0 || /\s/.test(text[lastAt - 1])) {
                    const query = text.substring(lastAt + 1, offset);
                    // 简单的正则，避免包含非法字符（如换行）
                    if (!/[\s\n]/.test(query)) {
                        // 获取 @ 的位置用于定位弹窗
                        const rectRange = document.createRange();
                        rectRange.setStart(node, lastAt);
                        rectRange.setEnd(node, lastAt + 1);
                        const rect = rectRange.getBoundingClientRect();
                        
                        if (onTrigger) onTrigger(query, rect);
                        return;
                    }
                }
            }
        }
        
        if (onTrigger) onTrigger("", null); // 关闭
    };

    const insertTag = (item: ContextItem) => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        // 确保 selection 在我们的 input 内
        if (!inputRef.current?.contains(range.commonAncestorContainer)) return;
        
        const node = range.endContainer;
        const offset = range.endOffset;

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || "";
            const lastAt = text.lastIndexOf('@', offset - 1);
             if (lastAt !== -1) {
                 // 删除 @query
                 range.setStart(node, lastAt);
                 range.setEnd(node, offset);
                 range.deleteContents();
                 
                 // 创建标签
                 const span = document.createElement('span');
                 span.className = 'markdown-next-ai-inline-tag';
                 span.contentEditable = 'false';
                 span.setAttribute('data-type', item.type);
                 span.setAttribute('data-path', item.path);
                 span.textContent = `@${item.name}`;
                 span.style.color = 'var(--interactive-accent)';
                 span.style.background = 'var(--background-modifier-active-hover)';
                 span.style.padding = '0 4px';
                 span.style.borderRadius = '4px';
                 span.style.margin = '0 2px';
                 span.style.fontSize = '0.9em';
                 span.style.display = 'inline-block';
                 
                 range.insertNode(span);
                 
                 // 插入空格
                 const space = document.createTextNode('\u00A0');
                 range.setStartAfter(span);
                 range.insertNode(space);
                 
                 // 移动光标到空格后
                 range.setStartAfter(space);
                 range.collapse(true);
                 
                 selection.removeAllRanges();
                 selection.addRange(range);
                 
                 // 关闭列表
                 if (onTrigger) onTrigger("", null);
             }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (onSubmit) onSubmit();
        }
        if (onKeyDown) onKeyDown(e);
    };

    return (
        <div style={{ position: 'relative', width: '100%', ...style }} className={className}>
            <div
                ref={inputRef}
                contentEditable
                className="markdown-next-ai-editable-input"
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                style={{
                    minHeight: '24px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    outline: 'none',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    padding: '0', 
                    border: 'none',
                    background: 'transparent',
                    fontSize: '13px',
                    lineHeight: '20px',
                    color: 'var(--mn-text, inherit)'
                }}
            />
            {isEmpty && (
                <div 
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        pointerEvents: 'none',
                        color: 'var(--text-muted, rgba(0,0,0,0.38))',
                        fontSize: '13px',
                        lineHeight: '20px',
                        opacity: 0.8
                    }}
                >
                    {placeholder}
                </div>
            )}
        </div>
    );
});
