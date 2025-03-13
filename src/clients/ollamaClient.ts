import { LLMClient } from "../llmClient";


export class OllamaClient implements LLMClient {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
        const systemPrompt = `You are an expert coding assistant. Follow these rules:
        1. Format code using markdown with syntax highlighting
        2. For diagrams, use Mermaid syntax
        3. Provide clear explanations with examples`;
        
        const response = await fetch('https://api.ollama.ai/v1/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'llama2',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async generate(prompt: string, type: 'code' | 'text'): Promise<string> {
        return ''; // TODO: Implement
    }

    async generatePlot(content: string): Promise<string> {
        const response = await fetch('https://api.ollama.ai/v1/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'llama2',
                messages: [{
                    role: 'user',
                    content: `Generate Plotly JSON data for: ${content}`
                }],
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate plot');
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
    }
}