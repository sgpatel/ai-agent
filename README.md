# AI Assistant Extension

The AI Assistant is a powerful Visual Studio Code extension that harnesses artificial intelligence to streamline coding workflows. Built with TypeScript, it integrates with large language models (LLMs) such as OpenAI and Ollama to offer features like code generation, code review, automatic code completion, and project file management.

## Install and run codebase

-**Clone Repo**

git clone 

-**Install required Libs**

npm install

npm run compile

- **Install visual studio code extension cli**

npm install -g @vscode/vsce

vsce package


## Features

- **AI-Powered Code Generation**: Create code snippets from natural language prompts.
- **Code Review and Insertion**: Review AI-generated code in a webview and insert it seamlessly into your project.
- **Automatic Code Completion**: Receive intelligent, context-aware code suggestions as you type.
- **Project File Management**: Dynamically create and manage project files with AI assistance.
- **Multiple AI Providers**: Switch between AI models like OpenAI and Ollama with ease.
- **Modular Architecture**: Designed to support additional AI providers through a flexible framework.

## Installation

Install the AI Assistant Extension via the VS Code Marketplace or manually using a .vsix file.

### From VS Code Marketplace

1. Open Visual Studio Code.
2. Navigate to the Extensions view (Ctrl+Shift+X or Cmd+Shift+X on macOS).
3. Search for "AI Assistant".
4. Click **Install**.

### From .vsix File

1. Download the latest .vsix file from the [releases page]().
2. Open VS Code and go to the Extensions view.
3. Click the "..." menu at the top-right and select **Install from VSIX**.
4. Select the downloaded .vsix file and follow the prompts.

> **Note**: Replace the [releases page] link with the actual URL once available.

## Configuration

To get started, configure an AI provider and supply the necessary API keys.

1. Open VS Code settings (File > Preferences > Settings or Ctrl+,).
2. Search for "AI Assistant".
3. Choose your AI provider from the "Selected Provider" dropdown (e.g., "OpenAI" or "Ollama").
4. Enter the API key in the corresponding field (e.g., "OpenAI API Key").

Alternatively, use the command:
- Run AI Assistant: Select LLM Provider from the Command Palette (Ctrl+Shift+P) to select a provider dynamically.

## Usage

### Generating Code

1. Open a file in VS Code.
2. Access the Command Palette (Ctrl+Shift+P) and run **AI Assistant: Generate Code**.
3. Enter a prompt (e.g., "Write a Python function to reverse a string").
4. The AI generates code based on your prompt and the file’s language.
5. A webview displays the result, offering options to:
   - Insert code at the cursor.
   - Append code to the file.
   - Create a new file.
   - Discard the code.

### Reviewing and Inserting Code

After generating code, a webview panel opens for review. Use the provided buttons to:
- Insert the code into your current file.
- Save it as a new file.
- Reject it if it doesn’t meet your needs.

### Automatic Code Completion

1. While typing in a file, enter @ to trigger an AI suggestion.
2. The extension generates a completion based on the preceding context.
3. Press Tab or Enter to accept the suggestion, or keep typing to ignore it.

### Managing Project Files

When generating code, opt to "Create New File" in the webview:
- You’ll be prompted to name and save the file.
- The extension ensures safe operations by requiring confirmation before overwriting existing files.

## Examples

- **Generating a Function**: Prompt: "Write a function to calculate the factorial of a number in JavaScript". The AI generates the code, and you can insert it directly into your project.
- **Code Completion**: Type function sum(a, b) @ to get an AI suggestion like return a + b;.

> **Screenshots**: (To be added once available.)

## Contributing

We welcome contributions! To get involved:

1. Fork the repository.
2. Create a branch for your feature or bug fix (git checkout -b feature-name).
3. Commit your changes (git commit -m "Add feature X").
4. Push to your fork and submit a pull request.

Please adhere to the project’s coding standards and include tests where applicable.

## License

This extension is licensed under the Shiv@.

---
