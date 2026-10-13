// Сборка архива для Яндекс Игр: dist/space-commander.zip
// Запуск:  node tools/build.mjs   (или npm run build)
//
// В архив попадают только файлы игры: index.html, css/, js/, assets/.
// index.html лежит в корне архива, пути внутри — с прямыми слэшами
// (архив из «Сжать в ZIP» Windows/PowerShell 5 бывает с обратными — Яндекс его не примет).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'space-commander.zip');

const INCLUDE = ['index.html', 'css', 'js', 'assets'];
// Служебное, что не должно попасть в релиз
const EXCLUDE = [
  'js/code',                 // заметки с читами для localStorage
  'assets/models/manifest.json'
];
const LIMIT_MB = 100;

function walk(rel, out) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const st = fs.statSync(abs);
  const relPosix = rel.split(path.sep).join('/');
  if (EXCLUDE.includes(relPosix)) return;
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(abs)) {
      if (name.startsWith('.')) continue;
      walk(path.join(rel, name), out);
    }
  } else {
    out.push(relPosix);
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosTime(new Date());

  for (const rel of files) {
    const data = fs.readFileSync(path.join(ROOT, rel));
    const crc = crc32(data);
    // mp3/glb уже сжаты — храним как есть, остальное — deflate
    const already = /\.(mp3|ogg|png|jpe?g|webp|glb)$/i.test(rel);
    const deflated = already ? null : zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated && deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const name = Buffer.from(rel, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);          // имена в UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, body);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(time, 12);
    cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);

    offset += local.length + name.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

const files = [];
for (const item of INCLUDE) walk(item, files);

// Проверка: файлы, на которые ссылается код, должны существовать с тем же регистром
// (сервер Яндекса различает SCV.glb и scv.glb)
const missing = [];
for (const rel of files.filter((f) => f.endsWith('.js') && !f.includes('three.module'))) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of src.matchAll(/['"](assets\/[^'"]+\.(?:mp3|glb|png|jpg))['"]/g)) {
    if (!files.includes(m[1])) missing.push(`${rel}: ${m[1]}`);
  }
}
if (missing.length) {
  console.warn('⚠️ Код ссылается на файлы, которых нет в архиве:');
  for (const m of missing) console.warn('   ' + m);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const zip = buildZip(files);
fs.writeFileSync(OUT, zip);

const mb = zip.length / 1024 / 1024;
console.log(`✅ ${path.relative(ROOT, OUT)} — ${files.length} файлов, ${mb.toFixed(1)} МБ`);
if (mb > LIMIT_MB) console.warn(`⚠️ Архив больше ${LIMIT_MB} МБ — Яндекс его не примет`);
