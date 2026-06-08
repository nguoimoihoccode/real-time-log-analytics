import fs from 'node:fs';

export function tailFile(path: string, onLine: (line: string) => void): void {
  let position = fs.existsSync(path) ? fs.statSync(path).size : 0;
  let pending = '';

  fs.watchFile(path, { interval: 500 }, () => {
    if (!fs.existsSync(path)) return;

    const size = fs.statSync(path).size;
    if (size < position) {
      position = 0;
      pending = '';
    }
    if (size === position) return;

    const stream = fs.createReadStream(path, { start: position, end: size - 1, encoding: 'utf8' });
    let buffer = '';

    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      pending = lines.pop() ?? '';
      buffer = pending;

      for (const line of lines) {
        if (line.trim()) onLine(line);
      }
    });

    stream.on('end', () => {
      position = pending ? size - Buffer.byteLength(pending) : size;
    });
  });
}
