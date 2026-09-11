import Blob from 'react-native-blob-util';

/**
 * Caches public catalog thumbnails in the app cache directory across page visits
 * and app launches. A URL identifies immutable artwork; change it to refresh an
 * asset. Custom references are not stored here. The OS may reclaim cache files.
 */
export class ReferenceImageCache {
  private readonly pending = new Map<string, Promise<string>>();
  private readonly ready = new Map<string, string>();

  constructor(
    private readonly catalogURLs: ReadonlySet<string>,
    private readonly directory = `${Blob.fs.dirs.CacheDir}/xlab-reference-images-v1`,
  ) {}

  /** Returns an already resolved local URI for immediate rendering on remount. */
  peek(uri: string): string | undefined {
    return this.ready.get(uri);
  }

  /** Coalesces concurrent reads/downloads; local and non-catalog sources pass through. */
  resolve(uri: string): Promise<string> {
    if (!this.catalogURLs.has(uri)) return Promise.resolve(uri);
    const existing = this.pending.get(uri);

    if (existing) return existing;

    const pending = this.load(uri).finally(() => this.pending.delete(uri));

    this.pending.set(uri, pending);

    return pending;
  }

  /** Removes an unreadable cached image so a later request can download it again. */
  async invalidate(uri: string): Promise<void> {
    this.ready.delete(uri);
    if (this.catalogURLs.has(uri))
      await Blob.fs.unlink(this.path(uri)).catch(() => {});
  }

  private path(uri: string): string {
    // Keep the complete encoded URL to avoid hash collisions or cross-host reuse.
    return `${this.directory}/${encodeURIComponent(uri)}.image`;
  }

  private async hasFile(path: string): Promise<boolean> {
    const stat = await Blob.fs.stat(path).catch(() => null);

    return stat?.type === 'file' && Number(stat.size) > 0;
  }

  private async load(uri: string): Promise<string> {
    const path = this.path(uri);
    const localURI = `file://${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;

    if (!(await this.hasFile(path))) {
      this.ready.delete(uri);
      await Blob.fs.mkdir(this.directory).catch(async error => {
        // Different thumbnails can create the same directory concurrently.
        if (!(await Blob.fs.exists(this.directory))) throw error;
      });

      const temporary = `${path}.part`;

      try {
        const response = await Blob.config({
          path: temporary,
          timeout: 30000,
        }).fetch('GET', uri);
        const { status, headers } = response.info();
        const contentType = Object.entries(headers ?? {}).find(
          ([key]) => key.toLowerCase() === 'content-type',
        )?.[1];

        if (
          status < 200 ||
          status >= 300 ||
          (typeof contentType === 'string' && !/^image\//i.test(contentType)) ||
          !(await this.hasFile(temporary))
        )
          throw new Error('Reference image download failed');

        await Blob.fs.unlink(path).catch(() => {});
        await Blob.fs.mv(temporary, path);
      } finally {
        await Blob.fs.unlink(temporary).catch(() => {});
      }
    }

    this.ready.set(uri, localURI);

    return localURI;
  }
}
