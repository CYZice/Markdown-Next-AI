import {
  DefaultLinesDiffComputer,
  ILinesDiffComputerOptions,
} from 'vscode-diff'

export type DiffBlock =
  | {
    type: 'unchanged'
    value: string
  }
  | {
    type: 'modified'
    originalValue?: string
    modifiedValue?: string
  }

export function createDiffBlocks(
  currentMarkdown: string,
  incomingMarkdown: string,
): DiffBlock[] {
  const blocks: DiffBlock[] = []

  const advOptions: ILinesDiffComputerOptions = {
    ignoreTrimWhitespace: false,
    computeMoves: false,
    maxComputationTimeMs: 0,
  }
  const advDiffComputer = new DefaultLinesDiffComputer()

  const currentLines = currentMarkdown.split('\n')
  const incomingLines = incomingMarkdown.split('\n')
  const advResult = advDiffComputer.computeDiff(
    currentLines,
    incomingLines,
    advOptions,
  )
  const advLineChanges = (advResult as any)?.changes ?? []

  let lastOriginalEndLineNumberExclusive = 1
  advLineChanges.forEach((change: any) => {
    if (!change) return
    const oRange = change.originalRange ?? change.original
    const mRange = change.modifiedRange ?? change.modified
    if (!oRange || !mRange) return
    const oStart = oRange.startLineNumber ?? 1
    const oEnd = oRange.endLineNumberExclusive ?? oStart
    const mStart = mRange.startLineNumber ?? 1
    const mEnd = mRange.endLineNumberExclusive ?? mStart

    if (oStart > lastOriginalEndLineNumberExclusive) {
      const unchangedValue = currentLines
        .slice(lastOriginalEndLineNumberExclusive - 1, oStart - 1)
        .join('\n')
      if (unchangedValue.length > 0) {
        blocks.push({
          type: 'unchanged',
          value: unchangedValue,
        })
      }
    }

    const originalValue = currentLines.slice(oStart - 1, oEnd - 1).join('\n')
    const modifiedValue = incomingLines.slice(mStart - 1, mEnd - 1).join('\n')
    if (originalValue.length > 0 || modifiedValue.length > 0) {
      blocks.push({
        type: 'modified',
        originalValue: originalValue.length > 0 ? originalValue : undefined,
        modifiedValue: modifiedValue.length > 0 ? modifiedValue : undefined,
      })
    }

    lastOriginalEndLineNumberExclusive = oEnd
  })

  if (currentLines.length > lastOriginalEndLineNumberExclusive - 1) {
    const unchangedValue = currentLines
      .slice(lastOriginalEndLineNumberExclusive - 1)
      .join('\n')
    if (unchangedValue.length > 0) {
      blocks.push({
        type: 'unchanged',
        value: unchangedValue,
      })
    }
  }

  if (blocks.length === 0) {
    if (currentMarkdown === incomingMarkdown) {
      if (currentMarkdown.length > 0) {
        blocks.push({ type: 'unchanged', value: currentMarkdown })
      }
    } else {
      blocks.push({
        type: 'modified',
        originalValue: currentMarkdown.length > 0 ? currentMarkdown : undefined,
        modifiedValue: incomingMarkdown.length > 0 ? incomingMarkdown : undefined,
      })
    }
  }

  return blocks
}
