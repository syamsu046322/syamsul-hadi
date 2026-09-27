import { Platform } from "react-native";

export const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) as string;

export function rupiah(n: number | undefined | null): string {
  const v = Math.round(Number(n ?? 0));
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 ? "-" : ""}Rp ${s}`;
}

export function parseNum(s: string): number {
  const d = s.replace(/[^\d]/g, "");
  return d ? parseInt(d, 10) : 0;
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "-";
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

export function ymdToDisplay(ymd: string): string {
  if (!ymd || ymd.length < 8) return ymd;
  return `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}`;
}
