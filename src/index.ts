import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

// Status bar item
let nodeVersionStatusBarItem: vscode.StatusBarItem;
// Output channel for logging
let outputChannel: vscode.OutputChannel;
// Last detected version
let lastVersion: string = '';
// Flag for terminal busy state
let isTerminalBusy: boolean = false;

// Get Node.js version
function getNodeVersion(): Promise<string> {
  return new Promise((resolve) => {
    try {
      // Use synchronous method to get Node.js version
      const version = cp.execSync('node --version', { encoding: 'utf8' });
      const trimmedVersion = version.trim();
      outputChannel.appendLine(`Node.js version detected: ${trimmedVersion}`);
      resolve(trimmedVersion);
    } catch (error) {
      outputChannel.appendLine(`Failed to get Node.js version: ${error}`);
      resolve('Unknown');
    }
  });
}

// Update status bar display
async function updateNodeVersionDisplay(forceUpdate: boolean = false): Promise<void> {
  const version = await getNodeVersion();
  
  // Only update status bar when version changes or force update
  if (version !== lastVersion || forceUpdate) {
    lastVersion = version;
    
    if (nodeVersionStatusBarItem) {
      // Use VSCode built-in icon
      nodeVersionStatusBarItem.text = `$(versions) ${version}`;
      nodeVersionStatusBarItem.tooltip = `Node.js version: ${version}`;
      nodeVersionStatusBarItem.show();
      outputChannel.appendLine(`Status bar updated to: ${version}`);
    } else {
      outputChannel.appendLine('Status bar item not initialized');
    }
  }
}

// Add terminal command monitoring (using polling instead of onDidWritePty)
function setupVersionMonitoring(context: vscode.ExtensionContext): void {
  // Create limited frequency polling
  const pollInterval = 2000; // Check every 2 seconds, low performance impact
  
  // Save running timer ID
  let pollTimerId: NodeJS.Timeout | null = null;
  
  // Start polling check 
  function startPolling() {
    if (pollTimerId !== null) {
      return; // Already polling
    }
    
    // Set polling interval
    pollTimerId = setInterval(async () => {
      // Avoid too frequent execution
      if (!isTerminalBusy) {
        await updateNodeVersionDisplay();
      }
    }, pollInterval);
    
    // Ensure cleanup
    context.subscriptions.push({ 
      dispose: () => {
        if (pollTimerId !== null) {
          clearInterval(pollTimerId);
          pollTimerId = null;
        }
      }
    });
    
    outputChannel.appendLine('Started polling for Node.js version changes');
  }
  
  // Listen for terminal creation events - as hint for possible version changes
  context.subscriptions.push(
    vscode.window.onDidOpenTerminal(() => {
      outputChannel.appendLine('Terminal opened, possible version change');
    })
  );
  
  // Listen for terminal close events - as hint for possible version changes
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal(() => {
      outputChannel.appendLine('Terminal closed, checking version changes');
      // After terminal closes, command might have completed, check version
      isTerminalBusy = true;
      setTimeout(() => {
        updateNodeVersionDisplay(true);
        isTerminalBusy = false;
      }, 500);
    })
  );
  
  // Start polling
  startPolling();
}

// Extension activation function
export function activate(context: vscode.ExtensionContext) {
  // Create output channel
  outputChannel = vscode.window.createOutputChannel('NodeJS Version');
  outputChannel.appendLine('NodeJS Version extension activating...');
  
  try {
    // Create status bar item with highest priority to ensure display
    nodeVersionStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      9999
    );
    nodeVersionStatusBarItem.name = 'Node.js Version';
    
    // Associate refresh command with status bar item
    nodeVersionStatusBarItem.command = 'nodejs-version.refresh';
    
    context.subscriptions.push(nodeVersionStatusBarItem);
    outputChannel.appendLine('Status bar item created successfully');
    
    // Update immediately
    updateNodeVersionDisplay(true).then(() => {
      outputChannel.appendLine('Initial status bar update completed');
    });
    
    // Setup version monitoring
    setupVersionMonitoring(context);
    
    // Refresh on window focus change
    const focusListener = vscode.window.onDidChangeWindowState(e => {
      if (e.focused && !isTerminalBusy) {
        outputChannel.appendLine('Window gained focus, refreshing version');
        updateNodeVersionDisplay();
      }
    });
    context.subscriptions.push(focusListener);
    
    // Register refresh command
    const refreshCommand = vscode.commands.registerCommand('nodejs-version.refresh', () => {
      outputChannel.appendLine('Manually refreshing Node.js version');
      updateNodeVersionDisplay(true);
      vscode.window.showInformationMessage('Node.js version has been refreshed');
    });
    context.subscriptions.push(refreshCommand);
    
    // Refresh on workspace changes
    const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      outputChannel.appendLine('Workspace changed, refreshing version');
      updateNodeVersionDisplay();
    });
    context.subscriptions.push(workspaceListener);
    
    outputChannel.appendLine('Extension activation completed');
  } catch (error) {
    outputChannel.appendLine(`Extension activation error: ${error}`);
    vscode.window.showErrorMessage(`NodeJS Version extension activation failed: ${error}`);
  }
}

// Extension deactivation function
export function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine('NodeJS Version extension deactivating');
    outputChannel.dispose();
  }
  
  if (nodeVersionStatusBarItem) {
    nodeVersionStatusBarItem.dispose();
  }
}
