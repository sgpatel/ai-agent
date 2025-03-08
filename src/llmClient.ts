
/**
 * Interface for interacting with different LLM providers.
 * Implementations must provide methods for code generation and other features.
 */
export interface LLMClient {
    /**
     * Generates code based on the provided prompt.
     * @param prompt User-provided text to guide code generation.
     * @returns Promise resolving to the generated code string.
     */
    generateCode(prompt: string): Promise<string>;

    /**
     * Generates a chat response based on the provided messages.
     * @param messages Array of message objects with role and content.
     * @returns Promise resolving to the generated chat response string.
     */
    generateChatResponse(messages: { role: string, content: string }[]): Promise<string>;
}