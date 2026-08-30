import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type DingTalkOpenApiConfig = {
  schemaVersion: 1;
  dingtalk: {
    applicationType: 'enterpriseInternal';
    appKey: string;
    appSecret: string;
  };
  yida: {
    appType: string;
    systemToken: string;
    userId: string;
  };
  process?: {
    originatorUserId: string;
  };
  temporaryUrl: {
    enabled: boolean;
    language: string;
    timeoutMs: number;
    accessTokenRefreshSkewSeconds: number;
  };
};

type FetchLike = typeof fetch;

function requiredString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateDingTalkOpenApiConfig(value: unknown): DingTalkOpenApiConfig {
  const config = value as Partial<DingTalkOpenApiConfig> | null;
  if (
    !config ||
    config.schemaVersion !== 1 ||
    config.dingtalk?.applicationType !== 'enterpriseInternal' ||
    !requiredString(config.dingtalk?.appKey) ||
    !requiredString(config.dingtalk?.appSecret) ||
    !requiredString(config.yida?.appType) ||
    !requiredString(config.yida?.systemToken) ||
    !requiredString(config.yida?.userId) ||
    typeof config.temporaryUrl?.enabled !== 'boolean' ||
    !requiredString(config.temporaryUrl?.language) ||
    !Number.isInteger(config.temporaryUrl?.timeoutMs) ||
    Number(config.temporaryUrl?.timeoutMs) < 1_000 ||
    !Number.isInteger(config.temporaryUrl?.accessTokenRefreshSkewSeconds) ||
    Number(config.temporaryUrl?.accessTokenRefreshSkewSeconds) < 0
  ) {
    throw new Error('DINGTALK_AUTH_NOT_CONFIGURED');
  }
  return config as DingTalkOpenApiConfig;
}

export function loadDingTalkOpenApiConfig(
  configPath = process.env.DINGTALK_OPENAPI_CONFIG || '.local/dingtalk-openapi.json',
) {
  try {
    return validateDingTalkOpenApiConfig(JSON.parse(readFileSync(resolve(configPath), 'utf8')));
  } catch (error) {
    if (error instanceof Error && error.message === 'DINGTALK_AUTH_NOT_CONFIGURED') throw error;
    throw new Error('DINGTALK_AUTH_NOT_CONFIGURED');
  }
}

function timeoutSignal(milliseconds: number) {
  return AbortSignal.timeout(Math.min(Math.max(milliseconds, 1_000), 60_000));
}

async function jsonOrNull(response: Response) {
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

function upstreamFailure(prefix: string, response: Response, body: Record<string, unknown> | null) {
  const rawCode = String(body?.code || body?.errorCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return new Error(`${prefix}_HTTP_${response.status}${rawCode ? `_${rawCode}` : ''}`);
}

export function createYidaTemporaryUrlResolver(
  options: {
    config?: DingTalkOpenApiConfig;
    loadConfig?: () => DingTalkOpenApiConfig;
    fetchImpl?: FetchLike;
    now?: () => number;
  } = {},
) {
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const loadConfig = options.loadConfig || loadDingTalkOpenApiConfig;
  let cachedToken: { value: string; refreshAt: number } | null = null;

  function config() {
    return options.config ? validateDingTalkOpenApiConfig(options.config) : loadConfig();
  }

  async function accessToken(forceRefresh = false) {
    const current = config();
    if (!forceRefresh && cachedToken && now() < cachedToken.refreshAt) return cachedToken.value;
    let response: Response;
    try {
      response = await fetchImpl('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appKey: current.dingtalk.appKey,
          appSecret: current.dingtalk.appSecret,
        }),
        signal: timeoutSignal(15_000),
      });
    } catch {
      throw new Error('DINGTALK_ACCESS_TOKEN_UNAVAILABLE');
    }
    const body = await jsonOrNull(response);
    const value = typeof body?.accessToken === 'string' ? body.accessToken : '';
    const expireIn = Number(body?.expireIn || 0);
    if (!response.ok || !value || !Number.isFinite(expireIn) || expireIn <= 0) {
      throw upstreamFailure('DINGTALK_ACCESS_TOKEN_FAILED', response, body);
    }
    const skewMs = current.temporaryUrl.accessTokenRefreshSkewSeconds * 1_000;
    cachedToken = { value, refreshAt: now() + Math.max(expireIn * 1_000 - skewMs, 1_000) };
    return value;
  }

  async function requestTemporaryUrl(fileUrl: string, forceRefresh = false): Promise<string> {
    const current = config();
    if (!current.temporaryUrl.enabled) throw new Error('YIDA_OPENAPI_DISABLED');
    const endpoint = new URL(
      `https://api.dingtalk.com/v1.0/yida/apps/temporaryUrls/${encodeURIComponent(current.yida.appType)}`,
    );
    endpoint.searchParams.set('fileUrl', fileUrl);
    endpoint.searchParams.set('language', current.temporaryUrl.language);
    endpoint.searchParams.set('systemToken', current.yida.systemToken);
    endpoint.searchParams.set('timeout', String(current.temporaryUrl.timeoutMs));
    endpoint.searchParams.set('userId', current.yida.userId);
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': await accessToken(forceRefresh),
        },
        signal: timeoutSignal(15_000),
      });
    } catch (error) {
      if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) throw error;
      throw new Error('YIDA_TEMPORARY_URL_UNAVAILABLE');
    }
    if (response.status === 401 && !forceRefresh) {
      cachedToken = null;
      return requestTemporaryUrl(fileUrl, true);
    }
    const body = await jsonOrNull(response);
    const result = typeof body?.result === 'string' ? body.result : '';
    if (!response.ok || !result) throw upstreamFailure('YIDA_TEMPORARY_URL_FAILED', response, body);
    return result;
  }

  return requestTemporaryUrl;
}
