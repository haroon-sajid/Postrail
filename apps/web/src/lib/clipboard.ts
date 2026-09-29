import { toast } from 'sonner';

export async function copyToClipboard(value: string, label = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(label);
  } catch {
    toast.error('Could not copy to the clipboard');
  }
}
