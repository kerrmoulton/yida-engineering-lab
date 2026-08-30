export type ImportChannel = 'direct-multipart' | 'browser-json' | 'yida-attachment';
export type ImportRow = Record<string, string | number | boolean | null>;
export type JsonTransport = 'direct' | 'connector';
export type UploadEndpoint = 'local' | 'public';

export type FileImportRequest =
  | { channel: 'direct-multipart'; endpoint: UploadEndpoint }
  | { channel: 'browser-json'; transport: JsonTransport }
  | { channel: 'yida-attachment' };

export type FileImportResult = {
  schemaVersion: 1;
  operationId: string;
  channel: ImportChannel;
  transport:
    'localhost-multipart' | 'public-multipart' | 'localhost-json' | 'connector-json' | 'yida-attachment';
  status: 'completed';
  file: { name: string; size: number; type: string };
  rowCount: number;
  acceptedRows: number;
  columns: string[];
  requestId?: string;
  diagnostics: {
    parser: 'backend' | 'browser';
    sha256?: string;
    cleanupCompleted?: boolean;
  };
};

type ParsedWorkbook = { columns: string[]; rows: ImportRow[] };
export type FileImportDependencies = {
  uploadMultipart: (file: File, endpoint: UploadEndpoint) => Promise<unknown>;
  parseWorkbook: (file: File) => Promise<ParsedWorkbook>;
  submitParsedRows: (rows: ImportRow[], transport: JsonTransport) => Promise<unknown>;
  relayYidaAttachment: (file: File) => Promise<unknown>;
  createOperationId?: () => string;
};

type ServiceOptions = { defaultRequest: FileImportRequest };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function dataOf(payload: unknown) {
  if (!isRecord(payload)) return {};
  return isRecord(payload.data) ? payload.data : payload;
}

function metaOf(payload: unknown) {
  return isRecord(payload) && isRecord(payload.meta) ? payload.meta : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function nonNegativeNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function operationId() {
  return globalThis.crypto?.randomUUID?.() || `import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function resolveDefaultFileImportRequest(profile: {
  stage: string;
  defaultTransport: string;
}): FileImportRequest {
  if (profile.defaultTransport === 'connector') {
    return { channel: 'browser-json', transport: 'connector' };
  }
  return {
    channel: 'direct-multipart',
    endpoint: profile.stage === 'local' || profile.stage === 'development' ? 'local' : 'public',
  };
}

export class FileImportServiceError extends Error {
  readonly channel: ImportChannel;
  readonly phase: string;
  readonly code: string;

  constructor(channel: ImportChannel, phase: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    super(message);
    this.name = 'FileImportServiceError';
    this.channel = channel;
    this.phase = phase;
    this.code = /^[A-Z0-9_]+$/.test(message) ? message : 'FILE_IMPORT_FAILED';
  }
}

export function createFileImportService(dependencies: FileImportDependencies, options: ServiceOptions) {
  async function importFile(file: File, request = options.defaultRequest): Promise<FileImportResult> {
    const createId = dependencies.createOperationId || operationId;
    const base = {
      schemaVersion: 1 as const,
      operationId: createId(),
      channel: request.channel,
      status: 'completed' as const,
      file: { name: file.name, size: file.size, type: file.type },
    };
    let phase = 'prepare';
    try {
      if (request.channel === 'direct-multipart') {
        phase = 'multipart-upload';
        const payload = await dependencies.uploadMultipart(file, request.endpoint);
        const data = dataOf(payload);
        const meta = metaOf(payload);
        const rowCount = nonNegativeNumber(data.rowCount);
        return {
          ...base,
          transport: request.endpoint === 'local' ? 'localhost-multipart' : 'public-multipart',
          rowCount,
          acceptedRows: rowCount,
          columns: stringArray(data.columns),
          requestId: typeof meta.requestId === 'string' ? meta.requestId : undefined,
          diagnostics: {
            parser: 'backend',
            sha256: typeof data.sha256 === 'string' ? data.sha256 : undefined,
          },
        };
      }

      if (request.channel === 'browser-json') {
        phase = 'browser-parse';
        const parsed = await dependencies.parseWorkbook(file);
        phase = 'json-submit';
        const payload = await dependencies.submitParsedRows(parsed.rows, request.transport);
        const data = dataOf(payload);
        const meta = metaOf(payload);
        return {
          ...base,
          transport: request.transport === 'connector' ? 'connector-json' : 'localhost-json',
          rowCount: parsed.rows.length,
          acceptedRows: nonNegativeNumber(data.acceptedRows, parsed.rows.length),
          columns: parsed.columns,
          requestId: typeof meta.requestId === 'string' ? meta.requestId : undefined,
          diagnostics: {
            parser: 'browser',
            sha256: typeof data.payloadSha256 === 'string' ? data.payloadSha256 : undefined,
          },
        };
      }

      phase = 'yida-attachment-relay';
      const relay = dataOf(await dependencies.relayYidaAttachment(file));
      if (relay.backendDownloadSucceeded !== true || relay.cleanupCompleted !== true) {
        throw new Error(
          typeof relay.errorCode === 'string' ? relay.errorCode : 'YIDA_ATTACHMENT_RELAY_FAILED',
        );
      }
      const rowCount = nonNegativeNumber(relay.rowCount);
      return {
        ...base,
        transport: 'yida-attachment',
        rowCount,
        acceptedRows: rowCount,
        columns: stringArray(relay.columns),
        diagnostics: { parser: 'backend', cleanupCompleted: true },
      };
    } catch (error) {
      throw new FileImportServiceError(request.channel, phase, error);
    }
  }

  return { importFile, defaultRequest: options.defaultRequest };
}
