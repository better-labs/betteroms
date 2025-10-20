import { readFile } from 'fs/promises';
import { createInterface } from 'readline';
import { logger } from '../../infrastructure/logging/logger.js';

const loaderLogger = logger.child({ module: 'input-loader' });

/**
 * Read data from stdin (piped input)
 *
 * @returns Promise that resolves with stdin content
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', (line) => {
      data += line + '\n';
    });

    rl.on('close', () => {
      resolve(data.trim());
    });

    rl.on('error', (err) => {
      reject(err);
    });

    // Handle case where stdin is immediately closed
    setTimeout(() => {
      if (data === '') {
        reject(new Error('No data received from stdin'));
      }
    }, 100);
  });
}

/**
 * Load input from file path or stdin
 *
 * Supports three input methods:
 * 1. File path: loadInput('./plan.json')
 * 2. Stdin (pipe): cat plan.json | node script.js
 * 3. Stdin (heredoc): node script.js <<EOF ... EOF
 *
 * @param filePath - Optional path to file
 * @returns Raw input string
 * @throws Error if no input provided or input cannot be read
 */
export async function loadInput(filePath?: string): Promise<string> {
  try {
    if (filePath) {
      // Method 1: Load from file path
      loaderLogger.debug({ filePath }, 'Loading input from file');
      const content = await readFile(filePath, 'utf-8');
      loaderLogger.debug(
        { filePath, size: content.length },
        'File loaded successfully'
      );
      return content.trim();
    } else if (!process.stdin.isTTY) {
      // Method 2 & 3: Load from stdin (piped or heredoc)
      loaderLogger.debug('Loading input from stdin');
      const content = await readStdin();
      loaderLogger.debug({ size: content.length }, 'Stdin loaded successfully');
      return content;
    } else {
      // No input provided
      throw new Error(
        'No input provided. Please provide a file path or pipe JSON to stdin.\n\n' +
          'Examples:\n' +
          '  pnpm run execute:trade-plan ./plan.json\n' +
          '  cat plan.json | pnpm run execute:trade-plan\n' +
          '  pnpm run execute:trade-plan <<EOF\n' +
          '  {"planId": "test-001", ...}\n' +
          '  EOF'
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      loaderLogger.error({ error: error.message }, 'Failed to load input');
      throw error;
    }
    throw new Error('Failed to load input: Unknown error');
  }
}

/**
 * Parse JSON input with helpful error messages
 *
 * @param input - Raw JSON string
 * @returns Parsed JSON object
 * @throws Error with detailed message if JSON is invalid
 */
export function parseJsonInput(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON format: ${error.message}\n\n` +
          `Please ensure your input is valid JSON.`
      );
    }
    throw error;
  }
}
