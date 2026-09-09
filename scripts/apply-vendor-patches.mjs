import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
// Development checkout only. Published consumers must use a reviewed vendor revision.
if (existsSync('vendor-patches/rtc-1.3.2.json')) {
  const manifest = JSON.parse(
    readFileSync('vendor-patches/rtc-1.3.2.json', 'utf8'),
  );
  const base = resolve('node_modules', manifest.package);
  const pkg = JSON.parse(readFileSync(resolve(base, 'package.json'), 'utf8'));
  if (pkg.version !== manifest.version)
    throw new Error('RTC patch version mismatch');
  for (const patch of manifest.patches) {
    const path = resolve(base, patch.path);
    if (patch.contents) {
      writeFileSync(path, patch.contents);
      continue;
    }
    const source = readFileSync(path, 'utf8');
    if (source.includes(patch.after)) continue;
    if (!source.includes(patch.before))
      throw new Error(`RTC patch mismatch: ${patch.path}`);
    writeFileSync(path, source.replaceAll(patch.before, patch.after));
  }
  console.log('Applied reviewed RTC 1.3.2 development patches');
}
