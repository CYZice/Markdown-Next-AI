import { Sparkles } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { SelectionInfo } from './SelectionManager';

interface SelectionIndicatorProps {
    selection: SelectionInfo;
    containerEl: HTMLElement;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onClick?: (e: React.MouseEvent) => void;
}

export const SelectionIndicator: React.FC<SelectionIndicatorProps> = ({
    selection,
    containerEl,
    onMouseEnter,
    onMouseLeave,
    onClick
}) => {
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const offset = 8;

    const updatePosition = useCallback(() => {
        const { rect } = selection;
        const containerRect = containerEl.getBoundingClientRect();

        // Position to the right of the selection (LTR)
        let left = rect.right - containerRect.left + offset;
        let top = rect.bottom - containerRect.top + offset;

        // Ensure the indicator stays within container bounds
        const viewportWidth = containerRect.width;
        const viewportHeight = containerRect.height;
        const indicatorWidth = 28;
        const indicatorHeight = 28;

        if (left + indicatorWidth > viewportWidth - 8) {
            // If too far right, move it inside or to the left?
            // YOLO logic: left = viewportWidth - indicatorWidth - 8
            left = viewportWidth - indicatorWidth - 8;
        }
        if (left < 8) {
            left = 8;
        }

        // Boundary check for bottom
        if (top + indicatorHeight > viewportHeight - 8) {
            // Flip to top
            top = rect.top - containerRect.top - indicatorHeight - offset;
        }
        if (top < 8) {
            top = 8;
        }

        setPosition({ left, top });
    }, [containerEl, selection]);

    useEffect(() => {
        updatePosition();
    }, [selection, updatePosition]);

    const style: React.CSSProperties = {
        position: 'absolute',
        top: `${Math.round(position.top)}px`,
        left: `${Math.round(position.left)}px`,
        // zIndex is handled by CSS (or we can set it here to match existing usage if needed, but CSS has it)
    };

    return (
        <div
            className={`markdown-next-ai-selection-indicator visible`}
            style={style}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onClick={onClick}
        >
            <Sparkles size={14} />
        </div>
    );
};
