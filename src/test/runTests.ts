import * as path from 'path'

// eslint-disable-next-line node/no-unpublished-import
import { runTests } from 'vscode-test'

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../')

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite')

    const testWorkspace = path.resolve(__dirname, '../../')

    // Download VS Code, unzip it and run the integration test
    process.exitCode = await runTests({
      vscodeExecutablePath: '/usr/share/code/code',
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        testWorkspace + '/',
        '--disable-extensions',
        '--user-data-dir=/tmp',
      ],
    })
  } catch (err) {
    console.error('Failed to run tests')
    process.exitCode = 1
  }
}

main()
