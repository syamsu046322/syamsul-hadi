import type { ThemeColors } from "@/src/theme";

export type Tone = "warning" | "info" | "success" | "error" | "neutral" | "brand";

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "DRAFT",
  TERDAFTAR: "TERDAFTAR",
  MENUNGGU_SERVIS: "MENUNGGU",
  DIPROSES: "DIPROSES",
  MENUNGGU_PERSETUJUAN: "PERSETUJUAN",
  DISETUJUI: "DISETUJUI",
  MENUNGGU_KASIR: "MENUNGGU KASIR",
  MENUNGGU_PEMBAYARAN: "MENUNGGU BAYAR",
  PEMBAYARAN_DIPROSES: "MEMPROSES BAYAR",
  SUDAH_DIBAYAR: "SUDAH DIBAYAR",
  NOTA_DICETAK: "NOTA DICETAK",
  NOTA_TERKIRIM: "NOTA TERKIRIM",
  SELESAI: "SELESAI",
  DIBATALKAN: "DIBATALKAN",
  DITOLAK: "DITOLAK",
};

export const STATUS_TONE: Record<string, Tone> = {
  TERDAFTAR: "warning",
  MENUNGGU_SERVIS: "warning",
  DIPROSES: "info",
  MENUNGGU_PERSETUJUAN: "warning",
  DISETUJUI: "success",
  MENUNGGU_KASIR: "brand",
  MENUNGGU_PEMBAYARAN: "brand",
  PEMBAYARAN_DIPROSES: "brand",
  SUDAH_DIBAYAR: "success",
  NOTA_DICETAK: "success",
  NOTA_TERKIRIM: "success",
  SELESAI: "success",
  DIBATALKAN: "error",
  DITOLAK: "error",
};

export const PAID_STATUSES = ["SUDAH_DIBAYAR", "NOTA_DICETAK", "NOTA_TERKIRIM", "SELESAI"];
export const ACTIVE_STATUSES = ["TERDAFTAR", "MENUNGGU_SERVIS", "DIPROSES", "MENUNGGU_PERSETUJUAN", "MENUNGGU_KASIR", "MENUNGGU_PEMBAYARAN"];

export function toneColors(c: ThemeColors, tone: Tone): { bg: string; fg: string } {
  switch (tone) {
    case "warning":
      return { bg: c.warningTint, fg: c.warning };
    case "info":
      return { bg: c.infoTint, fg: c.info };
    case "success":
      return { bg: c.successTint, fg: c.success };
    case "error":
      return { bg: c.errorTint, fg: c.error };
    case "brand":
      return { bg: c.brandTertiary, fg: c.onBrandTertiary };
    default:
      return { bg: c.surfaceTertiary, fg: c.onSurfaceTertiary };
  }
}
