import React, { useEffect, useRef } from 'react';
import { ContextItem } from '../../../types';

interface SuggestionListProps {
    items: ContextItem[];
    selectedIndex: number;
    onSelect: (item: ContextItem) => void;
    position?: { top: number; left: number };
}

export const SuggestionList: React.FC<SuggestionListProps> = ({
    items,
    selectedIndex,
    onSelect,
    position
}) => {
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (listRef.current) {
            const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
            if (selectedEl) {
                selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [selectedIndex]);

    if (!items.length) return null;

    const style: React.CSSProperties = {
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        zIndex: 10002, // 确保在 QuickAskPanel 之上
        maxHeight: '300px',
        overflowY: 'auto',
        background: 'var(--mn-bg, #fff)',
        border: '1px solid var(--mn-border, #e5e7eb)',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        width: '240px',
        padding: '4px 0',
    };

    return (
        <div 
            ref={listRef} 
            className="markdown-next-ai-suggestions-list" 
            style={style}
            onMouseDown={(e) => e.preventDefault()} // 防止失去焦点
        >
            {items.map((item, index) => (
                <div
                    key={`${item.path}-${index}`}
                    data-index={index}
                    className={`markdown-next-ai-suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
                    onClick={() => onSelect(item)}
                    style={{
                        padding: '6px 10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: index === selectedIndex ? 'var(--mn-hover-bg, rgba(0,0,0,0.05))' : 'transparent',
                        fontSize: '13px',
                        color: 'var(--mn-text, inherit)'
                    }}
                >
                    <span className="markdown-next-ai-suggestion-icon" style={{ fontSize: '14px', flexShrink: 0 }}>{item.icon}</span>
                    <div className="markdown-next-ai-suggestion-content" style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                        <div className="markdown-next-ai-suggestion-name" style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                        {item.path && <div className="markdown-next-ai-suggestion-path" style={{ fontSize: '11px', color: 'var(--text-muted, #888)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.path}</div>}
                    </div>
                </div>
            ))}
        </div>
    );
};
