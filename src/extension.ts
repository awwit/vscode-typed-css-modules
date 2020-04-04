import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

import { resolveLocal, getWorkspacePath, isFileEqualBuffer } from './utils'

function requireg<T>(packageName: string): T
function requireg<T>(packageName: string, required: false): T | null

function requireg<T>(packageName: string, required = true): T | null {
  let packageDir = resolveLocal(packageName)

  if (!packageDir) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const childProcess = require('child_process')

    const isYarn =
      vscode.workspace.getConfiguration('npm').get<string>('packageManager') ===
      'yarn'

    const globalNodeModules = childProcess
      .execSync(isYarn ? 'yarn global dir' : 'npm root -g')
      .toString()
      .trim()

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
  if (less === undefined) {
    less = requireg('less')
  }

  const output = await less.render(code)

  return output.css
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sass: any = null

function renderScss(code: string): string {
  if (sass === undefined) {
    sass = requireg('node-sass')
  }

  // @see https://github.com/sass/dart-sass#javascript-api
  return sass.renderSync(code)
}

type DtsCreator = import('typed-css-modules').default

let dtsCreator: DtsCreator | null = null

type Eslint = typeof import('eslint')

/**
 * Search once
 */
let eslintSearch = false

let eslintEngine: import('eslint').CLIEngine | null = null

function renderTypedFile(css: string, path: string): Promise<Buffer> {
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
      eslintEngine = new eslint.CLIEngine({
        cwd: getWorkspacePath(path),
        extensions: ['.ts'],
        fix: true,
      })
    }
  }

  return dtsCreator.create('', css).then(function({ formatted }) {
    if (eslintEngine !== null) {
      const report = eslintEngine.executeOnText(formatted, path)

      return Buffer.from(report.results[0].output || formatted, 'utf-8')
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

async function getCssContent(extname: string, source: string): Promise<string> {
  switch (extname) {
    case 'css':
      return source

    case 'less':
      return renderLess(source)

    case 'scss':
      return renderScss(source)

    default:
      return ''
  }
}

const supportCss = ['css', 'less', 'scss']

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
          'Typed CSS Modules only support .less/.css/.scss'
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

    const cssCode = await getCssContent(extname, content)

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
  vscode.workspace.onDidSaveTextDocument(function onDidSaveTextDocument(
    document: vscode.TextDocument
  ) {
    processDocument(document)
  })

  const disposable = vscode.commands.registerCommand(
    'extension.cssModuleTyped',
    function command() {
      if (vscode.window.activeTextEditor !== undefined) {
        const document = vscode.window.activeTextEditor.document
        processDocument(document, true)
      }
    }
  )

  context.subscriptions.push(disposable)
}

// this method is called when your extension is deactivated
export function deactivate(): void {
  eslintSearch = false
  eslintEngine = null
  dtsCreator = null
  less = null
  sass = null
}
