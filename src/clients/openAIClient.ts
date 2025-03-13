import { LLMClient } from '../llmClient';

export class OpenAIClient implements LLMClient {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
        const systemPrompt = `You are an expert coding assistant. Follow these rules:
        1. Format code using markdown with syntax highlighting
        2. For diagrams, use Mermaid syntax
        3. Provide clear explanations with examples`;
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4',
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
        // Define the system prompt based on the type of generation
        const systemPrompt = type === 'code'
            ? `You are an expert coding assistant. Follow these rules:
               1. Generate clean, efficient, and well-documented code.
               2. Use markdown with syntax highlighting for code blocks.
               3. Provide a brief explanation of the code if necessary.`
            : `You are an expert content writer. Follow these rules:
               1. Generate clear, concise, and well-structured text.
               2. Use markdown for formatting (e.g., headings, lists, bold/italic).
               3. Ensure the content is relevant to the given prompt.`;
    
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7
            })
        });
    
        const data = await response.json();
        return data.choices[0].message.content;
    }

    async generatePlot(content: string): Promise<string> {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [{
                    role: 'user',
                    content: `Generate Plotly JSON data for: ${content}`
                }],
                temperature: 0.7
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    }
}