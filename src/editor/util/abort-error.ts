import { isRecord } from './value';

export const createAbortError = (message: string) =>
  new DOMException(message, 'AbortError');

export const isAbortError = (error: unknown) =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : isRecord(error) && error.name === 'AbortError';
