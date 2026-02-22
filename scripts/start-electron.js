const { spawn } = require('child_process');

const electronPath = require('electron');
const env = { ...process.env };
const extraArgs = process.argv.slice(2);
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.', ...extraArgs], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env
});

child.on('error', (error) => {
    console.error('Error iniciando Electron:', error);
    process.exit(1);
});

child.on('exit', (code, signal) => {
    if (signal) {
        process.exit(1);
        return;
    }
    process.exit(code ?? 0);
});
