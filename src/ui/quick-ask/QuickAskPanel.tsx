import { App } from 'obsidian';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ImageData } from '../../types';
import { ContextAwareInput, ContextAwareInputHandle } from './components/ContextAwareInput';
import { ImageAttachment } from './components/ImageAttachment';
import { SuggestionList } from './components/SuggestionList';
import { useContextSearch } from './hooks/useContextSearch';
import { useImageUploader } from './hooks/useImageUploader';

type Message = { role: 'user' | 'assistant'; text: string }

export type QuickAskPanelHandle = {
  addUserMessage: (text: string) => void
  startAssistantMessage: () => void
  updateAssistantMessage: (text: string) => void
  finishAssistantMessage: () => void
}

export function getAutoScrollHandlers(ref: React.RefObject<HTMLDivElement>) {
  const shouldAutoScrollRef = { current: true }
  const userDisabledAutoScrollRef = { current: false }
  const lastScrollTopRef = { current: 0 }
  const handleScroll = () => {
    const el = ref.current
    if (!el) return
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const isNearBottom = distanceToBottom < 100
    const currentScrollTop = el.scrollTop
    const scrolledUp = currentScrollTop < lastScrollTopRef.current
    lastScrollTopRef.current = currentScrollTop
    if (scrolledUp) {
      userDisabledAutoScrollRef.current = true
      shouldAutoScrollRef.current = false
      return
    }
    if (userDisabledAutoScrollRef.current) {
      if (isNearBottom) {
        userDisabledAutoScrollRef.current = false
        shouldAutoScrollRef.current = true
      }
      return
    }
    shouldAutoScrollRef.current = isNearBottom
  }
  const disableAutoScroll = () => {
    shouldAutoScrollRef.current = false
    userDisabledAutoScrollRef.current = true
  }
  return { shouldAutoScrollRef, handleScroll, disableAutoScroll }
}

export const QuickAskPanel = forwardRef<QuickAskPanelHandle, {
  app: App
  initialText: string
  modelName: string
  onSubmit: (prompt: string, images: ImageData[]) => void
  onClose: () => void
  onModelClick: (e: React.MouseEvent) => void
}>(({ app, initialText, modelName, onSubmit, onClose, onModelClick }, ref) => {
  const [messages, setMessages] = useState<Message[]>([])
  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<ContextAwareInputHandle>(null)
  const { shouldAutoScrollRef, handleScroll, disableAutoScroll } = getAutoScrollHandlers(chatRef)

  // Suggestion State
  const [suggestionState, setSuggestionState] = useState<{
    isOpen: boolean;
    query: string;
    rect: DOMRect | null;
  }>({ isOpen: false, query: "", rect: null });
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Hooks
  const { items: suggestionItems, search: searchContext } = useContextSearch(app);
  const { images, handlePaste, handleFileSelect, removeImage, clearImages } = useImageUploader();

  useImperativeHandle(ref, () => ({
    addUserMessage(text: string) {
      setMessages(prev => [...prev, { role: 'user', text }])
    },
    startAssistantMessage() {
      setMessages(prev => [...prev, { role: 'assistant', text: '正在思考中...' }])
    },
    updateAssistantMessage(text: string) {
      setMessages(prev => {
        if (prev.length === 0) return [{ role: 'assistant', text }]
        const last = prev[prev.length - 1]
        if (last.role !== 'assistant') return [...prev, { role: 'assistant', text }]
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', text }
        return updated
      })
    },
    finishAssistantMessage() {
    },
  }))

  useEffect(() => {
    const el = chatRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll)
    el.addEventListener('wheel', disableAutoScroll, { passive: true } as any)
    el.addEventListener('touchstart', disableAutoScroll, { passive: true } as any)
    el.addEventListener('pointerdown', disableAutoScroll)
    return () => {
      el.removeEventListener('scroll', handleScroll)
      el.removeEventListener('wheel', disableAutoScroll)
      el.removeEventListener('touchstart', disableAutoScroll)
      el.removeEventListener('pointerdown', disableAutoScroll)
    }
  }, [messages.length])

  useEffect(() => {
    const el = chatRef.current
    if (el && shouldAutoScrollRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Context Search Effect
  useEffect(() => {
    if (suggestionState.isOpen) {
      searchContext(suggestionState.query);
      setSelectedIndex(0);
    }
  }, [suggestionState.query, suggestionState.isOpen, searchContext]);

  const handleSubmit = () => {
    const text = inputRef.current?.getText().trim()
    if (!text && images.length === 0) return

    // Add user message to UI immediately? 
    // Usually Overlay handles this via ref.addUserMessage, but we can do it here too if needed.
    // However, existing logic seems to rely on Overlay calling back.
    // Wait, QuickAskOverlay calls `this.addChatMessage` which calls `panelRef.addUserMessage`.
    // So we just clear input here.

    inputRef.current?.clear();
    clearImages();
    onSubmit(text || "", images);
  }

  const handleInputTrigger = (query: string, rect: DOMRect | null) => {
    if (rect) {
      setSuggestionState({ isOpen: true, query, rect });
    } else {
      setSuggestionState({ isOpen: false, query: "", rect: null });
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (suggestionState.isOpen && suggestionItems.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(suggestionItems.length - 1, prev + 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = suggestionItems[selectedIndex];
        if (item) {
          inputRef.current?.insertItem(item);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestionState({ isOpen: false, query: "", rect: null });
      }
    }
  };

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }} onPaste={handlePaste}>
      {/* Header / Input Area */}
      <div style={{ width: '100%', boxSizing: 'border-box' }}>
        <div className="markdown-next-ai-react-handle" style={{ width: 56, height: 4, borderRadius: 2, background: 'var(--mn-border,#e5e7eb)', opacity: 0.8, margin: '6px auto' }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '2px 10px 0 6px', width: '100%', boxSizing: 'border-box' }}>
          <ContextAwareInput
            ref={inputRef}
            app={app}
            initialValue={initialText}
            onTrigger={handleInputTrigger}
            onKeyDown={handleInputKeyDown}
            onSubmit={handleSubmit}
            style={{ flex: 1 }}
          />
          <button onClick={onClose} title="关闭" style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', marginTop: 0 }}>✕</button>
        </div>
      </div>

      {/* Suggestion List */}
      {suggestionState.isOpen && suggestionState.rect && (
        <SuggestionList
          items={suggestionItems}
          selectedIndex={selectedIndex}
          onSelect={(item) => inputRef.current?.insertItem(item)}
          position={{
            top: suggestionState.rect.bottom + 4, // 稍微向下一点
            left: suggestionState.rect.left
          }}
        />
      )}

      {/* Image Previews */}
      <ImageAttachment images={images} onRemove={removeImage} />

      {/* Chat Area */}
      <div style={{ padding: '0' }}>
        <div ref={chatRef} style={{ padding: '6px 10px', maxHeight: 240, overflow: 'auto', boxSizing: 'border-box' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ margin: '6px 0', padding: '6px 8px', border: '0.5px solid var(--mn-border,#e5e7eb)', borderRadius: 6, background: m.role === 'user' ? 'rgba(134,48,151,0.06)' : 'var(--mn-bg,#fff)', fontSize: 13, lineHeight: 1.6 }}>{m.text}</div>
          ))}
        </div>

        {/* Footer / Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={onModelClick} title="选择模型" style={{ border: 'none', background: 'transparent', height: 24, lineHeight: '24px', fontSize: 13, padding: 0, cursor: 'pointer', color: 'inherit' }}>{modelName}</button>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="file"
                accept={images.length > 0 ? "image/*" : "image/*"} // 可以优化
                multiple
                style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', left: 0, top: 0 }}
                onChange={handleFileSelect}
              />
              <button title="上传图片" style={{ border: 'none', background: 'transparent', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" /><line x1="16" x2="22" y1="5" y2="5" /><line x1="19" x2="19" y1="2" y2="8" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
              </button>
            </div>
          </div>
          <button onClick={handleSubmit} title="发送" style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer' }}>➤</button>
        </div>
      </div>

      {/* Resize Handles */}
      <div className="markdown-next-ai-react-resize-right" style={{ position: 'absolute', top: '50%', right: '-3px', width: 6, height: 40, borderRadius: 3, background: 'var(--mn-border,#e5e7eb)', transform: 'translateY(-50%)', cursor: 'ew-resize' }} />
      <div className="markdown-next-ai-react-resize-bottom" style={{ position: 'absolute', left: '50%', bottom: '-3px', width: 40, height: 6, borderRadius: 3, background: 'var(--mn-border,#e5e7eb)', transform: 'translateX(-50%)', cursor: 'ns-resize' }} />
      <div className="markdown-next-ai-react-resize-bottom-right" style={{ position: 'absolute', right: '-3px', bottom: '-3px', width: 12, height: 12, borderRadius: 3, background: 'var(--mn-border,#e5e7eb)', cursor: 'nwse-resize' }} />
    </div>
  )
})
