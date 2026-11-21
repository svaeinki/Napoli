const { spawnSync } = require('child_process');

function resolveBuildCommand(platform) {
    if (platform === 'darwin') {
        return ['yarn', ['run', 'build-mac', '--publish', 'never']];
    }
    if (platform === 'win32') {
        return ['yarn.cmd', ['run', 'build-win', '--publish', 'never']];
    }
    if (platform === 'linux') {
        return ['yarn', ['run', 'build-linux', '--publish', 'never']];
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
    cwd: process.cwd(),
    // Desde Node 20.12, ejecutar un .cmd en Windows requiere shell (si no, EINVAL).
    shell: process.platform === 'win32'
});

if (result.status !== 0) {
    process.exit(result.status || 1);
}
