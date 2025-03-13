// chatView.ts - Chat interface implementation
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

/**
 * ChatViewProvider manages the chat interface for the AI Assistant.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;
    private _messages: ChatMessage[] = [];
    private _typingInterval?: NodeJS.Timeout;
    private _isProcessing = false;
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
        if (!editor) {
            return '';
        }
        
        const doc = editor.document;
        const selection = editor.selection;
        const config = this.getConfig();
        
        const startLine = Math.max(0, selection.start.line - config.maxContextLines);
        const endLine = Math.min(doc.lineCount - 1, selection.end.line + config.maxContextLines);
        const contextRange = new vscode.Range(
            startLine, 0,
            endLine, doc.lineAt(endLine).text.length
        );
        
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
            this.showTypingIndicator();
            this.updateWebview();

            const response = await this.llmClient.chat([
                this.getSystemMessage(),
                ...this._messages.map(m => ({ role: m.role, content: m.content }))
            ]);

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: response,
                timestamp: Date.now()
            };

            this._messages.push(assistantMessage);
            this._context.globalState.update('chatHistory', this._messages);
        } catch (error: unknown) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Chat error: ${error.message}`);
            } else {
                vscode.window.showErrorMessage('An unknown error occurred.');
            }
        } finally {
            this._isProcessing = false;
            this.hideTypingIndicator();
            this.updateWebview();
        }
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

    private showTypingIndicator() {
        let dots = 0;
        this._typingInterval = setInterval(() => {
            dots = (dots + 1) % 4;
            if (this._view) {
                this._view.description = `AI is typing${'.'.repeat(dots)}`;
            }
        }, 500);
    }

    private hideTypingIndicator() {
        if (this._typingInterval) {
            clearInterval(this._typingInterval);
            if (this._view) {
                this._view.description = '';
            }
        }
    }

    private setupMessageHandlers() {
        if (!this._view) return;

        this._view.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'send':
                    await this.sendMessage(message.text);
                    break;
                
                case 'insertCode':
                    this.insertCode(message.code);
                    break;
                
                case 'clear':
                    this._messages = [];
                    this._context.globalState.update('chatHistory', []);
                    this.updateWebview();
                    break;
                
                case 'plot':
                    await this.createPlotPanel(message.content);
                    break;
            }
        });
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
        if (!this._view) return;

        const messagesHtml = await this.renderMessages();
        this._view.webview.html = this.getWebviewContent(messagesHtml);
    }

    private getWebviewContent(messagesHtml: string): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    ${this.getStyles()}
                </style>
                <link rel="stylesheet" 
                    href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css">
                <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
                <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>
            </head>
            <body>
                <div id="chat-container">
                    ${messagesHtml}
                </div>
                <script>
                    hljs.highlightAll();
                    mermaid.initialize({ 
                        startOnLoad: true,
                        theme: 'dark'
                    });
                    const container = document.getElementById('chat-container');
                    container.scrollTop = container.scrollHeight;
                </script>
                 <div id="input-container">
            <textarea id="chat-input" placeholder="Type a message..."></textarea>
            <div class="button-group">
                <button id="send-button">Send</button>
                <button id="clear-button">Clear Chat</button>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const chatInput = document.getElementById('chat-input');
            const sendButton = document.getElementById('send-button');
            const clearButton = document.getElementById('clear-button');

            sendButton.addEventListener('click', () => {
                const text = chatInput.value;
                if (text.trim()) {
                    vscode.postMessage({
                        command: 'send',
                        text: text
                    });
                    chatInput.value = '';
                }
            });

            clearButton.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'clear'
                });
            });

            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendButton.click();
                }
            });
        </script>
            </body>
            </html>
        `;
    }

    private async renderMessages(): Promise<string> {
        const formattedMessages = await Promise.all(
            this._messages.map(async (msg) => {
                const formattedContent = await this.formatContent(msg.content);
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

    private async formatContent(content: string): Promise<string> {
        try {
            // Use the new marked.parse method
            const markedContent = await marked.parse(content);
            
            // Add type annotations to the callback parameters
            return markedContent.replace(
                /<pre><code class="language-(\w+)">(.*?)<\/code><\/pre>/gs, 
                (match: string, lang: string, code: string): string => `
                    <div class="code-block">
                        <div class="code-header">${lang}</div>
                        <pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>
                        <div class="code-actions">
                            <button class="copy-code" data-code="${escapeHtml(code)}">Copy</button>
                            <button class="insert-code" data-code="${escapeHtml(code)}">Insert</button>
                        </div>
                    </div>
                `
            );
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error formatting content:', error);
            } else {
                console.error('An unknown error occurred while formatting content.');
            }
            return escapeHtml(content);
        }
    }

    private async createPlotPanel(plotData: string) {
        try {
            const panel = vscode.window.createWebviewPanel(
                'plotPanel', // Identifies the type of the webview. Used internally
                'Plot', // Title of the panel displayed to the user
                vscode.ViewColumn.One, // Editor column to show the new webview panel in.
                {} // Webview options.
            );

            // Set the webview's HTML content
            panel.webview.html = this.getPlotHtml(plotData);

            // Wait for the plot data to be generated
            const generatedData = await this.llmClient.generatePlot(plotData);

            // Display the generated data in the chat box
            this.displayChatBox(generatedData);
        } catch (error: unknown) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Error creating plot panel: ${error.message}`);
            } else {
                vscode.window.showErrorMessage('An unknown error occurred.');
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

    private async processExplanation(text: string): Promise<string> {
        text = text.replace(/```mermaid\n([\s\S]*?)```/g, (_, diagram) => 
            `<div class="mermaid">${diagram}</div>`
        );
        text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => 
            `<pre><code class="language-${lang || 'plaintext'}">${escapeHtml(code)}</code></pre>`
        );
        
        // Await the result of marked.parse
        const parsedText = await marked.parse(text);
        
        return parsedText
            .replace(/### (.*?)\n/g, '<h3>$1</h3>')
            .replace(/## (.*?)\n/g, '<h2>$1</h2>')
            .replace(/# (.*?)\n/g, '<h1>$1</h1>')
            .replace(/\n/g, '<br>');
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

    private async handlePlotCommand(content: string) {
        try {
            const client = getLLMClient(this.getConfig());
            const plotData = await client.generatePlot(content);
            this.createPlotPanel(plotData);
        } catch (error: unknown) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Plot error: ${error.message}`);
            } else {
                vscode.window.showErrorMessage('An unknown error occurred.');
            }
        }
    }
}