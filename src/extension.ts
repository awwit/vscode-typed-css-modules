// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// @ts-ignore
import * as less from 'less';
// @ts-ignore
import * as sass from 'node-sass';

// @ts-ignore
import * as DtsCreator from 'typed-css-modules';
import * as fs from 'fs';


let creator = new DtsCreator();

async function renderLess(code: string) {
  const output = await less.render(code);
  return output.css;
}

async function renderScss(code: string) {
  return sass.renderSync(code);
}

async function renderTypedFile(css: string) {
  const content = await creator.create('', css);
  const typedCode = content.formatted;
  return typedCode as string;
}

async function writeFile(path: string, content: string) {
  return new Promise(r => {
    fs.writeFile(path, content, 'utf-8', r);
  });
}

async function processDocument(document: vscode.TextDocument, force: boolean = false) {
    const splitArray = document.fileName.split('.');
    const extname = splitArray.pop();
    
    if (!extname) {
      return;
    }
    if (['less', 'css', 'scss'].indexOf(extname) === -1) {
      if (force) {
        vscode.window.showInformationMessage('Typed CSS Modules only support .less/.css/.scss');
      }
      return;
    }

    const content = document.getText();

    const TYPE_REGEX = /[\s\/\/\*]*@type/;

    if (!TYPE_REGEX.test(content)) { 
      if (force) {
        vscode.window.showInformationMessage('Typed CSS Modules require `// @type` or `/* @type */` ahead of file');
      }
      return;
    }
    
    const fullUri = document.uri.path;

    async function typedCss(cssCode: string) {
      const typedCode = await renderTypedFile(cssCode);
      const outputPath = fullUri.replace(new RegExp(extname + '$'), extname + '.d.ts');
      await writeFile(outputPath, typedCode);
      if (force) {
        vscode.window.showInformationMessage('Write typed to:' + outputPath);
      }
    }

    let cssCode;

    if (extname === 'less') {
      cssCode = await renderLess(content);
    } else if (extname === 'css') {
      cssCode = content;
    } else if (extname === 'scss') {
      cssCode = renderScss(content);
    }

    if (cssCode) {
      await typedCss(cssCode);
    }
}


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
    processDocument(document);
  });

	let disposable = vscode.commands.registerCommand('extension.cssModuleTyped', () => {
		if (vscode.window.activeTextEditor) {
			const document = vscode.window.activeTextEditor.document;
			processDocument(document, true);
		}
  });

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
