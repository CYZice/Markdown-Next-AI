import { App, Component, MarkdownRenderer, setIcon } from "obsidian";
import * as React from "react";
import { useEffect, useRef, useState } from "react";

interface SelectedTextDisplayProps {
    app: App;
    selectedText: string;
    isRewriteMode: boolean;
}

export const SelectedTextDisplay: React.FC<SelectedTextDisplayProps> = ({ app, selectedText, isRewriteMode }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!selectedText) return null;

    return (
        <div className="markdown-next-ai-selected-text-wrapper">
            <div className="markdown-next-ai-selected-text-badges">
                <div
                    className={`markdown-next-ai-mentionable-badge ${isExpanded ? 'is-expanded' : ''}`}
                    onClick={() => setIsExpanded(!isExpanded)}
                    title={isExpanded ? "收起" : "展开预览"}
                >
                    <span className="markdown-next-ai-badge-icon">
                        <BadgeIcon />
                    </span>
                    <span className="markdown-next-ai-badge-text">
                        {isRewriteMode ? "待修改内容" : "已选中文本"}
                    </span>
                </div>
            </div>

            {isExpanded && (
                <div className="markdown-next-ai-selected-text-preview-container">
                    <ObsidianMarkdownContent app={app} content={selectedText} />
                </div>
            )}
        </div>
    );
};

const BadgeIcon: React.FC = () => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" x2="8" y1="13" y2="13" />
            <line x1="16" x2="8" y1="17" y2="17" />
            <line x1="10" x2="8" y1="9" y2="9" />
        </svg>
    );
};

const ObsidianMarkdownContent: React.FC<{ app: App; content: string }> = ({ app, content }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.empty();
            const component = new Component();
            MarkdownRenderer.render(app, content, containerRef.current, "/", component);
            return () => component.unload();
        }
    }, [app, content]);

    return <div ref={containerRef} className="markdown-next-ai-markdown-preview"></div>;
};