/** The file transport subset used by storage; vendor-only declarations stay internal. */
interface BlobResponse {
  info(): { status: number };
}

interface BlobRequest extends Promise<BlobResponse> {
  progress(
    options: { interval: number },
    callback: (complete: number, total: number) => void,
  ): BlobRequest;

  cancel(callback: () => void): void;
}

interface BlobTransport {
  fs: {
    stat(path: string): Promise<{ type: string; size: number | string }>;
    unlink(path: string): Promise<void>;
  };
  config(options: { path: string; timeout: number }): {
    fetch(method: 'GET', url: string): BlobRequest;
  };
}

// 0.24.10's root declarations reference files absent from its npm archive.
// Keep a checked, narrow transport boundary without editing the installed package.
const Blob: BlobTransport = require('react-native-blob-util').default;

export default Blob;
