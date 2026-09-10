import {
  invalid,
  XmaxError,
  XmaxErrorCode,
} from '../../Foundation/Errors/XmaxError';
import { record, nonEmpty } from '../Network/ApiService';
import type { StorageConfiguration } from './StorageTypes';

export function httpURL(value: string): URL {
  try {
    const url = new URL(value);

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    )
      throw new Error();

    return url;
  } catch {
    throw invalid('Invalid HTTP URL');
  }
}

export function filePath(value: string): string {
  // RN's built-in URL.pathname handles HTTP only; do not use it for file URLs.
  const match = /^file:\/\/(?:localhost)?(\/[^?#]*)$/i.exec(value);

  try {
    if (!match?.[1]) throw new Error();

    const path = decodeURIComponent(match[1]);

    if (path.includes('\0')) throw new Error();

    return path;
  } catch {
    throw invalid('Expected an absolute file URL');
  }
}

const imageTypes: Record<string, string> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  jpe: 'jpeg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
  heic: 'heic',
  heif: 'heif',
  bmp: 'bmp',
  svg: 'svg+xml',
  tif: 'tiff',
  tiff: 'tiff',
  avif: 'avif',
};

const videoTypes: Record<string, string> = {
  mp4: 'mp4',
  mov: 'quicktime',
  m4v: 'x-m4v',
  webm: 'webm',
  avi: 'x-msvideo',
  mkv: 'x-matroska',
  '3gp': '3gpp',
  '3g2': '3gpp2',
  ts: 'mp2t',
};

export function uploadMetadata(
  fileURL: string,
  media: 'image' | 'video',
  contentType?: string | null,
) {
  const name = filePath(fileURL).split('/').pop() ?? '';
  const fileName = name
    .trim()
    .replace(/[^\p{L}\p{N}._-]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');

  if (!fileName) throw invalid('File name cannot be empty');

  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const inferred = (media === 'image' ? imageTypes : videoTypes)[extension];
  const type =
    contentType?.trim().toLowerCase() ??
    (inferred ? `${media}/${inferred}` : '');

  if (
    !type.startsWith(`${media}/`) ||
    type === `${media}/` ||
    /[\r\n]/.test(type)
  )
    throw invalid(`Invalid ${media} content type`);

  return { fileName, contentType: type };
}

export function parseStorageConfiguration(
  value: unknown,
): StorageConfiguration {
  const data = record(value),
    credentials = record(data?.credentials);
  const bucket = nonEmpty(data?.bucket),
    region = nonEmpty(data?.region);
  const accessKeyID = nonEmpty(credentials?.accessKeyId),
    secretAccessKey = nonEmpty(credentials?.secretAccessKey),
    sessionToken = nonEmpty(credentials?.sessionToken);

  if (
    !bucket ||
    !region ||
    !/^[a-zA-Z0-9.-]+$/.test(bucket) ||
    !/^[a-zA-Z0-9.-]+$/.test(region) ||
    typeof data?.endpoint !== 'string' ||
    typeof data.prefix !== 'string' ||
    !accessKeyID ||
    !secretAccessKey ||
    !sessionToken
  )
    throw new XmaxError({
      code: XmaxErrorCode.apiError,
      message: 'Invalid storage credential payload',
    });

  const configuration = {
    bucket,
    region,
    endpoint: data.endpoint.trim(),
    prefix: data.prefix.trim(),
    credential: { accessKeyID, secretAccessKey, sessionToken },
  };

  storageEndpoint(configuration);

  return configuration;
}

export function storageEndpoint(config: StorageConfiguration): URL {
  const endpoint =
    config.endpoint ||
    `https://${config.bucket}.cos.${config.region}.myqcloud.com`;
  const url = httpURL(
    endpoint.includes('://') ? endpoint : `https://${endpoint}`,
  );

  if (url.hostname.toLowerCase().startsWith('cos.'))
    return new URL(
      `${url.protocol}//${config.bucket}.${url.host}${url.pathname}${url.search}${url.hash}`,
    );

  return url;
}

export function objectURL(
  config: StorageConfiguration,
  key: string,
  candidate?: string,
): string {
  if (candidate) {
    try {
      return httpURL(
        candidate.startsWith('//') ? `https:${candidate}` : candidate,
      ).href;
    } catch {
      /* Fall back to the configured object endpoint. */
    }
  }

  const url = storageEndpoint(config);

  return `${`${url.origin}${url.pathname}`.replace(/\/+$/, '')}/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}
