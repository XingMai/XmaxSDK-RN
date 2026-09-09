export interface RuntimeInfo {
  readonly platform: string;
  readonly os_version: string;
  readonly sdk_version: string;
  readonly device_model: string;
}
export function taskIDFromUUID(uuid: string, platform: string): string {
  const hex = uuid.replaceAll('-', '');
  if (!/^[a-f0-9]{32}$/i.test(hex)) throw new Error('Invalid runtime UUID');
  const bytes = Array.from({ length: 16 }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let encoded = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const value =
      ((bytes[i] ?? 0) << 16) |
      ((bytes[i + 1] ?? 0) << 8) |
      (bytes[i + 2] ?? 0);
    encoded += alphabet[(value >>> 18) & 63]! + alphabet[(value >>> 12) & 63]!;
    if (i + 1 < bytes.length) encoded += alphabet[(value >>> 6) & 63]!;
    if (i + 2 < bytes.length) encoded += alphabet[value & 63]!;
  }
  return `task-${encoded}?os=${platform}`;
}
