import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { SelectionActionsMenu } from './SelectionActionsMenu';
import { SelectionIndicator } from './SelectionIndicator';
import { SelectionInfo, SelectionManager } from './SelectionManager';

export class SelectionChatWidget {
    private root: Root | null = null;
    private container: HTMLElement;

    constructor(private selectionManager: SelectionManager, private onAction: (action: string, text: string) => void) {
        this.container = document.createElement('div');
        this.container.id = 'markdown-next-ai-selection-root';
        // Hide the root container since we use Portal to render elsewhere
        this.container.style.display = 'none';
        document.body.appendChild(this.container);

        this.root = createRoot(this.container);
        this.root.render(<SelectionWidgetCore manager={selectionManager} onAction={onAction} />);
    }

    destroy() {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        this.container.remove();
    }
}

const SelectionWidgetCore: React.FC<{ manager: SelectionManager, onAction: (action: string, text: string) => void }> = ({ manager, onAction }) => {
    const [selection, setSelection] = useState<SelectionInfo | null>(null);
    const [mode, setMode] = useState<'hidden' | 'indicator' | 'menu'>('hidden');
    const [indicatorPosition, setIndicatorPosition] = useState({ left: 0, top: 0 });

    const showTimeoutRef = useRef<NodeJS.Timeout>();
    const hideTimeoutRef = useRef<NodeJS.Timeout>();

    useEffect(() => {
        return manager.subscribe((info) => {
            setSelection(info);
            if (!info) {
                setMode('hidden');
            } else {
                // Whenever selection updates, reset to indicator
                setMode('indicator');
            }
        });
    }, [manager]);

    // Calculate indicator position for menu positioning
    useEffect(() => {
        if (selection && selection.view) {
            const { rect, view } = selection;
            const containerRect = view.containerEl.getBoundingClientRect();
            const offset = 8;

            // Default to LTR for now
            const left = rect.right - containerRect.left + offset;
            const top = rect.bottom - containerRect.top + offset;

            setIndicatorPosition({ left, top });
        }
    }, [selection]);

    const handleIndicatorEnter = () => {
        // Clear any pending hide timer (e.g. if we moved from menu back to indicator quickly?)
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);

        // Schedule showing the menu
        showTimeoutRef.current = setTimeout(() => {
            setMode('menu');
        }, 150);
    };

    const handleIndicatorLeave = () => {
        // If we leave the indicator before the menu shows, cancel the show timer
        if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
    };

    const handleMenuEnter = () => {
        // If we are in the menu, we want to stay there. Clear any hide timer.
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };

    const handleMenuLeave = () => {
        // If we leave the menu, schedule hiding it (going back to indicator)
        hideTimeoutRef.current = setTimeout(() => {
            setMode('indicator');
        }, 300);
    };

    if (!selection || mode === 'hidden' || !selection.view) return null;

    const content = (
        <>
            {mode === 'indicator' && (
                <SelectionIndicator
                    selection={selection}
                    containerEl={selection.view.containerEl}
                    onMouseEnter={handleIndicatorEnter}
                    onMouseLeave={handleIndicatorLeave}
                    onClick={() => setMode('menu')}
                />
            )}
            {mode === 'menu' && (
                <SelectionActionsMenu
                    selection={selection}
                    containerEl={selection.view.containerEl}
                    indicatorPosition={indicatorPosition}
                    onClose={() => setMode('indicator')}
                    onAction={onAction}
                    onMouseEnter={handleMenuEnter}
                    onMouseLeave={handleMenuLeave}
                />
            )}
        </>
    );

    // Use portal to render inside the view's container
    // This allows absolute positioning relative to the view container
    return createPortal(content, selection.view.containerEl);
};
