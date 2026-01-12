const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');

// Determine the correct path to the Python executable based on the OS and whether
// a local .venv exists. Fall back to the system `python` if the venv is not present.
let pythonExecutable = os.platform() === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
if (!fs.existsSync(pythonExecutable)) {
    pythonExecutable = 'python';
}

// Command arguments
const args = [
    '-m',
    'uvicorn',
    'app.main:app',
    '--reload',
    '--host',
    '0.0.0.0',
    '--port',
    '8000',
    '--app-dir',
    'backend'
];

// Start child process with a simple restart loop so file-watch reloads don't
// leave the overall dev runner stopped on Windows (Terminate batch job prompts).
let child = null;
let restarting = false;

function startChild() {
    child = spawn(pythonExecutable, args, { stdio: 'inherit', shell: true });

    child.on('error', (error) => {
        console.error(`Failed to start backend: ${error}`);
        if (error.code === 'ENOENT') {
            console.error(`Error: The command '${pythonExecutable}' was not found.`);
            console.error('Ensure you have a Python virtual environment at `./.venv` or update the script to point to your python.');
        }
    });

    child.on('exit', (code, signal) => {
        if (restarting) return;
        console.error(`Backend process exited with code ${code} and signal ${signal}`);
        // When uvicorn --reload triggers a restart it will exit the process; wait a bit
        // and then restart the child so the overall dev script continues running.
        restarting = true;
        setTimeout(() => {
            restarting = false;
            console.error('Restarting backend process...');
            startChild();
        }, 500);
    });
}

startChild();
