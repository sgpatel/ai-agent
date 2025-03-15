// llmClient.ts - LLM abstraction layer
import * as vscode from 'vscode';
import { AIConfig } from './aiAssistant';
import { OpenAIClient } from './clients/openAIClient';
import { OllamaClient } from './clients/ollamaClient';


export interface LLMClient {
    chat(messages: Array<{ role: string; content: string }>): Promise<string>;
    generate(prompt: string, type: 'code' | 'text'): Promise<string>;
    generatePlot(content: string): Promise<string>;
}

export function getLLMClient(config: AIConfig): LLMClient {
    const provider = config.selectedProvider;
    const apiKey = config.apiKeys[provider.toLowerCase() as keyof typeof config.apiKeys];
    console.log(apiKey);
    if (!apiKey) {
        const message = `${provider} API key not configured. Please set it in settings.`;
        vscode.window.showErrorMessage(message, 'Open Settings').then(verifyConfig);
        throw new Error(message);
    }

    switch (provider) {
        case 'OpenAI':
            return new OpenAIClient(apiKey);
        case 'Ollama':
            return new OllamaClient(apiKey);
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }
}

const verifyConfig = (selection: string | undefined) => {
    if (selection === 'Open Settings') {
        vscode.commands.executeCommand('aiAssistant.showSettings');
    }
};

