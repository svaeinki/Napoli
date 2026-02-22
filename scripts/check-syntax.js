const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function collectJsFiles(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const absolutePath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectJsFiles(absolutePath));
            continue;
        }
        if (entry.isFile() && absolutePath.endsWith('.js')) {
            files.push(absolutePath);
        }
    }

    return files;
}

const targets = [
    path.join(rootDir, 'main.js'),
    ...collectJsFiles(path.join(rootDir, 'src'))
].sort((a, b) => a.localeCompare(b));

let hasError = false;

for (const filePath of targets) {
    const result = spawnSync(process.execPath, ['--check', filePath], {
        stdio: 'inherit'
    });

    if (result.status !== 0) {
        hasError = true;
        break;
    }
}

if (hasError) {
    process.exit(1);
}

console.log(`Checked syntax for ${targets.length} JS files.`);
