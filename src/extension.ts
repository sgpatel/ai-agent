// extension.ts - Main extension file
import * as vscode from 'vscode';
import { AIAssistant } from './aiAssistant';
import { ChatViewProvider } from './chatView';
import { CodeGenerationViewProvider } from './codeGenView';
import { SettingsViewProvider } from './settingsView';



export function activate(context: vscode.ExtensionContext) {
    const aiAssistant = new AIAssistant(context);
 
    const verifyConfig = () => {
        const config = vscode.workspace.getConfiguration('aiAssistant');
        if (!config.get('apiKeys.openai') && !config.get('apiKeys.ollama')) {
            vscode.window.showWarningMessage(
                'AI Assistant: No API keys configured. Please set them in settings.',
                'Open Settings'
            ).then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('aiAssistant.showSettings');
                }
            });
        }
    };

    context.subscriptions.push(
    
        vscode.window.registerWebviewViewProvider(
            'aiAssistant.chat',
            new ChatViewProvider(context)
        ),
        vscode.window.registerWebviewViewProvider(
            'aiAssistant.codeGeneration',
            new CodeGenerationViewProvider(context)
        ),
        vscode.window.registerWebviewViewProvider(
            SettingsViewProvider.viewType,
            new SettingsViewProvider(context)
        )

    );

    vscode.commands.registerCommand('aiAssistant.configureSettings', async () => {
        await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'aiAssistant'
        );
    }),
    vscode.commands.registerCommand('aiAssistant.showSettings', () => {
        vscode.commands.executeCommand('workbench.view.extension.aiAssistant.settings');
    }),
    vscode.commands.registerCommand('aiAssistant.generateTest', () => 
        aiAssistant.generateTest()
    );

    verifyConfig();
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('aiAssistant')) {
                verifyConfig();
            }
        })
    );
}

export function deactivate() {}