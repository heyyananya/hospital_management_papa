/**
 * Open a JWT-protected PDF endpoint in a new tab.
 * window.open() can't attach Authorization headers, so we fetch the bytes,
 * blob-URL them, and open that.
 */
import { authHeader } from '../services/api.js';

export const openPdf = async (url) => {
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Failed to load PDF (${res.status})`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');
};
