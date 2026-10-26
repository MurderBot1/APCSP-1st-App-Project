const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '.localdb');
const install = fs.readdirSync(root).find((name) => name.startsWith('mariadb-'));
if (!install) {
    console.error('No MariaDB found in .localdb. See README for setup.');
    process.exit(1);
}

const server = spawn(
    path.join(root, install, 'bin', 'mariadbd.exe'),
    [`--defaults-file=${path.join(root, 'data', 'my.ini')}`, '--bind-address=127.0.0.1', '--console'],
    { stdio: 'inherit' }
);
server.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => server.kill());
