export type HashPin = string;
export interface ParsedHashPin {
    algorithm: 'sha256' | 'sha512';
    expectedHex: string;
}
export interface TomlFetchResult {
    ok: true;
    content: string;
    hash?: string;
    cachedAt: number;
    fetched: boolean;
}
export interface TomlFetchError {
    ok: false;
    error: string;
    cachedAt: number;
}
export type TomlFetchOutcome = TomlFetchResult | TomlFetchError;
export declare function parseHashPin(pin: string): ParsedHashPin | undefined;
export declare function computeHash(content: string, algorithm: 'sha256' | 'sha512'): string;
export declare function validateTomlHash(content: string, pin: string | undefined): {
    valid: true;
    hash: string;
} | {
    valid: false;
    error: string;
};
export declare function buildTomlCacheKey(domain: string): string;
export declare function fetchTomlWithCache(domain: string, options?: {
    cacheTtlMs?: number;
    hashPin?: string;
    maxBodyBytes?: number;
}): Promise<TomlFetchOutcome>;
