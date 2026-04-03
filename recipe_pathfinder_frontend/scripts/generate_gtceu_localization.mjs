import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, '..');
const defaultJarPath = resolve(frontendRoot, '..', 'gtceu-1.20.1-7.5.2', 'gtceu-1.20.1-7.5.2.jar');
const jarPath = defaultJarPath;
const outputPath = resolve(frontendRoot, 'src/generated/gtceuZhCn.generated.json');
const langEntryPath = 'assets/gtceu/lang/zh_cn.json';

const zhCnJson = readZipEntryAsUtf8(jarPath, langEntryPath);
const source = JSON.parse(zhCnJson);
const localizedEntries = new Map();

appendEntriesIfAbsent(localizedEntries, source, 'block.gtceu.', 'gtceu:');
appendEntriesIfAbsent(localizedEntries, source, 'item.gtceu.', 'gtceu:');
appendEntriesIfAbsent(localizedEntries, source, 'material.gtceu.', 'gtceu:', 'forge:');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(
    Object.fromEntries(localizedEntries),
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(`Generated ${localizedEntries.size} localized entries`);

function stripMinecraftFormatting(value) {
  return value.replace(/\u00a7./g, '').trim();
}

function appendEntriesIfAbsent(entries, source, prefix, targetPrefix, optionalSecondaryTargetPrefix) {
  const keys = Object.keys(source)
    .filter((key) => key.startsWith(prefix))
    .sort((left, right) => left.localeCompare(right));

  for (const key of keys) {
    const value = stripMinecraftFormatting(String(source[key]));
    const suffix = key.slice(prefix.length);
    const targetKey = `${targetPrefix}${suffix}`;
    if (!entries.has(targetKey)) {
      entries.set(targetKey, value);
    }

    if (optionalSecondaryTargetPrefix) {
      const secondaryTargetKey = `${optionalSecondaryTargetPrefix}${suffix}`;
      if (!entries.has(secondaryTargetKey)) {
        entries.set(secondaryTargetKey, value);
      }
    }
  }
}

function readZipEntryAsUtf8(zipPath, entryPath) {
  const zipBuffer = readFileSync(zipPath);
  const entry = findZipEntry(zipBuffer, entryPath);

  if (entry.compressionMethod === 0) {
    return zipBuffer
      .subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize)
      .toString('utf8');
  }

  if (entry.compressionMethod === 8) {
    const compressed = zipBuffer.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
    return inflateRawSync(compressed).toString('utf8');
  }

  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entryPath}`);
}

function findZipEntry(zipBuffer, entryPath) {
  const eocdOffset = findEndOfCentralDirectory(zipBuffer);
  const centralDirectoryOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);

  let cursor = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    const signature = zipBuffer.readUInt32LE(cursor);
    if (signature !== 0x02014b50) {
      throw new Error(`Invalid central directory entry signature at offset ${cursor}`);
    }

    const compressionMethod = zipBuffer.readUInt16LE(cursor + 10);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(cursor + 24);
    const fileNameLength = zipBuffer.readUInt16LE(cursor + 28);
    const extraLength = zipBuffer.readUInt16LE(cursor + 30);
    const commentLength = zipBuffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(cursor + 42);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const fileName = zipBuffer.toString('utf8', fileNameStart, fileNameEnd);

    if (fileName === entryPath) {
      const localHeaderSignature = zipBuffer.readUInt32LE(localHeaderOffset);
      if (localHeaderSignature !== 0x04034b50) {
        throw new Error(`Invalid local file header signature for ${entryPath}`);
      }

      const localFileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;

      if (compressedSize !== uncompressedSize && compressionMethod === 0) {
        throw new Error(`Unexpected stored entry size mismatch for ${entryPath}`);
      }

      return { compressionMethod, compressedSize, dataOffset };
    }

    cursor = fileNameEnd + extraLength + commentLength;
  }

  throw new Error(`Missing ${entryPath} in ${zipPath}`);
}

function findEndOfCentralDirectory(zipBuffer) {
  const minOffset = Math.max(0, zipBuffer.length - 0x10000 - 22);
  for (let offset = zipBuffer.length - 22; offset >= minOffset; offset -= 1) {
    if (zipBuffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error('Unable to locate ZIP end of central directory record');
}
