declare module '@yida-lab/runtime' {
  export function getLabPageUrl(key: string): string;
  export function getLabServiceUrl(key: string): string;
  export function getLabConnectorId(key: string): string;
  export function getLabRuntimeProfile(): {
    stage: 'test' | 'production';
    defaultTransport: 'direct' | 'connector';
    allowDirectOverride: boolean;
  };
}
