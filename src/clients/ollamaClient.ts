import { LLMClient } from '../llmClient';
// ollamaClient.ts
export class OllamaClient implements LLMClient {
    private readonly endpoint = 'http://localhost:11434/v1';

    constructor(private apiKey: string) {
        if (!apiKey) throw new Error('Ollama API key not configured');
    }

    private async makeRequest(path: string, body: any) {
        const response = await fetch(`${this.endpoint}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${await response.text()}`);
        }

        return response.json();
    }

    async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
        const data = await this.makeRequest('/chat/completions', {
            model: 'codellama',
            messages,
            temperature: 0.7
        });
        return data.choices[0].message.content;
    }

    async generate(prompt: string, type: 'code' | 'text'): Promise<string> {
        const data = await this.makeRequest('/completions', {
            model: type === 'code' ? 'codellama' : 'llama2',
            prompt,
            temperature: 0.5
        });
        return data.choices[0].text;
    }
}