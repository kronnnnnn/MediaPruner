const { spawn } = require('child_process');
const os = require('os');

// Determine the correct path to the Python executable based on the OS
const pythonExecutable = os.platform() === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';

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

// Spawn the child process
const child = spawn(pythonExecutable, args, { stdio: 'inherit' });

child.on('error', (error) => {
    console.error(`Failed to start backend: ${error}`);
    // You might want to check if the virtual environment exists or if python is installed.
    if (error.code === 'ENOENT') {
        console.error(`Error: The command '${pythonExecutable}' was not found.`);
        console.error('Please ensure that you have created a Python virtual environment at `./.venv` and that it is properly sourced or configured.');
    }
});

child.on('exit', (code, signal) => {
    if (code !== 0) {
        console.error(`Backend process exited with code ${code} and signal ${signal}`);
    }
});
