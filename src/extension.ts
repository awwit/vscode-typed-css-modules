import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

import { isFileEqualBuffer } from 'is-file-equal-buffer'

import { resolveLocal, getWorkspacePath } from './utils'

function getGlobalNodeModules(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const childProcess: typeof import('child_process') = require('child_process')

  const isYarn: boolean =
    vscode.workspace.getConfiguration('npm').get<string>('packageManager') ===
    'yarn'

  let modulesPath = childProcess
    .execSync(isYarn ? 'yarn global dir' : 'npm root -g')
    .toString()
    .trim()

  if (isYarn) {
    modulesPath = path.join(modulesPath, 'node_modules')
  }

  return modulesPath
}

function requireGlobal<T>(packageName: string): T
function requireGlobal<T>(packageName: string, required: false): T | null

function requireGlobal<T>(packageName: string, required = true): T | null {
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

interface LessRenderOutput {
  css: string
}

let less: typeof import('less') | null = null

function renderLess(content: string): Promise<string> {
  if (less === null) {
    less = requireGlobal<typeof import('less')>('less')
  }

  return less
    .render(content)
    .then(function onfulfilled({ css }: LessRenderOutput) {
      return css
    })
}

let sass: typeof import('sass') | null = null

function renderScss(
  content: string,
  indentedSyntax: boolean,
  root: string
): string {
  if (sass === null) {
    sass = requireGlobal<typeof import('sass')>('sass')
  }

  /** @see https://github.com/sass/dart-sass#javascript-api */
  return sass
    .renderSync({
      data: content,
      indentedSyntax,
      includePaths: [root],
    })
    .css.toString('utf8')
}

let stylus: typeof import('stylus') | null = null

function renderStylus(content: string, root: string): Promise<string> {
  if (stylus === null) {
    stylus = requireGlobal<typeof import('stylus')>('stylus')
  }

  return new Promise<string>(function executor(resolve, reject): void {
    stylus?.(content)
      .set('paths', [root]) // This is needed for "@require" paths to be resolved.
      .render(function callback(err: Error, css: string): void {
        err ? reject(err) : resolve(css)
      })
  })
}

function isEslintEnable(): boolean {
  return (
    vscode.workspace
      .getConfiguration('typed-css-modules')
      .get<boolean>('eslint.enable') ?? true
  )
}

type DtsCreator = import('typed-css-modules').default

interface DtsCreatorConstructor {
  new (): DtsCreator
}

let dtsCreator: DtsCreator | null = null

type Eslint = typeof import('eslint')

/**
 * Search once
 */
let eslintSearch = false

let eslintEngine: import('eslint').ESLint | null = null

function renderTypedFile(css: string, filePath: string): Promise<Buffer> {
  if (dtsCreator === null) {
    const DtsCreator =
      requireGlobal<typeof import('typed-css-modules')>('typed-css-modules')

    const Factory: DtsCreatorConstructor = Object.prototype.hasOwnProperty.call(
      DtsCreator,
      'default'
    )
      ? DtsCreator.default
      : (DtsCreator as unknown as DtsCreatorConstructor)

    dtsCreator = new Factory()
  }

  if (isEslintEnable() && !eslintSearch && eslintEngine === null) {
    const eslint = requireGlobal<Eslint>('eslint', false)

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
        eslintEngine = new eslint.ESLint({
          cwd: workspace,
          extensions: ['.ts'],
          overrideConfigFile: configFile,
          fix: true,
        })
      } catch (err) {
        // noop
      }
    }
  }

  return dtsCreator
    .create('', css)
    .then(function onfulfilled({ formatted }) {
      if (eslintEngine !== null) {
        // eslint-disable-next-line promise/no-nesting
        return eslintEngine
          .lintText(formatted, { filePath })
          .then(function onfulfilled(result) {
            if (result.length > 0 && result[0].output) {
              return result[0].output
            }

            return formatted
          })
      }

      return formatted
    })
    .then(function onfulfilled(formatted) {
      return Buffer.from(formatted, 'utf8')
    })
}

function writeFile(path: string, buffer: Buffer): Promise<void> {
  return isFileEqualBuffer(path, buffer).then(function isEqual(isEqual) {
    return !isEqual
      ? fs.promises.writeFile(path, buffer, { flag: 'w' })
      : undefined
  })
}

function typedCss(
  cssCode: string,
  document: vscode.TextDocument,
  force: boolean
): Promise<void> {
  const outputPath = document.uri.fsPath + '.d.ts'

  return renderTypedFile(cssCode, outputPath)
    .then(function onfulfilled(typedCode) {
      return writeFile(outputPath, typedCode)
    })
    .then(function onfulfilled() {
      if (force) {
        vscode.window.showInformationMessage('Write typed to: ' + outputPath)
      }

      return undefined
    })
}

function getExtFromPath(fileName: string): string {
  const pos = fileName.lastIndexOf('.')

  if (pos === -1) {
    return ''
  }

  return fileName.slice(pos + 1)
}

async function getCssContent(
  extname: string,
  source: string,
  root: string
): Promise<string> {
  switch (extname) {
    case 'css':
      return source

    case 'less':
      return renderLess(source)

    case 'scss':
    case 'sass':
      return renderScss(source, extname === 'sass', root)

    case 'styl':
      return renderStylus(source, root)

    default:
      return ''
  }
}

const supportCss: readonly string[] = [
  'css',
  'less',
  'scss',
  'sass',
  'styl',
] as const

const TYPE_REGEX = /[\s//*]*@type/

async function processDocument(
  document: vscode.TextDocument,
  force = false
): Promise<void> {
  try {
    const extname = getExtFromPath(document.fileName).toLowerCase()

    if (extname === '') {
      return
    }

    if (!supportCss.includes(extname)) {
      if (force) {
        vscode.window.showInformationMessage(
          'Typed CSS Modules only support .less/.css/.scss/.sass/.styl'
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

    const cssCode = await getCssContent(
      extname,
      content,
      path.dirname(document.fileName)
    )

    if (cssCode) {
      await typedCss(cssCode, document, force)
    }
  } catch (err) {
    vscode.window.showWarningMessage(`${err}`)
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
  stylus = null
  less = null
  sass = null
}
