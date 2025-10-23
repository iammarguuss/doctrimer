import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function getPdftoppmCmd() {
  if (process.env.PDFTOPPM_PATH) return process.env.PDFTOPPM_PATH;
  return process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm';
}

export function pdftoppmAvailable() {
  const cmd = getPdftoppmCmd();
  const res = spawnSync(cmd, ['-v'], { shell: true, stdio: 'ignore' });
  return res.status === 0;
}

/**
 * Конвертация первых pagesLimit страниц PDF → PNG через Poppler (pdftoppm).
 * Требует установленный Poppler и доступный в PATH (или переменную PDFTOPPM_PATH).
 */
export async function rasterizePdfToPngs(pdfPath, outDir, pagesLimit = 1, dpi = 200) {
  await fs.mkdir(outDir, { recursive: true });
  const base = path.join(outDir, path.basename(pdfPath, path.extname(pdfPath)));
  const prefix = base.replace(/\s+/g, '_');

  const args = ['-png', '-r', String(dpi), '-f', '1', '-l', String(pagesLimit), pdfPath, prefix];
  const cmd = getPdftoppmCmd();
  const res = spawnSync(cmd, args, { shell: true, stdio: 'inherit' });
  if (res.status !== 0) return [];

  const out = [];
  for (let i = 1; i <= pagesLimit; i++) {
    const f = `${prefix}-${i}.png`;
    try { await fs.access(f); out.push(f); } catch {}
  }
  return out;
}
