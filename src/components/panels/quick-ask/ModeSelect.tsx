import { ChevronDown, MessageSquare, Pencil, Zap } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { ModeOption, QuickAskMode } from "../../../types";

export const MODE_OPTIONS: ModeOption[] = [
    {
        value: 'ask',
        labelKey: 'quickAsk.modeAsk',
        labelFallback: 'Ask',
        descKey: 'quickAsk.modeAskDesc',
        descFallback: '有问题尽管问我…',
        icon: <MessageSquare size={14} />,
    },
    {
        value: 'edit',
        labelKey: 'quickAsk.modeEdit',
        labelFallback: 'Edit',
        descKey: 'quickAsk.modeEditDesc',
        descFallback: '描述需求，我将生成 Diff…',
        icon: <Pencil size={14} />,
    },
    {
        value: 'edit-direct',
        labelKey: 'quickAsk.modeEditDirect',
        labelFallback: 'Direct',
        descKey: 'quickAsk.modeEditDirectDesc',
        descFallback: '直接修改文件，无需确认…',
        icon: <Zap size={14} />,
    },
];

interface ModeSelectProps {
    mode: QuickAskMode;
    onChange: (mode: QuickAskMode) => void;
}

export const ModeSelect: React.FC<ModeSelectProps> = ({ mode, onChange }) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [dropdownStyle, setDropdownStyle] = React.useState<React.CSSProperties>({});
    const containerRef = React.useRef<HTMLDivElement>(null);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    const currentOption = MODE_OPTIONS.find(opt => opt.value === mode) || MODE_OPTIONS[1];

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const inContainer = containerRef.current && containerRef.current.contains(target);
            const inDropdown = dropdownRef.current && dropdownRef.current.contains(target);

            if (!inContainer && !inDropdown) {
                setIsOpen(false);
            }
        };

        const handleScroll = () => {
            if (isOpen) setIsOpen(false);
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('scroll', handleScroll, true);
            window.addEventListener('resize', handleScroll);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleScroll);
        };
    }, [isOpen]);

    const handleToggle = () => {
        if (!isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setDropdownStyle({
                position: 'fixed',
                bottom: (window.innerHeight - rect.top + 4) + 'px',
                left: rect.left + 'px',
                width: '140px',
                backgroundColor: 'var(--background-primary)',
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 10000, // High z-index for portal
                padding: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
            });
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    };

    const handleSelect = (value: QuickAskMode) => {
        onChange(value);
        setIsOpen(false);
    };

    return (
        <div className="mn-mode-select-container" ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
            <div
                className={`mn-mode-select-trigger ${isOpen ? 'is-open' : ''}`}
                onClick={handleToggle}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'var(--text-normal)',
                    userSelect: 'none',
                    transition: 'background-color 0.1s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--background-modifier-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <span className="mn-mode-icon" style={{ display: 'flex', alignItems: 'center' }}>{currentOption.icon}</span>
                <span className="mn-mode-label">{currentOption.labelFallback}</span>
                <ChevronDown size={12} style={{ opacity: 0.5 }} />
            </div>

            {isOpen && createPortal(
                <div
                    className="mn-mode-dropdown"
                    ref={dropdownRef}
                    style={dropdownStyle}
                >
                    {MODE_OPTIONS.map((option) => (
                        <div
                            key={option.value}
                            className={`mn-mode-option ${mode === option.value ? 'is-selected' : ''}`}
                            onClick={() => handleSelect(option.value)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                backgroundColor: mode === option.value ? 'var(--background-modifier-active-hover)' : 'transparent',
                                transition: 'background-color 0.1s ease'
                            }}
                            onMouseEnter={(e) => {
                                if (mode !== option.value) e.currentTarget.style.backgroundColor = 'var(--background-modifier-hover)';
                            }}
                            onMouseLeave={(e) => {
                                if (mode !== option.value) e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>{option.icon}</span>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-normal)' }}>{option.labelFallback}</span>
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};
