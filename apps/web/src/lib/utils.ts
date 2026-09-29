import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.trim();
  if (!base) return '?';
  const parts = base.split(/\s+/);
  const letters = parts.length > 1 ? parts.slice(0, 2).map((p) => p[0]) : [base[0]];
  return letters.join('').toUpperCase();
}

export function truncateMiddle(value: string, keep = 6): string {
  return value.length <= keep * 2 + 1 ? value : `${value.slice(0, keep)}…${value.slice(-keep)}`;
}
