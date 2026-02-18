import { TFile } from "obsidian";
import { AIService } from "../../services/ai-service";
import { ChatMessage } from "../../types";

const EDIT_MODE_SYSTEM_PROMPT = `You are an intelligent document editor. Your task is to modify a markdown document based on user instructions.

You must output the changes using one of the following block formats:

1. To replace existing content:
<<<<<<< SEARCH
[Exact text to be replaced]
=======
[New replacement text]
>>>>>>> REPLACE

2. To insert new content after a specific section:
<<<<<<< INSERT AFTER
[Exact text to locate insertion point]
=======
[New text to insert]
>>>>>>> INSERT

3. To append to the end of the file:
<<<<<<< CONTINUE
=======
[Text to append]
>>>>>>> CONTINUE

CRITICAL RULES:
- The SEARCH block must contain the EXACT text from the original file, including whitespace and newlines.
- Do not include any text outside these blocks.
- Output multiple blocks if needed, but they must be applied in order from top to bottom.
- Prefer minimal changes. Do not replace the entire file unless necessary.
`;

export function generateEditPrompt(instruction: string, currentFile: TFile, fileContent: string, selectedText?: string, additionalContext?: string): string {
    let prompt = `
Here is the file content of ${currentFile.path}:

\`\`\`markdown
${fileContent}
\`\`\`
`;

    if (selectedText && selectedText.trim()) {
        prompt += `
The user has selected the following text:
\`\`\`markdown
${selectedText}
\`\`\`
`;
    }

    if (additionalContext && additionalContext.trim()) {
        prompt += `
Additional Context:
${additionalContext}
`;
    }

    prompt += `
User Instruction: ${instruction}

Please generate the necessary SEARCH/REPLACE blocks to modify the file according to the instruction.
`;
    return prompt;
}

export async function generateEditContent({
    instruction,
    currentFile,
    currentFileContent,
    selectedText,
    additionalContext,
    aiService,
    modelId,
    mode
}: {
    instruction: string;
    currentFile: TFile;
    currentFileContent: string;
    selectedText?: string;
    additionalContext?: string;
    aiService: AIService;
    modelId: string | undefined;
    mode?: string;
}): Promise<string> {
    const messages: ChatMessage[] = [
        { role: "system", content: EDIT_MODE_SYSTEM_PROMPT },
        { role: "user", content: generateEditPrompt(instruction, currentFile, currentFileContent, selectedText, additionalContext) }
    ];
    const configuredMaxTokens = aiService.getMaxTokens("edit") || 2048;
    const maxTokens = mode === "direct" ? Math.max(16384, configuredMaxTokens) : configuredMaxTokens;
    const text = await aiService.generateCompletion(messages, modelId, {
        temperature: 0.2,
        max_tokens: maxTokens
    });
    return text;
}
