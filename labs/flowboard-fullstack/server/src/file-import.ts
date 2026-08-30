import { createHash, randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import readXlsxFile from 'read-excel-file/node';
import { createYidaTemporaryUrlResolver, type DingTalkOpenApiConfig } from './dingtalk-openapi.ts';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 500;
const MAX_COLUMNS = 30;
const MAX_CELL_CHARS = 500;

type JsonRow = Record<string, string | number | boolean | null>;

function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = String(value);
  if (text.length > MAX_CELL_CHARS) throw new Error('CELL_TOO_LONG');
  return text;
}

export async function parseWorkbook(buffer: Buffer) {
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw new Error('FILE_SIZE_OUT_OF_RANGE');
  if (buffer.subarray(0, 2).toString('hex') !== '504b') throw new Error('REMOTE_FILE_NOT_XLSX');
  const sheets = await readXlsxFile(buffer, { dateFormat: 'yyyy-mm-dd' });
  const firstSheet = sheets[0];
  const values = firstSheet?.data || [];
  if (values.length < 2) throw new Error('WORKBOOK_REQUIRES_HEADER_AND_DATA');
  if (values.length - 1 > MAX_ROWS) throw new Error('TOO_MANY_ROWS');
  const header = values[0].map((value, index) => String(value || `column_${index + 1}`).trim());
  if (header.length > MAX_COLUMNS) throw new Error('TOO_MANY_COLUMNS');
  if (new Set(header).size !== header.length) throw new Error('DUPLICATE_HEADERS');
  const rows: JsonRow[] = values
    .slice(1)
    .map((row) => Object.fromEntries(header.map((name, index) => [name, normalizeCell(row[index])])));
  return {
    sheetName: 'Sheet1',
    columns: header,
    rowCount: rows.length,
    rows,
  };
}

function normalizeJsonRows(value: unknown): JsonRow[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    throw new Error('ROWS_BATCH_SIZE_OUT_OF_RANGE');
  }
  return value.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('INVALID_ROW');
    const entries = Object.entries(row as Record<string, unknown>);
    if (!entries.length || entries.length > MAX_COLUMNS) throw new Error('INVALID_COLUMN_COUNT');
    return Object.fromEntries(entries.map(([key, cell]) => [key, normalizeCell(cell)]));
  });
}

function isAllowedDownloadUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:') return false;
  return ['aliwork.com', 'aliyuncs.com', 'alicdn.com', 'dingtalk.com'].some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
  );
}

async function downloadWithRedirectGuard(initialUrl: string, fetchImpl: typeof fetch = fetch) {
  let current = initialUrl;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!isAllowedDownloadUrl(current)) throw new Error('DOWNLOAD_HOST_NOT_ALLOWED');
    const response = await fetchImpl(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('DOWNLOAD_REDIRECT_WITHOUT_LOCATION');
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok) throw new Error(`DOWNLOAD_HTTP_${response.status}`);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_FILE_BYTES) throw new Error('REMOTE_FILE_TOO_LARGE');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_FILE_BYTES) throw new Error('REMOTE_FILE_TOO_LARGE');
    return { buffer, finalUrl: current };
  }
  throw new Error('TOO_MANY_REDIRECTS');
}

function success(response: Response, request: Request, data: Record<string, unknown>) {
  response.json({ success: true, data, meta: { requestId: request.requestId } });
}

export function createFileImportRouter(
  options: {
    dingtalkConfig?: DingTalkOpenApiConfig;
    loadDingTalkConfig?: () => DingTalkOpenApiConfig;
    fetchImpl?: typeof fetch;
  } = {},
) {
  const router = express.Router();
  const fetchImpl = options.fetchImpl || fetch;
  const resolveYidaTemporaryUrl = createYidaTemporaryUrlResolver({
    config: options.dingtalkConfig,
    loadConfig: options.loadDingTalkConfig,
    fetchImpl,
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: MAX_FILE_BYTES, fields: 8 },
    fileFilter: (_request, file, callback) => {
      const allowed = /\.xlsx$/i.test(file.originalname) || file.mimetype.includes('spreadsheetml');
      if (allowed) callback(null, true);
      else callback(new Error('ONLY_XLSX_ALLOWED'));
    },
  });

  router.get('/health', (request, response) => {
    success(response, request, {
      service: 'file-import-api',
      status: 'ok',
      limits: { maxFileBytes: MAX_FILE_BYTES, maxRows: MAX_ROWS, maxColumns: MAX_COLUMNS },
    });
  });

  router.post('/upload', upload.single('file'), async (request, response, next) => {
    try {
      if (!request.file) throw new Error('FILE_REQUIRED');
      const parsed = await parseWorkbook(request.file.buffer);
      success(response, request, {
        channel: 'direct-multipart',
        uploadId: randomUUID(),
        name: request.file.originalname,
        size: request.file.size,
        sha256: sha256(request.file.buffer),
        ...parsed,
        rows: parsed.rows.slice(0, 20),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/rows', (request, response, next) => {
    try {
      const input = request.body && typeof request.body === 'object' ? request.body : {};
      const rows = normalizeJsonRows(input.rows);
      const sessionId = String(input.sessionId || '').trim();
      const batchIndex = Number(input.batchIndex);
      if (!sessionId || sessionId.length > 120) throw new Error('INVALID_SESSION_ID');
      if (!Number.isInteger(batchIndex) || batchIndex < 0) throw new Error('INVALID_BATCH_INDEX');
      success(response, request, {
        channel: 'parsed-json',
        sessionId,
        batchIndex,
        acceptedRows: rows.length,
        payloadSha256: sha256(JSON.stringify(rows)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/fetch-yida', async (request, response, next) => {
    try {
      const downloadUrl = String(request.body?.downloadUrl || '').trim();
      if (!downloadUrl) throw new Error('DOWNLOAD_URL_REQUIRED');
      if (!isAllowedDownloadUrl(downloadUrl)) throw new Error('DOWNLOAD_HOST_NOT_ALLOWED');
      const temporaryUrl = await resolveYidaTemporaryUrl(downloadUrl);
      if (!isAllowedDownloadUrl(temporaryUrl)) throw new Error('TEMPORARY_URL_HOST_NOT_ALLOWED');
      const downloaded = await downloadWithRedirectGuard(temporaryUrl, fetchImpl);
      const parsed = await parseWorkbook(downloaded.buffer);
      success(response, request, {
        channel: 'yida-temporary-url',
        size: downloaded.buffer.length,
        sha256: sha256(downloaded.buffer),
        finalHost: new URL(downloaded.finalUrl).hostname,
        ...parsed,
        rows: parsed.rows.slice(0, 20),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function isFileImportError(error: unknown) {
  return (
    error instanceof multer.MulterError || (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message))
  );
}

export function fileImportErrorResponse(error: unknown, request: Request, response: Response) {
  const code = error instanceof multer.MulterError ? `MULTER_${error.code}` : (error as Error).message;
  response.status(400).json({
    success: false,
    error: { code, message: 'File import request rejected' },
    meta: { requestId: request.requestId },
  });
}
