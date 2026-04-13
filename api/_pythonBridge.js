/**
 * Python Analytics Bridge
 * Handles subprocess execution of Python analytics functions
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PYTHON_DIR = path.join(__dirname, '..', 'python');
const ANALYTICS_MODULE = path.join(PYTHON_DIR, 'analytics');

/**
 * Execute Python analytics function
 * @param {string} functionName - Name of the function to call
 * @param {object} data - Data to pass to Python (will be JSON serialized)
 * @returns {Promise<object>} - Parsed JSON result from Python
 */
async function executePythonAnalytics(functionName, data) {
  return new Promise((resolve, reject) => {
    const analyticsScript = path.join(ANALYTICS_MODULE, 'run_analytics.py');
    
    // Check if Python is available
    const python = spawn('python3', [
      analyticsScript,
      functionName,
      JSON.stringify(data)
    ], {
      cwd: PYTHON_DIR,
      timeout: 120000, // 2 minute timeout
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error('[Python Analytics] Error:', data.toString());
    });

    python.on('error', (error) => {
      reject(new Error(`Failed to execute Python: ${error.message}`));
    });

    python.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${e.message}`));
        }
      } else {
        reject(new Error(`Python script failed with code ${code}: ${stderr}`));
      }
    });
  });
}

module.exports = {
  executePythonAnalytics,
};
