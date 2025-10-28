import { spawn } from 'node:child_process';

/** Запуск команды и сбор stdout/stderr */
export async function run(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: false, windowsHide: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', d => (stdout += d.toString()));
    child.stderr?.on('data', d => (stderr += d.toString()));
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.on('error', err => resolve({ code: -1, stdout, stderr: String(err) }));
  });
}

export async function existsOnPath(exe, verArgs = ['-v']) {
  const r = await run(exe, verArgs);
  return r.code === 0 || /version/i.test((r.stdout||'') + (r.stderr||''));
}
