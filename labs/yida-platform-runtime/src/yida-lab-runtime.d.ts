declare module '@yida-lab/runtime' {
  export function getLabPageUrl(key: string): string;
  export function getLabRuntimeProfile(): {
    stage: string;
    defaultTransport: string;
    allowDirectOverride: boolean;
    expectedAppType: string | null;
  };
  export function getLabResourceId(key: string): string;
  export function getLabResourceFieldId(resourceKey: string, fieldKey: string): string;
  export function getLabResourceProcessCode(resourceKey: string): string;
}
