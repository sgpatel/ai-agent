import * as vscode from 'vscode';
import { escapeHtml } from './utils';
import { getLLMClient } from './llmClient';
import * as marked from 'marked';
import { AIConfig } from './aiAssistant';

interface ChatMessage {
    role: string;
    content: string;
    timestamp: number;
    codeContext?: string;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;
    private _messages: ChatMessage[] = [];
    private _isProcessing = false;
    private _typingInterval?: NodeJS.Timeout;
    private llmClient: any;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._messages = context.globalState.get('chatHistory', []) || [];
        this.llmClient = getLLMClient(this.getConfig());
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        console.log('ChatViewProvider: Webview resolved');
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };
        this.updateWebview();
        this.setupMessageHandlers();
    }

    private getCodeContext(): string {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return '';
        
        const doc = editor.document;
        const selection = editor.selection;
        const config = this.getConfig();
        
        const startLine = Math.max(0, selection.start.line - config.maxContextLines);
        const endLine = Math.min(doc.lineCount - 1, selection.end.line + config.maxContextLines);
        const contextRange = new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length);
        
        return doc.getText(contextRange);
    }

    private async sendMessage(content: string) {
        if (this._isProcessing) {
            vscode.window.showWarningMessage('Please wait for the current response to complete');
            return;
        }

        this._isProcessing = true;
        try {
            const message: ChatMessage = {
                role: 'user',
                content,
                codeContext: this.getCodeContext(),
                timestamp: Date.now()
            };

            this._messages.push(message);
            this.updateWebview();

            let response: string;
            if (content.toLowerCase().includes('diagram')) {
                response = await this.llmClient.chat([
                    this.getSystemMessage(),
                    { role: 'user', content: `${content}\n\nPlease provide the response as a Mermaid diagram with proper line breaks.` }
                ]);
                await this.showMermaidDiagram(response);
            } else {
                response = await this.llmClient.chat([
                    this.getSystemMessage(),
                    ...this._messages.map(m => ({ role: m.role, content: m.content }))
                ]);
                if (this.isMermaidDiagram(response)) {
                    await this.showMermaidDiagram(response);
                } else {
                    const assistantMessage: ChatMessage = {
                        role: 'assistant',
                        content: response,
                        timestamp: Date.now()
                    };
                    this._messages.push(assistantMessage);
                }
            }

            this._context.globalState.update('chatHistory', this._messages);
        } catch (error: unknown) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Chat error: ${error.message}`);
            }
        } finally {
            this._isProcessing = false;
            this.updateWebview();
        }
    }

    private isMermaidDiagram(content: string): boolean {
        const trimmed = content.trim().toLowerCase();
        return trimmed.includes('sequencediagram') || 
               trimmed.includes('graph') || 
               trimmed.includes('classdiagram') || 
               trimmed.includes('statediagram') || 
               trimmed.includes('erdiagram') ||
               trimmed.includes('```mermaid');
    }

    private async showMermaidDiagram(diagramContent: string) {
        let formattedContent = diagramContent.trim();
    
        // Use regex to extract Mermaid code between ```mermaid and ```
        const mermaidRegex = /```mermaid\s*([\s\S]*?)\s*```/;
        const match = formattedContent.match(mermaidRegex);
        if (match && match[1]) {
            formattedContent = match[1].trim();
        } else {
            // Fallback: assume the entire content is the Mermaid code
            formattedContent = formattedContent;
        }
    
        const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: formattedContent,
            timestamp: Date.now()
        };
    
        this._messages.push(assistantMessage);
        this._context.globalState.update('chatHistory', this._messages);
        await this.updateWebview();
    }

    private formatSingleLineMermaid(raw: string): string {
        const keywords = ['participant ', '->>', '-->>'];
        let formatted = 'sequenceDiagram\n';
        let currentLine = '';

        raw.split(' ').forEach(word => {
            if (keywords.some(kw => word.includes(kw))) {
                if (currentLine) formatted += `${currentLine}\n`;
                currentLine = word;
            } else {
                currentLine += ` ${word}`;
            }
        });
        if (currentLine) formatted += currentLine;
        
        console.log('Formatted Mermaid:', formatted);
        return formatted;
    }

    private getSystemMessage(): ChatMessage {
        const editor = vscode.window.activeTextEditor;
        const lang = editor?.document.languageId || 'unknown';
        return {
            role: 'system',
            content: `You are an expert ${lang} developer. Provide detailed explanations with code examples in ${lang}.
                     Format responses using markdown for text and triple backticks for code.`,
            timestamp: Date.now()
        };
    }

    private setupMessageHandlers() {
        if (!this._view) {
            console.error('Webview view is not initialized');
            return;
        }

        this._view.webview.onDidReceiveMessage(async (message) => {
            console.log('Received message from webview:', message);
            switch (message.command) {
                case 'send':
                    await this.sendMessage(message.text);
                    break;
                case 'clear':
                    this._messages = [];
                    this._context.globalState.update('chatHistory', []);
                    this.updateWebview();
                    break;
                case 'insertCode':
                    this.insertCode(message.code);
                    break;
                case 'plot':
                    await this.createPlotPanel(message.content);
                    break;
            }
        }, undefined, this._context.subscriptions);
    }

    private insertCode(code: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, code);
            });
        }
    }

    private async updateWebview() {
        if (!this._view) {
            console.error('Cannot update webview: view is not initialized');
            return;
        }

        const messagesHtml = await this.renderMessages();
        this._view.webview.html = this.getWebviewContent(messagesHtml);
    }
    
    private getWebviewContent(messagesHtml: string): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;">
                <style>
                    ${this.getStyles()}
                    .mermaid-svg {
                        margin: 1rem 0;
                    }
                    #typing-indicator {
                        display: ${this._isProcessing ? 'block' : 'none'};
                        padding: 10px;
                        color: var(--vscode-descriptionForeground);
                        font-style: italic;
                    }
                    .diagram-container {
                        position: relative;
                    }
                    .toggle-diagram-btn {
                        margin-top: 10px;
                        padding: 4px 8px;
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    .toggle-diagram-btn:hover {
                        background: var(--vscode-button-secondaryHoverBackground);
                    }
                    .mermaid-script {
                        display: none;
                        background: var(--vscode-editor-background);
                        padding: 1rem;
                        border-radius: 4px;
                        margin: 1rem 0;
                        white-space: pre-wrap;
                    }
                </style>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css">
                <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
            </head>
            <body>
                <div id="chat-container">
                    ${messagesHtml}
                    <div id="typing-indicator">AI is typing...</div>
                </div>
                <div id="input-container">
                    <textarea id="chat-input" placeholder="Type a message..."></textarea>
                    <div class="button-group">
                        <button id="send-button">Send</button>
                        <button id="clear-button">Clear Chat</button>
                    </div>
                </div>
                <script type="module">
                    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.5.0/dist/mermaid.esm.min.mjs';
    
                    console.log('Webview script loaded');
    
                    // Initialize Mermaid
                    mermaid.initialize({
                        startOnLoad: false,
                        theme: 'dark',
                        logLevel: 1,
                        securityLevel: 'loose'
                    });
    
                    document.addEventListener('DOMContentLoaded', () => {
                        console.log('DOM fully loaded');
    
                        if (typeof hljs !== 'undefined') {
                            hljs.highlightAll();
                        } else {
                            console.error('Highlight.js not loaded');
                        }
    
                        const renderDiagrams = () => {
                            const mermaidElements = document.querySelectorAll('.mermaid:not(.processed)');
                            if (mermaidElements.length === 0) {
                                console.log('No new Mermaid diagrams to render');
                                return;
                            }
    
                            mermaidElements.forEach((element, index) => {
                                const id = \`mermaid-diagram-\${Date.now()}-\${index}\`;
                                let content = element.textContent.trim();
    
                                // Clean up Markdown backticks if present
                                if (content.startsWith('\\\`\\\`\\\`mermaid') && content.endsWith('\\\`\\\`\\\`')) {
                                    content = content
                                        .replace(/^\\\`\\\`\\\`mermaid\\s*/i, '')
                                        .replace(/\\s*\\\`\\\`\\\`$/i, '')
                                        .trim();
                                } else if (content.startsWith('\\\`\\\`\\\`') && content.endsWith('\\\`\\\`\\\`')) {
                                    content = content
                                        .replace(/^\\\`\\\`\\\`\\s*/i, '')
                                        .replace(/\\s*\\\`\\\`\\\`$/i, '')
                                        .trim();
                                }
    
                                console.log('Rendering Mermaid ID:', id, 'Content:', content);
    
                                const svgContainer = document.createElement('div');
                                svgContainer.className = 'mermaid-svg';
                                element.parentNode.insertBefore(svgContainer, element.nextSibling);
    
                                mermaid.render(id, content)
                                    .then(({ svg }) => {
                                        console.log('Successfully rendered diagram:', id);
                                        svgContainer.innerHTML = svg;
                                        element.style.display = 'none';
                                        element.classList.add('processed');
                                    })
                                    .catch(error => {
                                        console.error('Mermaid rendering error for ID:', id, 'Error:', error);
                                        svgContainer.innerHTML = \`<pre>Error rendering diagram: \${error.message}</pre>\`;
                                        element.classList.add('processed'); // Mark as processed even on error
                                    });
                            });
                        };
    
                        // Initial rendering
                        renderDiagrams();
    
                        // Watch for new Mermaid elements only
                        const observer = new MutationObserver((mutations) => {
                            const hasNewMermaid = Array.from(mutations).some(mutation => 
                                Array.from(mutation.addedNodes).some(node => 
                                    node.nodeType === Node.ELEMENT_NODE && 
                                    node.querySelector && 
                                    node.querySelector('.mermaid:not(.processed)')
                                )
                            );
                            if (hasNewMermaid) {
                                console.log('New Mermaid content detected, rendering...');
                                renderDiagrams();
                            }
                        });
                        observer.observe(document.getElementById('chat-container'), { 
                            childList: true, 
                            subtree: true 
                        });
    
                        // Scroll to bottom
                        const scrollToBottom = () => {
                            const container = document.getElementById('chat-container');
                            container.scrollTop = container.scrollHeight;
                        };
                        scrollToBottom();
    
                        // VS Code API communication
                        const vscode = acquireVsCodeApi();
                        const chatInput = document.getElementById('chat-input');
                        const sendButton = document.getElementById('send-button');
                        const clearButton = document.getElementById('clear-button');
    
                        if (!chatInput) console.error('chat-input not found');
                        if (!sendButton) console.error('send-button not found');
                        if (!clearButton) console.error('clear-button not found');
    
                        sendButton.addEventListener('click', () => {
                            const text = chatInput.value;
                            console.log('Send button clicked, text:', text);
                            if (text.trim()) {
                                vscode.postMessage({
                                    command: 'send',
                                    text: text
                                });
                                chatInput.value = '';
                            }
                        });
    
                        chatInput.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                console.log('Enter key pressed');
                                const text = chatInput.value;
                                if (text.trim()) {
                                    vscode.postMessage({
                                        command: 'send',
                                        text: text
                                    });
                                    chatInput.value = '';
                                }
                            }
                        });
    
                        clearButton.addEventListener('click', () => {
                            console.log('Clear button clicked');
                            vscode.postMessage({
                                command: 'clear'
                            });
                        });
    
                        // Toggle diagram/script visibility
                        document.getElementById('chat-container').addEventListener('click', (event) => {
                            const target = event.target;
                            if (target.classList.contains('toggle-diagram-btn')) {
                                const container = target.closest('.diagram-container');
                                const diagram = container.querySelector('.mermaid-svg');
                                const script = container.querySelector('.mermaid-script');
                                if (diagram.style.display === 'none') {
                                    diagram.style.display = 'block';
                                    script.style.display = 'none';
                                    target.textContent = 'Show Script';
                                } else {
                                    diagram.style.display = 'none';
                                    script.style.display = 'block';
                                    target.textContent = 'Show Diagram';
                                }
                                scrollToBottom();
                            }
                        });
    
                        // Ensure scroll after content loads
                        setTimeout(scrollToBottom, 100);
                    });
                </script>
            </body>
            </html>
        `;
    }
    
    private async renderMessages(): Promise<string> {
        const formattedMessages = await Promise.all(
            this._messages.map(async (msg) => {
                const formattedContent = await this.formatContent(msg.content, this.isMermaidDiagram(msg.content));
                return `
                    <div class="message ${msg.role}">
                        <div class="role">${msg.role === 'user' ? 'You' : 'Assistant'}</div>
                        <div class="content">${formattedContent}</div>
                        <div class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                    </div>
                `;
            })
        );
        return formattedMessages.join('');
    }

    private async formatContent(content: string, isDiagram: boolean = false): Promise<string> {
        try {
            if (isDiagram) {
                // For diagrams, render directly as Mermaid content with toggle
                return `
                    <div class="diagram-container">
                        <div class="mermaid">${escapeHtml(content)}</div>
                        <div class="mermaid-script"><pre>${escapeHtml(content)}</pre></div>
                        <button class="toggle-diagram-btn">Show Script</button>
                    </div>
                `;
            }

            const markedContent = await marked.parse(content);
            return markedContent.replace(
                /<pre><code class="language-(\w+)">(.*?)<\/code><\/pre>/gs,
                (match: string, lang: string, code: string): string => {
                    if (lang === 'mermaid') {
                        return `
                            <div class="diagram-container">
                                <div class="mermaid">${escapeHtml(code)}</div>
                                <div class="mermaid-script"><pre>${escapeHtml(code)}</pre></div>
                                <button class="toggle-diagram-btn">Show Script</button>
                            </div>
                        `;
                    }
                    return `
                        <div class="code-block">
                            <div class="code-header">${lang}</div>
                            <pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>
                            <div class="code-actions">
                                <button class="copy-code" data-code="${escapeHtml(code)}">Copy</button>
                                <button class="insert-code" data-code="${escapeHtml(code)}">Insert</button>
                            </div>
                        </div>
                    `;
                }
            );
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error formatting content:', error);
            }
            return escapeHtml(content);
        }
    }

    private async createPlotPanel(plotData: string) {
        try {
            const panel = vscode.window.createWebviewPanel(
                'plotPanel',
                'Plot',
                vscode.ViewColumn.One,
                {}
            );
            panel.webview.html = this.getPlotHtml(plotData);
            const generatedData = await this.llmClient.generatePlot(plotData);
            this.displayChatBox(generatedData);
        } catch (error: unknown) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Error creating plot panel: ${error.message}`);
            }
        }
    }

    private getPlotHtml(plotData: string): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            </head>
            <body>
                <div id="plot"></div>
                <script>
                    const data = ${plotData};
                    Plotly.newPlot('plot', data);
                </script>
            </body>
            </html>
        `;
    }

    private displayChatBox(generatedData: string) {
        const message: ChatMessage = {
            role: 'assistant',
            content: generatedData,
            timestamp: Date.now()
        };
        this._messages.push(message);
        this.updateWebview();
    }

    private getStyles(): string {
        return `
            :root {
                --vscode-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                --bg-color: var(--vscode-editor-background);
                --text-color: var(--vscode-editor-foreground);
                --border-color: var(--vscode-editorWidget-border);
            }
            body {
                font-family: var(--vscode-font);
                background: var(--bg-color);
                color: var(--text-color);
                height: 100vh;
                margin: 0;
                padding: 20px;
                display: flex;
                flex-direction: column;
            }
            #chat-container {
                flex: 1;
                overflow-y: auto;
                padding-bottom: 20px;
            }
            .message {
                margin-bottom: 20px;
                border-radius: 8px;
                padding: 15px;
                background: var(--vscode-sideBar-background);
            }
            .message.assistant {
                border-left: 3px solid var(--vscode-chat-requestBorder);
            }
            .message.user {
                border-left: 3px solid var(--vscode-chat-slashCommandBackground);
            }
            .role {
                font-weight: 600;
                margin-bottom: 8px;
                color: var(--vscode-editor-foreground);
            }
            .timestamp {
                font-size: 0.8em;
                color: var(--vscode-descriptionForeground);
                margin-top: 8px;
            }
            #input-container {
                border-top: 1px solid var(--border-color);
                padding-top: 15px;
            }
            textarea {
                width: 100%;
                min-height: 60px;
                padding: 10px;
                border: 1px solid var(--border-color);
                border-radius: 4px;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                resize: none;
            }
            .button-group {
                display: flex;
                gap: 8px;
                margin-top: 10px;
            }
            button {
                padding: 6px 12px;
                border: none;
                border-radius: 4px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                cursor: pointer;
            }
            button:hover {
                background: var(--vscode-button-hoverBackground);
            }
            .code-block {
                position: relative;
                margin: 10px 0;
                border-radius: 4px;
                overflow: hidden;
            }
            .code-header {
                padding: 4px 8px;
                background: var(--vscode-editorLineNumber-foreground);
                color: var(--vscode-editor-background);
                font-size: 0.9em;
            }
            .code-actions {
                position: absolute;
                top: 4px;
                right: 4px;
                display: flex;
                gap: 4px;
            }
            .mermaid {
                background: var(--vscode-editor-background);
                padding: 1rem;
                border-radius: 4px;
                margin: 1rem 0;
            }
            pre {
                background: var(--vscode-editor-background);
                padding: 1rem;
                border-radius: 4px;
                margin: 1rem 0;
            }
            code {
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
            }
        `;
    }

    private getConfig(): AIConfig {
        const config = vscode.workspace.getConfiguration('aiAssistant');
        return {
            selectedProvider: config.get('selectedProvider', 'OpenAI'),
            maxContextLines: config.get('maxContextLines', 10),
            enableInline: config.get('enableInline', true),
            preferredModels: config.get('preferredModels', {}),
            apiKeys: config.get('apiKeys', {}),
            codeReviewLevel: config.get('codeReviewLevel', 'basic'),
            testFramework: config.get('testFramework', 'jest'),
            generateComments: config.get('generateComments', false)
        };
    }
}