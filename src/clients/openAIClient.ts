import OpenAI from 'openai';
import { LLMClient } from '../llmClient';
import * as vscode from 'vscode';

/**
 * OpenAI-specific implementation of the LLMClient interface.
 */
export class OpenAIClient implements LLMClient {
  private client: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('API key for OpenAI is missing. Please set it in settings.');
    }
    this.client = new OpenAI({ apiKey });
  }

  async generateCode(prompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a helpful code assistant.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      });
      const text = response.choices[0]?.message?.content;
      if (text) {
        return text.trim();
      } else {
        throw new Error('OpenAI API error: incomplete response');
      }
    } catch (error: any) {
      console.error('OpenAI API error:', error.response?.status, error.response?.data || error);
      throw new Error(`OpenAI API error: ${error.response?.status ? `Request failed with status code ${error.response.status}` : error.message}`);
    }
  }

  async generateChatResponse(messages: { role: string; content: string }[]): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: messages as OpenAI.Chat.ChatCompletionCreateParams['messages'],
        max_tokens: 2000,
        temperature: 0.7,
      });
      const text = response.choices[0]?.message?.content;
      if (text) {
        return text.trim();
      } else {
        throw new Error('OpenAI API error: incomplete response');
      }
    } catch (error: any) {
      console.error('OpenAI API error:', error.response?.status, error.response?.data || error);
      throw new Error(`OpenAI API error: ${error.response?.status ? `Request failed with status code ${error.response.status}` : error.message}`);
    }
  }
}