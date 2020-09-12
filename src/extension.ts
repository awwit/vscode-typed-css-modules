// eslint-disable-next-line node/no-unpublished-import
import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

import { isFileEqualBuffer } from 'is-file-equal-buffer'

import { resolveLocal, getWorkspacePath } from './utils'

function getGlobalNodeModules(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const childProcess: typeof import('child_process') = require('child_process')

  const isYarn =
    vscode.workspace.getConfiguration('npm').get<string>('packageManager') ===
    'yarn'

  return childProcess
    .execSync(isYarn ? 'yarn global dir' : 'npm root -g')
    .toString()
    .trim()
}

function requireg<T>(packageName: string): T
function requireg<T>(packageName: string, required: false): T | null

function requireg<T>(packageName: string, required = true): T | null {
  let packageDir = resolveLocal(packageName)

  if (!packageDir) {
    const globalNodeModules = getGlobalNodeModules()

    packageDir = path.join(globalNodeModules, packageName)

    if (!fs.existsSync(packageDir)) {
      if (required) {
        throw new Error(
          `vscode-typed-css-modules: Cannot find global module '${packageName}'`
        )
      } else {
        return null
      }
    }
  }

  return require(packageDir)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let less: any = null

async function renderLess(code: string): Promise<string> {
  if (less === null) {
    less = requireg('less')
  }

  const output = await less.render(code)

  return output.css
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sass: any = null

function renderScss(code: string): string {
  if (sass === null) {
    sass = requireg('node-sass')
  }

  // @see https://github.com/sass/dart-sass#javascript-api
  return sass.renderSync(code)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stylus: any = null

async function renderStylus(code: string, root: string): Promise<string> {
  if (stylus === null) {
    stylus = requireg('stylus')
  }

  return await new Promise(resolve => {
    stylus(code)
      .set('paths', [root]) // This is needed for "@require" paths to be resolved.
      .render((err: Error, css: string) =>
      {
        if(err) throw err;

        resolve(css);
      });
  });
}

type DtsCreator = import('typed-css-modules').default

let dtsCreator: DtsCreator | null = null

type Eslint = typeof import('eslint')

/**
 * Search once
 */
let eslintSearch = false

let eslintEngine: import('eslint').CLIEngine | null = null

function renderTypedFile(css: string, filePath: string): Promise<Buffer> {
  if (dtsCreator === null) {
    const DtsCreator = requireg<typeof import('typed-css-modules')>(
      'typed-css-modules'
    )

    const Factory: {
      new (): DtsCreator
    } = Object.prototype.hasOwnProperty.call(DtsCreator, 'default')
      ? DtsCreator.default
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (DtsCreator as any)

    dtsCreator = new Factory()
  }

  if (!eslintSearch && eslintEngine === null) {
    const eslint = requireg<Eslint>('eslint', false)

    eslintSearch = true

    if (eslint !== null) {
      const workspace = getWorkspacePath(filePath)

      let configFile = vscode.workspace
        .getConfiguration('eslint.options')
        .get<string>('configFile')

      if (configFile !== undefined && !path.isAbsolute(configFile)) {
        configFile = path.resolve(workspace, configFile)
      }

      try {
        eslintEngine = new eslint.CLIEngine({
          cwd: workspace,
          extensions: ['.ts'],
          configFile,
          fix: true,
        })
      } catch {}
    }
  }

  return dtsCreator.create('', css).then(function ({ formatted }) {
    if (eslintEngine !== null) {
      try {
        const report = eslintEngine.executeOnText(formatted, filePath);
        if(report.results[0])
          formatted = report.results[0].output as string;
      } catch(error) {}
    }

    return Buffer.from(formatted, 'utf-8')
  })
}

function writeFile(path: string, buffer: Buffer): Promise<void> {
  return isFileEqualBuffer(path, buffer).then(function isEqual(isEqual) {
    return !isEqual
      ? new Promise(function executor(resolve, reject) {
          fs.writeFile(path, buffer, { flag: 'w' }, function result(err) {
            err ? reject(err) : resolve()
          })
        })
      : undefined
  })
}

async function typedCss(
  cssCode: string,
  document: vscode.TextDocument,
  force: boolean
): Promise<void> {
  const outputPath = document.uri.fsPath + '.d.ts'

  const typedCode = await renderTypedFile(cssCode, outputPath)

  await writeFile(outputPath, typedCode)

  if (force) {
    vscode.window.showInformationMessage('Write typed to: ' + outputPath)
  }
}

function getExtFromPath(fileName: string): string {
  const pos = fileName.lastIndexOf('.')

  if (pos === -1) {
    return ''
  }

  return fileName.slice(pos + 1)
}

async function getCssContent(extname: string, source: string, root: string): Promise<string> {
  switch (extname) {
    case 'css':
      return source

    case 'less':
      return renderLess(source)

    case 'scss':
      return renderScss(source)

    case 'styl':
      return renderStylus(source, root)

    default:
      return ''
  }
}

const supportCss = ['css', 'less', 'scss', 'styl']

const TYPE_REGEX = /[\s//*]*@type/

async function processDocument(
  document: vscode.TextDocument,
  force = false
): Promise<void> {
  try {
    const extname = getExtFromPath(document.fileName)

    if (extname === '') {
      return
    }

    if (!supportCss.includes(extname)) {
      if (force) {
        vscode.window.showInformationMessage(
          'Typed CSS Modules only support .less/.css/.scss/.styl'
        )
      }

      return
    }

    const content = document.getText()

    if (!TYPE_REGEX.test(content)) {
      if (force) {
        vscode.window.showInformationMessage(
          'Typed CSS Modules require `// @type` or `/* @type */` ahead of file'
        )
      }

      return
    }

    const cssCode = await getCssContent(extname, content, path.dirname(document.fileName))

    if (cssCode) {
      await typedCss(cssCode, document, force)
    }
  } catch (e) {
    vscode.window.showWarningMessage(e.toString())
  }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): void {
  const didSave = vscode.workspace.onDidSaveTextDocument(
    function onDidSaveTextDocument(document: vscode.TextDocument) {
      processDocument(document)
    }
  )

  const registerCommand = vscode.commands.registerCommand(
    'extension.cssModuleTyped',
    function command() {
      if (vscode.window.activeTextEditor !== undefined) {
        const document = vscode.window.activeTextEditor.document
        processDocument(document, true)
      }
    }
  )

  context.subscriptions.push(didSave, registerCommand)
}

// this method is called when your extension is deactivated
export function deactivate(): void {
  eslintSearch = false
  eslintEngine = null
  dtsCreator = null
  less = null
  sass = null
}
