export type FilePickerTriggerKind = 'file-input' | 'native-control';

type ClickableElement = { click(): void };
type QueryHost = { querySelector(selector: string): ClickableElement | null };

export type FilePickerTriggerResult =
  | { opened: true; triggerKind: FilePickerTriggerKind }
  | { opened: false; code: 'FILE_PICKER_TRIGGER_NOT_FOUND' };

export function triggerFilePicker(host: QueryHost | null): FilePickerTriggerResult {
  if (!host) return { opened: false, code: 'FILE_PICKER_TRIGGER_NOT_FOUND' };

  const fileInput = host.querySelector('input[type="file"]');
  if (fileInput) {
    fileInput.click();
    return { opened: true, triggerKind: 'file-input' };
  }

  const nativeControl = host.querySelector('button,[role="button"]');
  if (nativeControl) {
    nativeControl.click();
    return { opened: true, triggerKind: 'native-control' };
  }

  return { opened: false, code: 'FILE_PICKER_TRIGGER_NOT_FOUND' };
}
