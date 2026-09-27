import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { api, BASE_URL, getToken } from "@/src/api";

export type Entity = "customers" | "services" | "parts" | "vehicles";
export const ENTITY_LABEL: Record<Entity, string> = { customers: "Data Pelanggan", services: "Data Jasa", parts: "Data Stok Barang", vehicles: "Data Motor" };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function exportExcel(entity: Entity): Promise<string> {
  return downloadXlsx(`${BASE_URL}/api/export/${entity}`, `suel_${entity}_${new Date().toISOString().slice(0, 10)}.xlsx`, `Export ${ENTITY_LABEL[entity]}`);
}

export async function exportReport(mode: "daily" | "monthly"): Promise<string> {
  return downloadXlsx(`${BASE_URL}/api/export/report/omzet?mode=${mode}`, `suel_laporan_omzet_${mode}_${new Date().toISOString().slice(0, 10)}.xlsx`, "Export Laporan Omzet");
}

export async function exportBackup(): Promise<string> {
  return downloadXlsx(`${BASE_URL}/api/backup/export`, `suel_backup_${new Date().toISOString().slice(0, 10)}.xlsx`, "Backup Data Harian");
}

export async function exportReportXlsx(
  kind: "service-sales" | "direct-sales" | "purchases",
  opts: { month?: string; dateFrom?: string; dateTo?: string },
): Promise<string> {
  const params: Record<string, string> = {};
  let tag = "";
  if (opts.dateFrom || opts.dateTo) {
    if (opts.dateFrom) params.date_from = opts.dateFrom;
    if (opts.dateTo) params.date_to = opts.dateTo;
    tag = `${opts.dateFrom || "awal"}_sd_${opts.dateTo || "akhir"}`;
  } else {
    params.month = opts.month ?? "";
    tag = opts.month ?? "";
  }
  const query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return downloadXlsx(`${BASE_URL}/api/export/report/${kind}?${query}`, `suel_${kind}_${tag}.xlsx`, "Export Laporan");
}

export async function importBackup(): Promise<{ ok: boolean; customers: number; vehicles: number; parts: number; services: number; transactions: number; payments: number; expenses: number; sales: number } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: [XLSX_MIME, "application/vnd.ms-excel", "*/*"], copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets?.length) return null;
  const asset = picked.assets[0];
  if (Platform.OS === "web") {
    const fd = new FormData();
    if (asset.file) fd.append("file", asset.file, asset.name);
    else fd.append("file", { uri: asset.uri, name: asset.name ?? "backup.xlsx", type: asset.mimeType ?? XLSX_MIME } as any);
    return api(`/backup/import`, { method: "POST", formData: fd });
  }
  return api(`/backup/import`, { upload: { uri: asset.uri, mimeType: asset.mimeType ?? XLSX_MIME } });
}

async function downloadXlsx(url: string, fname: string, title: string): Promise<string> {
  const token = await getToken();
  if (Platform.OS === "web") {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Export gagal");
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href; a.download = fname; a.click();
    URL.revokeObjectURL(href);
    return "File Excel berhasil diunduh";
  }
  const dest = new File(Paths.cache, fname);
  const file = await File.downloadFileAsync(url, dest, { headers: { Authorization: `Bearer ${token}` }, idempotent: true });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: XLSX_MIME, dialogTitle: title });
  }
  return "File Excel siap dibagikan";
}

export async function importExcel(entity: Entity): Promise<{ inserted: number; updated: number; skipped: number } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: [XLSX_MIME, "application/vnd.ms-excel", "*/*"], copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets?.length) return null;
  const asset = picked.assets[0];
  if (Platform.OS === "web") {
    const fd = new FormData();
    if (asset.file) fd.append("file", asset.file, asset.name);
    else fd.append("file", { uri: asset.uri, name: asset.name ?? "import.xlsx", type: asset.mimeType ?? XLSX_MIME } as any);
    return api(`/import/${entity}`, { method: "POST", formData: fd });
  }
  // Native: gunakan upload multipart native (fetch+FormData RN sering gagal untuk file URI)
  return api(`/import/${entity}`, { upload: { uri: asset.uri, mimeType: asset.mimeType ?? XLSX_MIME } });
}
