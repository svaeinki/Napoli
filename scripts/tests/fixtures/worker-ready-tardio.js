// Worker de prueba: anuncia 'ready' después del timeout de arranque del DBService.
const { parentPort, workerData } = require('worker_threads');

setTimeout(() => {
    parentPort.postMessage({ type: 'ready' });
}, (workerData && workerData.readyDelayMs) || 300);

parentPort.on('message', () => {});
