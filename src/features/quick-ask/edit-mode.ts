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

export function generateEditPrompt(instruction: string, currentFile: TFile, fileContent: string): string {
    return `
Here is the file content of ${currentFile.path}:

\`\`\`markdown
${fileContent}
\`\`\`

User Instruction: ${instruction}

Please generate the necessary SEARCH/REPLACE blocks to modify the file according to the instruction.
`;
}

export async function generateEditContent({
    instruction,
    currentFile,
    currentFileContent,
    aiService,
    modelId
}: {
    instruction: string;
    currentFile: TFile;
    currentFileContent: string;
    aiService: AIService;
    modelId: string | undefined;
}): Promise<string> {
    const messages: ChatMessage[] = [
        { role: "system", content: EDIT_MODE_SYSTEM_PROMPT },
        { role: "user", content: generateEditPrompt(instruction, currentFile, currentFileContent) }
    ];
    const maxTokens = aiService.getMaxTokens("edit") || 2048;
    const text = await aiService.generateCompletion(messages, modelId, {
        temperature: 0.2,
        max_tokens: maxTokens
    });
    return text;
}
