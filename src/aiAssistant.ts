// aiAssistant.ts - Core functionality
import * as vscode from 'vscode';
import { getLLMClient } from './llmClient';
import { escapeHtml } from './utils';

export interface AIConfig {
    selectedProvider: string;
    maxContextLines: number;
    enableInline: boolean;
    preferredModels: { [key: string]: string };
    apiKeys: { [key: string]: string };
    codeReviewLevel: 'basic' | 'detailed';
    testFramework: string;
    generateComments: boolean;
}

enum ViewMode {
    Chat = 'chat',
    CodeGeneration = 'code'
}

interface WebviewMessage {
    command: string;
    mode?: ViewMode;
}

export class AIAssistant {
    private _context: vscode.ExtensionContext;
    private _statusBar: vscode.StatusBarItem;
    private _decorationType: vscode.TextEditorDecorationType;
    private _inlineTimeout?: NodeJS.Timeout;
    private _isProcessing = false;
    private _currentViewMode: ViewMode = ViewMode.Chat;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this._decorationType = vscode.window.createTextEditorDecorationType({
            opacity: '0.6',
            rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen
        });
        
        context.subscriptions.push(
            vscode.commands.registerCommand('aiAssistant.explainCode', this.explainSelection),
            vscode.commands.registerCommand('aiAssistant.generateTest', this.generateTest),
            vscode.commands.registerCommand('aiAssistant.codeReview', this.codeReview),
            vscode.window.onDidChangeTextEditorSelection(this.handleSelectionChange)
        );
    }

    private getConfig(): AIConfig {
        const config = vscode.workspace.getConfiguration('aiAssistant');
        return {
            selectedProvider: config.get<string>('selectedProvider', 'OpenAI'),
            maxContextLines: config.get<number>('maxContextLines', 10),
            enableInline: config.get<boolean>('enableInline', true),
            preferredModels: config.get<{[task: string]: string}>('preferredModels', {}),
            apiKeys: {
                openai: config.get<string>('apiKeys.openai', ''),
                ollama: config.get<string>('apiKeys.ollama', '')
            },
            codeReviewLevel: config.get<'basic' | 'detailed'>('codeReviewLevel', 'basic'),
            testFramework: config.get<string>('testFramework', 'jest'),
            generateComments: config.get<boolean>('generateComments', false)
        };
    }

    generateTest = async () => {
        if (this._isProcessing) {
            vscode.window.showWarningMessage('Please wait for the current operation to complete');
            return;
        }

        this._isProcessing = true;
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showWarningMessage('No code selected');
                return;
            }

            this._statusBar.text = '$(sync~spin) Generating tests...';
            this._statusBar.show();

            const client = getLLMClient(this.getConfig());
            const config = this.getConfig();
            const prompt = `Generate ${config.testFramework} unit tests for this ${editor.document.languageId} code${config.generateComments ? ' with detailed comments' : ''}:\n${selection}`;
            const tests = await client.generate(prompt, 'code');

            this.showExplanationPanel(tests, selection, 'Generated Tests');
        } catch (error: any) {
            vscode.window.showErrorMessage(`Test generation error: ${error.message}`);
        } finally {
            this._isProcessing = false;
            this._statusBar.hide();
        }
    };

    explainSelection = async () => {
        if (this._isProcessing) {
            vscode.window.showWarningMessage('Please wait for the current operation to complete');
            return;
        }

        this._isProcessing = true;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const selection = editor.document.getText(editor.selection);
        if (!selection) {
            vscode.window.showWarningMessage('No code selected');
            return;
        }

        this._statusBar.text = '$(sync~spin) Analyzing code...';
        this._statusBar.show();

        try {
            const client = getLLMClient(this.getConfig());
            const prompt = `Explain this ${editor.document.languageId} code:\n${selection}`;
            const explanation = await client.chat([
                { role: 'user', content: prompt }
            ]);

            this.showExplanationPanel(explanation, selection, 'Code Explanation');
        } catch (error: any) {
            vscode.window.showErrorMessage(`Explanation error: ${error.message}`);
        } finally {
            this._isProcessing = false;
            this._statusBar.hide();
        }
    };

    codeReview = async () => {
        if (this._isProcessing) {
            vscode.window.showWarningMessage('Please wait for the current operation to complete');
            return;
        }

        this._isProcessing = true;
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const selection = editor.document.getText(editor.selection);
            if (!selection) {
                vscode.window.showWarningMessage('No code selected');
                return;
            }

            this._statusBar.text = '$(sync~spin) Reviewing code...';
            this._statusBar.show();

            const client = getLLMClient(this.getConfig());
            const config = this.getConfig();
            const prompt = `Perform a ${config.codeReviewLevel} code review for this ${editor.document.languageId} code:\n${selection}`;
            const review = await client.chat([
                { role: 'user', content: prompt }
            ]);

            this.showExplanationPanel(review, selection, 'Code Review');
        } catch (error: any) {
            vscode.window.showErrorMessage(`Code review error: ${error.message}`);
        } finally {
            this._isProcessing = false;
            this._statusBar.hide();
        }
    };

    private showExplanationPanel(content: string, code: string, title: string) {
        const panel = vscode.window.createWebviewPanel(
            'codeExplanation',
            title,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this._context.extensionUri, 'media')
                ]
            }
        );

        panel.webview.html = this.getExplanationHtml(content, code);
        panel.webview.onDidReceiveMessage(
            (message: WebviewMessage) => {
                switch (message.command) {
                    case 'switchMode':
                        if (message.mode) {
                            this._currentViewMode = message.mode;
                            panel.webview.html = this.getExplanationHtml(content, code);
                        }
                        break;
                }
            }
        );
    }

    private getExplanationHtml(explanation: string, code: string): string {
        const isChatMode = this._currentViewMode === ViewMode.Chat;
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    ${this.getCommonStyles()}
                    .mode-toggle {
                        display: flex;
                        gap: 8px;
                        margin-bottom: 16px;
                    }
                    .mode-button {
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                        border: 1px solid var(--vscode-button-border);
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    .mode-button.active {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .code-block { 
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-editorWidget-border);
                        border-radius: 4px;
                        padding: 10px;
                        margin: 10px 0;
                    }
                    .explanation {
                        line-height: 1.6;
                        font-size: 14px;
                    }
                </style>
                <link rel="stylesheet" 
                    href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css">
                <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
            </head>
            <body>
                <div class="mode-toggle">
                    <button class="mode-button ${isChatMode ? 'active' : ''}" 
                        onclick="switchMode('chat')">Chat</button>
                    <button class="mode-button ${!isChatMode ? 'active' : ''}"
                        onclick="switchMode('code')">Code Generation</button>
                </div>
                <h1>${isChatMode ? 'Code Explanation' : 'Generated Code'}</h1>
                <div class="code-block">
                    <pre><code class="language-${vscode.window.activeTextEditor?.document.languageId}">${escapeHtml(code)}</code></pre>
                </div>
                <div class="explanation">
                    ${this.processExplanation(explanation)}
                </div>
                <script>
                    hljs.highlightAll();
                    const vscode = acquireVsCodeApi();
                    function switchMode(mode) {
                        vscode.postMessage({
                            command: 'switchMode',
                            mode: mode
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private processExplanation(text: string): string {
        return text
            .replace(/### (.*?)\n/g, '<h3>$1</h3>')
            .replace(/## (.*?)\n/g, '<h2>$1</h2>')
            .replace(/# (.*?)\n/g, '<h1>$1</h1>')
            .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => 
                `<pre><code class="language-${lang || 'plaintext'}">${escapeHtml(code)}</code></pre>`)
            .replace(/\n/g, '<br>');
    }

    private handleSelectionChange = async (event: vscode.TextEditorSelectionChangeEvent) => {
        if (!this.getConfig().enableInline || this._isProcessing) return;

        const editor = event.textEditor;
        const position = editor.selection.active;
        const line = editor.document.lineAt(position.line).text;
        
        if (line.trim().length < 3) return;

        if (this._inlineTimeout) clearTimeout(this._inlineTimeout);
        this._inlineTimeout = setTimeout(async () => {
            try {
                const client = getLLMClient(this.getConfig());
                const prompt = `Complete this ${editor.document.languageId} code. Only respond with the code completion.\n\n${line}`;
                const completion = await client.generate(prompt, 'code');
                
                const range = new vscode.Range(position, position.translate(0, completion.length));
                const decoration = { 
                    range, 
                    renderOptions: { 
                        after: { 
                            contentText: completion, 
                            color: '#999',
                            fontStyle: 'italic'
                        } 
                    } 
                };
                
                editor.setDecorations(this._decorationType, [decoration]);
            } catch (error) {
                console.error('Inline completion error:', error);
            }
        }, 500);
    };

    private getCommonStyles(): string {
        return `
            :root {
                --vscode-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                --vscode-background: var(--vscode-editor-background);
                --vscode-foreground: var(--vscode-editor-foreground);
                --vscode-border: var(--vscode-editorWidget-border);
            }
            body {
                font-family: var(--vscode-font);
                background: var(--vscode-background);
                color: var(--vscode-foreground);
                padding: 20px;
            }
            h1 { 
                font-size: 1.4em; 
                margin-bottom: 1.2em;
                color: var(--vscode-editor-foreground);
            }
            pre {
                background: var(--vscode-editor-background) !important;
                padding: 10px;
                border-radius: 4px;
            }
        `;
    }
}