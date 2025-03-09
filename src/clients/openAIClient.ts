import OpenAI from 'openai';
import { LLMClient } from '../llmClient';
import * as vscode from 'vscode';

export class OpenAIClient implements LLMClient {
    private readonly client: OpenAI;
    private readonly defaultModel = 'gpt-4o';
    private readonly codeModel = 'gpt-4o';
    private readonly maxTokens = 2000;
    private readonly defaultTemperature = 0.7;
    private readonly codeTemperature = 0.3;

    constructor(private apiKey: string) {
        if (!apiKey?.trim()) {
            throw new Error('OpenAI API key not configured');
        }
        
        this.client = new OpenAI({
            apiKey: apiKey.trim(),
            timeout: 30000, // 30 seconds timeout
            maxRetries: 2
        });
    }

    async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
        try {
            if (!messages?.length) {
                throw new Error('No messages provided for chat');
            }
    
            const validatedMessages = this.validateMessages(messages);
            const completion = await this.client.chat.completions.create({
                model: this.defaultModel,
                messages: validatedMessages,
                temperature: this.defaultTemperature,
                max_tokens: this.maxTokens
            });
    
            const content = this.extractContent(completion);
            return content; // ✅ Properly resolved string
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    async generate(prompt: string, type: 'code' | 'text'): Promise<string> {
        try {
            if (!prompt?.trim()) {
                throw new Error('No prompt provided for generation');
            }

            const completion = await this.client.chat.completions.create({
                model: this.codeModel,
                messages: [{
                    role: 'user',
                    content: prompt.trim()
                }],
                temperature: type === 'code' ? this.codeTemperature : this.defaultTemperature,
                max_tokens: this.maxTokens
            });

            return this.extractContent(completion);
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    private validateMessages(messages: Array<{ role: string; content: string }>): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        return messages.map(msg => ({
            role: this.validateRole(msg.role),
            content: msg.content.trim()
        }));
    }

    private validateRole(role: string): 'system' | 'user' | 'assistant' {
        if (['system', 'user', 'assistant'].includes(role)) {
            return role as 'system' | 'user' | 'assistant';
        }
        throw new Error(`Invalid role: ${role}`);
    }

    private extractContent(completion: OpenAI.Chat.Completions.ChatCompletion): string {
        if (!completion.choices?.length) {
            throw new Error('No completion choices returned');
        }

        const content = completion.choices[0].message?.content?.trim();
        if (!content) {
            throw new Error('Empty response content from API');
        }

        return content;
    }

    private handleError(error: unknown): void {
        if (error instanceof OpenAI.APIError) {
            const statusMessage = error.status ? ` (Status: ${error.status})` : '';
            vscode.window.showErrorMessage(`OpenAI API Error${statusMessage}: ${error.message}`);
            console.error('OpenAI API Error:', {
                status: error.status,
                message: error.message,
                code: error.code,
                type: error.type
            });
        } else if (error instanceof Error) {
            vscode.window.showErrorMessage(`AI Error: ${error.message}`);
            console.error('Generation Error:', error);
        } else {
            const errorMessage = 'Unknown error occurred during AI operation';
            vscode.window.showErrorMessage(errorMessage);
            console.error(errorMessage, error);
        }
    }
}