import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
// Development checkout only. Published consumers must use a reviewed vendor revision.
for (const name of [
  'rtc-1.3.2.json',
  'cos-1.3.0.json',
  'blob-util-0.24.10.json',
]) {
  if (!existsSync(`vendor-patches/${name}`)) continue;
  const manifest = JSON.parse(readFileSync(`vendor-patches/${name}`, 'utf8'));
  const base = resolve('node_modules', manifest.package);
  const pkg = JSON.parse(readFileSync(resolve(base, 'package.json'), 'utf8'));
  if (pkg.version !== manifest.version)
    throw new Error(`${manifest.package} patch version mismatch`);
  for (const patch of manifest.patches) {
    const path = resolve(base, patch.path);
    if (patch.contents) {
      writeFileSync(path, patch.contents);
      continue;
    }
    const source = readFileSync(path, 'utf8');
    if (source.includes(patch.after)) continue;
    if (!source.includes(patch.before))
      throw new Error(`${manifest.package} patch mismatch: ${patch.path}`);
    writeFileSync(path, source.replaceAll(patch.before, patch.after));
  }
  console.log(
    `Applied reviewed ${manifest.package} ${manifest.version} development patches`,
  );
}
