import { FileText, Pencil, Wand2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { SelectionInfo } from './SelectionManager';

interface SelectionActionsMenuProps {
    selection: SelectionInfo;
    containerEl: HTMLElement;
    indicatorPosition: { left: number; top: number };
    onClose: () => void;
    onAction: (action: string, text: string) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
}

export const SelectionActionsMenu: React.FC<SelectionActionsMenuProps> = ({
    selection,
    containerEl,
    indicatorPosition,
    onClose,
    onAction,
    onMouseEnter,
    onMouseLeave
}) => {
    const [position, setPosition] = useState({ left: 0, top: 0 });

    const updatePosition = useCallback(() => {
        const containerRect = containerEl.getBoundingClientRect();

        // Approximate dimensions
        const menuWidth = 200;
        const menuHeight = 120; // 3 items * ~40px
        const offset = 8;

        // Position relative to indicator
        // Indicator width is 28.
        let left = indicatorPosition.left + 28 + offset;
        let top = indicatorPosition.top;

        // Ensure menu stays within container bounds
        const viewportWidth = containerRect.width;
        const viewportHeight = containerRect.height;

        if (left + menuWidth > viewportWidth - 8) {
            // Position to the left of indicator
            left = indicatorPosition.left - menuWidth - offset;
        }
        if (left < 8) {
            left = 8;
        }

        if (top + menuHeight > viewportHeight - 8) {
            // Flip up
            top = viewportHeight - menuHeight - 8;
        }
        if (top < 8) {
            top = 8;
        }

        setPosition({ left, top });
    }, [containerEl, indicatorPosition]);

    useEffect(() => {
        updatePosition();
    }, [indicatorPosition, updatePosition]);

    const style: React.CSSProperties = {
        position: 'absolute',
        top: `${Math.round(position.top)}px`,
        left: `${Math.round(position.left)}px`,
        // zIndex handled by CSS
    };

    const handleAction = (action: string) => {
        onAction(action, selection.text);
        onClose();
    };

    return (
        <div
            className={`markdown-next-ai-selection-menu visible`}
            style={style}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className="markdown-next-ai-selection-menu-content">
                <button className="markdown-next-ai-selection-menu-item" onClick={() => handleAction('modify')}>
                    <div className="markdown-next-ai-selection-menu-item-icon">
                        <Pencil size={14} />
                    </div>
                    <span className="markdown-next-ai-selection-menu-item-label">Modify</span>
                </button>
                <button className="markdown-next-ai-selection-menu-item" onClick={() => handleAction('explain')}>
                    <div className="markdown-next-ai-selection-menu-item-icon">
                        <FileText size={14} />
                    </div>
                    <span className="markdown-next-ai-selection-menu-item-label">Explain</span>
                </button>
                <button className="markdown-next-ai-selection-menu-item" onClick={() => handleAction('summarize')}>
                    <div className="markdown-next-ai-selection-menu-item-icon">
                        <Wand2 size={14} />
                    </div>
                    <span className="markdown-next-ai-selection-menu-item-label">Summarize</span>
                </button>
            </div>
        </div>
    );
};
