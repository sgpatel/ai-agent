// chatView.ts - Chat interface implementation
import * as vscode from 'vscode';
import { escapeHtml } from './utils';
import { getLLMClient } from './llmClient';
import * as marked from 'marked';

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
    private _typingInterval?: NodeJS.Timeout;
    private _isProcessing = false;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._messages = context.globalState.get('chatHistory', []) || [];
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
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

            const client = getLLMClient(this.getConfig());
            const response = await client.chat([
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
        } catch (error: any) {
            vscode.window.showErrorMessage(`Chat error: ${error.message}`);
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
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function setupEventListeners() {
                        document.getElementById('send').addEventListener('click', () => {
                            const input = document.getElementById('input');
                            if (input.value.trim()) {
                                vscode.postMessage({ command: 'send', text: input.value });
                                input.value = '';
                            }
                        });

                        document.getElementById('clear').addEventListener('click', () => {
                            vscode.postMessage({ command: 'clear' });
                        });

                        document.body.addEventListener('click', (event) => {
                            if (event.target.classList.contains('copy-code')) {
                                const code = event.target.dataset.code;
                                navigator.clipboard.writeText(code);
                                vscode.postMessage({
                                    command: 'showInfo',
                                    text: 'Code copied to clipboard'
                                });
                            }
                            
                            if (event.target.classList.contains('insert-code')) {
                                const code = event.target.dataset.code;
                                vscode.postMessage({
                                    command: 'insertCode',
                                    code
                                });
                            }
                        });

                        const textarea = document.getElementById('input');
                        textarea.addEventListener('input', () => {
                            textarea.style.height = 'auto';
                            textarea.style.height = textarea.scrollHeight + 'px';
                        });
                    }

                    document.addEventListener('DOMContentLoaded', setupEventListeners);
                </script>
            </head>
            <body>
                <div id="chat-container">
                    ${messagesHtml}
                </div>
                <div id="input-container">
                    <textarea id="input" placeholder="Ask me anything..."></textarea>
                    <div class="button-group">
                        <button id="send">Send</button>
                        <button id="clear">Clear</button>
                    </div>
                </div>
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
        } catch (error) {
            console.error('Error formatting content:', error);
            return escapeHtml(content);
        }
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

            pre {
                margin: 0;
                padding: 10px;
                background: var(--vscode-editor-background) !important;
            }

            code {
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
            }
        `;
    }

    private getConfig() {
        const config = vscode.workspace.getConfiguration('aiAssistant');
        return {
            maxContextLines: config.get<number>('maxContextLines', 10),
            selectedProvider: config.get<string>('selectedProvider', 'OpenAI'),
            enableInline: config.get<boolean>('enableInline', true),
            preferredModels: config.get<{ [key: string]: string }>('preferredModels', {}),
            apiKeys: {
                openai: config.get<string>('apiKeys.openai', ''),
                ollama: config.get<string>('apiKeys.ollama', '')
            }
        };
    }
}