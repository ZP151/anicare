import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [, , parentPidFile, grandchildPidFile, mode = 'parent'] = process.argv;

function resistTermination() {
  process.on('SIGTERM', () => undefined);
  setInterval(() => undefined, 1_000);
}

if (mode === 'grandchild') {
  writeFileSync(grandchildPidFile, String(process.pid), { encoding: 'utf8', flag: 'wx' });
  resistTermination();
} else {
  writeFileSync(parentPidFile, String(process.pid), { encoding: 'utf8', flag: 'wx' });
  spawn(process.execPath, [import.meta.filename, parentPidFile, grandchildPidFile, 'grandchild'], {
    detached: false,
    shell: false,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
  resistTermination();
}
