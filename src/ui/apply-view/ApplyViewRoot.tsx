import {
  Ban,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CopyPlus,
  MoreVertical,
  Undo2,
  X,
} from 'lucide-react'
import { App, MarkdownView, Menu, TFile } from 'obsidian'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { computeCharDiff, createDiffBlocks, DiffBlock } from '../../utils/diff'

export type ApplyViewState = {
  file: TFile
  originalContent: string
  newContent: string
}

type BlockDecision = 'pending' | 'incoming' | 'current' | 'both'

export default function ApplyViewRoot({
  state,
  app,
  close,
}: {
  state: ApplyViewState
  app: App
  close: (shouldDetach?: boolean) => void
}) {
  const [currentDiffIndex, setCurrentDiffIndex] = useState(0)
  const [isCompact, setIsCompact] = useState(false)
  const diffBlockRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollerRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  const t = (key: string, fallback: string) => fallback

  useEffect(() => {
    if (!headerRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < 600)
      }
    })
    ro.observe(headerRef.current)
    return () => ro.disconnect()
  }, [])

  const diff = useMemo(() => {
    try {
      return createDiffBlocks(state.originalContent, state.newContent)
    } catch (e) {
      console.error('[markdown-next-ai] diff failed, using fallback:', e)
      if (state.originalContent === state.newContent) {
        return state.originalContent
          ? [{ type: 'unchanged', value: state.originalContent }]
          : []
      }
      return [
        {
          type: 'modified',
          originalValue:
            state.originalContent && state.originalContent.length > 0
              ? state.originalContent
              : undefined,
          modifiedValue:
            state.newContent && state.newContent.length > 0
              ? state.newContent
              : undefined,
        },
      ]
    }
  }, [state.newContent, state.originalContent])

  const [decisions, setDecisions] = useState<Map<number, BlockDecision>>(
    () => new Map(),
  )

  const modifiedBlockIndices = useMemo(
    () =>
      diff.reduce<number[]>((acc, block, index) => {
        if (block.type !== 'unchanged') {
          acc.push(index)
        }
        return acc
      }, []),
    [diff],
  )

  const decidedCount = useMemo(
    () =>
      modifiedBlockIndices.filter(
        (idx) => decisions.get(idx) && decisions.get(idx) !== 'pending',
      ).length,
    [decisions, modifiedBlockIndices],
  )
  const progressPercent = modifiedBlockIndices.length
    ? Math.round((decidedCount / modifiedBlockIndices.length) * 100)
    : 0
  const isAllDecided =
    modifiedBlockIndices.length > 0 &&
    decidedCount === modifiedBlockIndices.length

  const hasChanges = modifiedBlockIndices.length > 0

  const scrollToDiffBlock = useCallback(
    (index: number) => {
      if (index >= 0 && index < modifiedBlockIndices.length) {
        const element = diffBlockRefs.current[modifiedBlockIndices[index]]
        if (element) {
          element.scrollIntoView({ block: 'center', behavior: 'smooth' })
          setCurrentDiffIndex(index)
        }
      }
    },
    [modifiedBlockIndices],
  )

  const scrollToNextUndecided = useCallback(() => {
    if (modifiedBlockIndices.length === 0) return

    const start = (currentDiffIndex + 1) % modifiedBlockIndices.length
    for (let offset = 0; offset < modifiedBlockIndices.length; offset++) {
      const i = (start + offset) % modifiedBlockIndices.length
      const idx = modifiedBlockIndices[i]
      const decision = decisions.get(idx)
      if (!decision || decision === 'pending') {
        scrollToDiffBlock(i)
        return
      }
    }
  }, [
    currentDiffIndex,
    decisions,
    modifiedBlockIndices,
    scrollToDiffBlock,
  ])

  const generateFinalContent = useCallback(
    (defaultDecision: 'incoming' | 'current' = 'current') => {
      return diff
        .map((block, index) => {
          if (block.type === 'unchanged') return block.value
          const original = block.originalValue ?? ''
          const incoming = block.modifiedValue ?? ''
          const decision = decisions.get(index) ?? defaultDecision

          switch (decision) {
            case 'incoming':
              return incoming || original
            case 'current':
            case 'pending':
              return decision === 'pending' && defaultDecision === 'incoming'
                ? incoming || original
                : original
            case 'both':
              return [original, incoming].filter(Boolean).join('\n')
            default:
              return original
          }
        })
        .join('\n')
    },
    [diff, decisions],
  )

  const generateKeepInsertContent = useCallback(() => {
    return diff
      .map((block, index) => {
        if (block.type === 'unchanged') return block.value

        const original = block.originalValue ?? ''
        const incoming = block.modifiedValue ?? ''
        const decision = decisions.get(index) ?? 'both'

        if (decision === 'current') return original
        if (decision === 'incoming') return incoming || original
        return [original, incoming].filter(Boolean).join('\n')
      })
      .join('\n')
  }, [decisions, diff])

  const focusTargetLeaf = async () => {
    const targetLeaf = app.workspace
      .getLeavesOfType('markdown')
      .find((leaf) => {
        const view = leaf.view
        return (
          view instanceof MarkdownView && view.file?.path === state.file.path
        )
      })

    if (targetLeaf) {
      app.workspace.setActiveLeaf(targetLeaf, { focus: true })
      return
    }

    const leaf = app.workspace.getLeaf(true)
    await leaf.openFile(state.file)
    app.workspace.setActiveLeaf(leaf, { focus: true })
  }

  const applyAndClose = async () => {
    const newContent = generateFinalContent('incoming')
    await app.vault.modify(state.file, newContent)

    close(true)
    await focusTargetLeaf()
  }

  const keepInsertAndClose = async () => {
    const newContent = generateKeepInsertContent()
    await app.vault.modify(state.file, newContent)
    close(true)
    await focusTargetLeaf()
  }

  const makeDecision = useCallback(
    (index: number, decision: BlockDecision) => {
      setDecisions((prev) => {
        const next = new Map(prev)
        next.set(index, decision)
        return next
      })

      window.setTimeout(() => {
        scrollToNextUndecided()
      }, 100)
    },
    [scrollToNextUndecided],
  )

  const undoDecision = useCallback((index: number) => {
    setDecisions((prev) => {
      const next = new Map(prev)
      next.delete(index)
      return next
    })
  }, [])

  const acceptAll = useCallback(() => {
    setDecisions(() => {
      const next = new Map<number, BlockDecision>()
      modifiedBlockIndices.forEach((index) => {
        next.set(index, 'incoming')
      })
      return next
    })
  }, [modifiedBlockIndices])

  const rejectAll = useCallback(() => {
    setDecisions(() => {
      const next = new Map<number, BlockDecision>()
      modifiedBlockIndices.forEach((index) => {
        next.set(index, 'current')
      })
      return next
    })
  }, [modifiedBlockIndices])

  const showMoreMenu = useCallback(
    (e: React.MouseEvent) => {
      const menu = new Menu()

      menu.addItem((item) => {
        item
          .setTitle(t('applyView.acceptAll', 'Accept All'))
          .setIcon('check-check')
          .onClick(acceptAll)
          .setDisabled(!hasChanges)
      })

      menu.addItem((item) => {
        item
          .setTitle(t('applyView.rejectAll', 'Reject All'))
          .setIcon('ban')
          .onClick(rejectAll)
          .setDisabled(!hasChanges)
      })

      menu.addSeparator()

      menu.addItem((item) => {
        item
          .setTitle(t('applyView.keepInsert', 'Keep & Insert'))
          .setIcon('copy-plus')
          .onClick(() => void keepInsertAndClose())
          .setDisabled(!hasChanges)
      })

      menu.showAtMouseEvent(e.nativeEvent)
    },
    [acceptAll, rejectAll, keepInsertAndClose, hasChanges, t],
  )

  const navigate = useCallback(
    (direction: 'prev' | 'next') => {
      if (modifiedBlockIndices.length === 0) return
      const nextIndex =
        direction === 'next'
          ? (currentDiffIndex + 1) % modifiedBlockIndices.length
          : (currentDiffIndex - 1 + modifiedBlockIndices.length) %
          modifiedBlockIndices.length

      scrollToDiffBlock(nextIndex)
    },
    [currentDiffIndex, modifiedBlockIndices, scrollToDiffBlock],
  )

  const renderDiffContent = (block: DiffBlock, index: number) => {
    if (block.type === 'unchanged') {
      return (
        <div
          className="markdown-next-ai-diff-unchanged"
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--font-monospace)',
            opacity: 0.6,
            padding: '4px 8px',
          }}
        >
          {block.value}
        </div>
      )
    }

    const decision = decisions.get(index) || 'pending'
    const isCurrent = currentDiffIndex === modifiedBlockIndices.indexOf(index)
    const charDiffs = computeCharDiff(
      block.originalValue || '',
      block.modifiedValue || '',
    )

    const decisionMeta: Record<
      Exclude<BlockDecision, 'pending'>,
      { label: string; rgb: string }
    > = {
      incoming: { label: 'Accepted incoming', rgb: 'var(--color-green-rgb)' },
      current: { label: 'Kept current', rgb: 'var(--color-red-rgb)' },
      both: { label: 'Keep & Insert', rgb: 'var(--color-orange-rgb, 217, 119, 6)' },
    }

    const getDecidedPreview = (): string => {
      const original = block.originalValue ?? ''
      const incoming = block.modifiedValue ?? ''
      if (decision === 'incoming') return incoming || original
      if (decision === 'current') return original
      if (decision === 'both') return [original, incoming].filter(Boolean).join('\n')
      return ''
    }

    return (
      <div
        ref={(el) => {
          diffBlockRefs.current[index] = el
        }}
        className={`markdown-next-ai-diff-block ${decision} ${isCurrent ? 'focused' : ''}`}
        style={{
          position: 'relative',
          margin: '28px 0 12px 0',
          overflow: 'visible',
        }}
        onClick={() => setCurrentDiffIndex(modifiedBlockIndices.indexOf(index))}
      >
        <div
          className="markdown-next-ai-diff-block-actions"
          onClick={(e) => e.stopPropagation()}
        >
          {decision === 'pending' ? (
            <>
              <button
                onClick={() => makeDecision(index, 'incoming')}
                title={t('applyView.acceptIncoming', 'Accept incoming')}
                className="markdown-next-ai-diff-action markdown-next-ai-accept"
              >
                <Check size={16} />
                <span>Accept</span>
              </button>
              <button
                onClick={() => makeDecision(index, 'both')}
                title={t('applyView.keepInsert', 'Keep original and insert generated')}
                className="markdown-next-ai-diff-action markdown-next-ai-merge"
              >
                <CopyPlus size={16} />
                <span>Keep &amp; Insert</span>
              </button>
              <button
                onClick={() => makeDecision(index, 'current')}
                title={t('applyView.keepCurrent', 'Keep current')}
                className="markdown-next-ai-diff-action markdown-next-ai-exclude"
              >
                <X size={16} />
                <span>Reject</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => undoDecision(index)}
              title={t('applyView.undo', 'Undo')}
              className="markdown-next-ai-diff-action markdown-next-ai-diff-action-neutral"
            >
              <Undo2 size={16} />
              <span>Undo</span>
            </button>
          )}
        </div>
        <div
          className="markdown-next-ai-diff-block-frame"
          style={{
            border: '1px solid var(--background-modifier-border)',
            borderRadius: '6px',
            overflow: 'hidden',
            backgroundColor: 'var(--background-primary)',
          }}
        >
          <div
            className="markdown-next-ai-diff-content"
            style={{
              padding: '12px',
              overflowX: 'auto',
              fontFamily: 'var(--font-monospace)',
            }}
          >
            {decision === 'pending' ? (
              <>
                {block.originalValue !== undefined && (
                  <div
                    className="markdown-next-ai-diff-line original"
                    style={{
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text-muted)',
                      textDecoration: 'line-through',
                      opacity: 0.7,
                      marginBottom: block.modifiedValue ? '4px' : '0',
                    }}
                  >
                    {charDiffs.map((part, i) => (
                      <span
                        key={i}
                        className={`diff-char ${part.type === 'removed' ? 'removed' : ''} ${part.type === 'added' ? 'hidden' : ''}`}
                        style={{
                          backgroundColor:
                            part.type === 'removed'
                              ? 'rgba(var(--color-red-rgb), 0.2)'
                              : 'transparent',
                          display: part.type === 'added' ? 'none' : 'inline',
                        }}
                      >
                        {part.value}
                      </span>
                    ))}
                  </div>
                )}
                {block.modifiedValue !== undefined && (
                  <div
                    className="markdown-next-ai-diff-line modified"
                    style={{
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text-normal)',
                    }}
                  >
                    {charDiffs.map((part, i) => (
                      <span
                        key={i}
                        className={`diff-char ${part.type === 'added' ? 'added' : ''} ${part.type === 'removed' ? 'hidden' : ''}`}
                        style={{
                          backgroundColor:
                            part.type === 'added'
                              ? 'rgba(var(--color-green-rgb), 0.2)'
                              : 'transparent',
                          display: part.type === 'removed' ? 'none' : 'inline',
                        }}
                      >
                        {part.value}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="markdown-next-ai-decision-header">
                  <div className="markdown-next-ai-decision-info">
                    <span
                      className="markdown-next-ai-decision-dot"
                      style={{
                        background: `rgba(${decisionMeta[decision].rgb}, 0.9)`,
                      }}
                    ></span>
                    <span>{decisionMeta[decision].label}</span>
                  </div>
                </div>
                <div className="markdown-next-ai-decision-content">
                  {getDecidedPreview()}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  useEffect(() => {
    if (modifiedBlockIndices.length > 0) {
      scrollToDiffBlock(0)
    }
  }, [modifiedBlockIndices, scrollToDiffBlock])

  return (
    <div
      id="markdown-next-ai-apply-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
      }}
    >
      <div
        className="view-header"
        ref={headerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '6px',
          padding: '6px 12px',
          borderBottom: '1px solid var(--background-modifier-border)',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div
            className="view-header-left"
            style={{
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              gap: '2px',
            }}
          >
            <div
              className="view-header-title"
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {t('applyView.applying', 'Review Changes')}:{' '}
              {state?.file?.name ?? ''}
            </div>
          </div>

          <div className="markdown-next-ai-apply-progress-wrap">
            <div className="markdown-next-ai-apply-progress">
              <div className="markdown-next-ai-apply-progress-text">
                <span className="markdown-next-ai-apply-progress-label">
                  {t('applyView.progress', 'Progress')}
                </span>
                <span className="markdown-next-ai-apply-progress-value">
                  {decidedCount} / {modifiedBlockIndices.length}
                </span>
              </div>
              <div className="markdown-next-ai-apply-progress-bar">
                <div
                  className="markdown-next-ai-apply-progress-bar-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div
            className="view-header-actions"
            style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
          >
            <button
              onClick={() => navigate('prev')}
              title={t('applyView.prev', 'Previous Change')}
              className="markdown-next-ai-header-btn"
              disabled={!hasChanges}
            >
              <ChevronUp size={16} />
              {!isCompact && <span>Prev</span>}
            </button>

            <button
              onClick={() => navigate('next')}
              title={t('applyView.next', 'Next Change')}
              className="markdown-next-ai-header-btn"
              disabled={!hasChanges}
            >
              <ChevronDown size={16} />
              {!isCompact && <span>Next</span>}
            </button>

            {!isCompact ? (
              <>
                <button
                  onClick={acceptAll}
                  title={t('applyView.acceptAll', 'Accept all incoming changes')}
                  className="markdown-next-ai-header-btn markdown-next-ai-header-btn--accept"
                  disabled={!hasChanges}
                >
                  <CheckCheck size={16} />
                  <span>Accept All</span>
                </button>

                <button
                  onClick={rejectAll}
                  title={t('applyView.rejectAll', 'Reject all changes (keep original)')}
                  className="markdown-next-ai-header-btn markdown-next-ai-header-btn--reject"
                  disabled={!hasChanges}
                >
                  <Ban size={16} />
                  <span>Reject All</span>
                </button>

                <button
                  onClick={() => void keepInsertAndClose()}
                  title={t('applyView.keepInsert', 'Keep original and insert generated')}
                  className="markdown-next-ai-header-btn markdown-next-ai-header-btn--merge"
                  disabled={!hasChanges}
                >
                  <CopyPlus size={16} />
                  <span>Keep &amp; Insert</span>
                </button>
              </>
            ) : (
              <button
                onClick={showMoreMenu}
                title={t('applyView.more', 'More Actions')}
                className="markdown-next-ai-header-btn markdown-next-ai-header-btn--more"
                disabled={!hasChanges}
              >
                <MoreVertical size={16} />
              </button>
            )}
          </div>
        </div>

      </div>

      <div className="markdown-next-ai-apply-topbar">
        <div className="markdown-next-ai-apply-pill">
          <button
            onClick={() => close(false)}
            title={t('applyView.cancel', 'Cancel')}
            className="markdown-next-ai-pill-btn markdown-next-ai-pill-btn--cancel"
          >
            <X size={16} />
            <span>Cancel</span>
          </button>
          <button
            onClick={() => void applyAndClose()}
            title={t('applyView.apply', 'Apply')}
            className={`markdown-next-ai-pill-btn markdown-next-ai-pill-btn--apply ${isAllDecided ? 'is-complete' : ''}`}
            disabled={!hasChanges}
          >
            <Check size={16} />
            <span>{isAllDecided ? t('applyView.ready', 'Ready to Apply') : t('applyView.apply', 'Apply')}</span>
          </button>
        </div>
      </div>

      <div
        className="view-content"
        ref={scrollerRef}
        style={{ flex: 1, overflowY: 'auto', padding: '20px' }}
      >
        <div className="markdown-source-view cm-s-obsidian mod-cm6 node-insert-event is-readable-line-width is-live-preview is-folding show-properties">
          <div className="cm-editor">
            <div className="cm-scroller">
              <div className="cm-sizer">
                <div className="markdown-next-ai-inline-title">
                  {state?.file?.name
                    ? state.file.name.replace(/\.[^/.]+$/, '')
                    : ''}
                </div>
                {hasChanges ? (
                  diff.map((block, index) => renderDiffContent(block, index))
                ) : (
                  <div className="markdown-next-ai-apply-empty">No changes</div>
                )}
                <div style={{ height: '80px' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
