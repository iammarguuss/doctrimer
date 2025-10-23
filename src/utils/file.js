import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function sha256File(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function copyToObjects(filePath, objectsDir, id, ext) {
  const dst = path.join(objectsDir, `${id}${ext}`);
  await fs.cp(filePath, dst, { force: true });
  return dst;
}
