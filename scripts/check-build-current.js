const { spawnSync } = require('child_process');

function resolveBuildCommand(platform) {
    if (platform === 'darwin') {
        return ['npm', ['run', 'build-mac', '--', '--publish', 'never']];
    }
    if (platform === 'win32') {
        return ['npm.cmd', ['run', 'build-win', '--', '--publish', 'never']];
    }
    if (platform === 'linux') {
        return ['npm', ['run', 'build-linux', '--', '--publish', 'never']];
    }
    return null;
}

const command = resolveBuildCommand(process.platform);
if (!command) {
    console.error(`Unsupported platform for build check: ${process.platform}`);
    process.exit(1);
}

const [bin, args] = command;
const result = spawnSync(bin, args, {
    stdio: 'inherit',
    cwd: process.cwd()
});

if (result.status !== 0) {
    process.exit(result.status || 1);
}
