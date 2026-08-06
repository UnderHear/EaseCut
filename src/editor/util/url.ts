export const tryParseUrl = (value: string, baseUrl?: string) => {
  try {
    return baseUrl === undefined ? new URL(value) : new URL(value, baseUrl);
  } catch {
    return null;
  }
};

export const isHttpUrl = (url: URL) =>
  url.protocol === 'http:' || url.protocol === 'https:';

export const getUrlFileName = (url: URL) => {
  const encodedFileName = url.pathname.split('/').filter(Boolean).at(-1);
  return encodedFileName ? decodeURIComponent(encodedFileName) : null;
};

export const getUrlFileExtension = (url: URL) =>
  getUrlFileName(url)?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? null;
