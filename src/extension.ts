// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// @ts-ignore
import * as fs from 'fs';
// @ts-ignore

function requireg(packageName) {
  var childProcess = require('child_process');
  var path = require('path');
  var fs = require('fs');

  var globalNodeModules = childProcess.execSync('npm root -g').toString().trim();
  var packageDir = path.join(globalNodeModules, packageName);
  if (!fs.existsSync(packageDir)) {
    packageDir = path.join(globalNodeModules, 'npm/node_modules', packageName);
  } //find package required by old npm

  if (!fs.existsSync(packageDir)) {
    throw new Error('vscode-typed-css-modules: Cannot find global module \'' + packageName + '\'');
  }

  var packageMeta = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json')).toString());
  var main = path.join(packageDir, packageMeta.main);

  return require(main);
}

async function renderLess(code: string) {
  const less = requireg('less');
  const output = await less.render(code);
  return output.css;
}

async function renderScss(code: string) {
  const sass = requireg('sass');
  return sass.renderSync(code);
}

async function renderTypedFile(css: string) {
  const DtsCreator = requireg('typed-css-modules');
  let creator = DtsCreator.hasOwnProperty('default') ? new DtsCreator.default() : new DtsCreator();
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
  try {
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
    

    async function typedCss(cssCode: string) {
      const typedCode = await renderTypedFile(cssCode);
      const outputPath = document.uri.fsPath + '.d.ts';
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
  } catch (e) {
    vscode.window.showWarningMessage(e.toString());
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
