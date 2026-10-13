// Список звуковых файлов из assets/sounds (относительные пути без расширения -> расширение).
// Используется локальным сервером и сборкой: игра по этому списку понимает,
// какие звуки у неё есть, и не запрашивает несуществующие файлы.
import fs from 'node:fs';
import path from 'node:path';

const EXT = ['.mp3', '.ogg', '.wav'];

export function listSoundFiles(root) {
  const base = path.join(root, 'assets', 'sounds');
  const files = [];
  const walk = (dir, rel) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const r = rel ? rel + '/' + name : name;
      const st = fs.statSync(abs);
      if (st.isDirectory()) walk(abs, r);
      else if (EXT.includes(path.extname(name).toLowerCase())) files.push(r);
    }
  };
  walk(base, '');
  return files;
}
