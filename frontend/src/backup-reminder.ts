import { storage } from "@/src/utils/storage";

const KEY = "suel_last_backup_ymd";

export function todayLocalYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function markBackupDone(): Promise<void> {
  await storage.setItem(KEY, todayLocalYmd());
}

export async function getLastBackupYmd(): Promise<string> {
  return (await storage.getItem<string>(KEY, "")) ?? "";
}
