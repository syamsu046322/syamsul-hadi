import { File, UploadType } from "expo-file-system";
import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

export const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;
export const TOKEN_KEY = "suel_token";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

export async function getToken(): Promise<string | null> {
  return storage.secureGet<string | null>(TOKEN_KEY, null);
}

type Opts = { method?: string; body?: unknown; formData?: FormData; upload?: { uri: string; mimeType?: string } };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `${BASE_URL}/api${path}`;
  let status: number;
  let text: string;
  try {
    if (opts.upload && Platform.OS !== "web") {
      // Native multipart upload bypasses React Native fetch/FormData (unreliable for file URIs)
      const result = await new File(opts.upload.uri).upload(url, {
        httpMethod: "POST",
        uploadType: UploadType.MULTIPART,
        fieldName: "file",
        mimeType: opts.upload.mimeType,
        headers,
      });
      status = result.status;
      text = result.body;
    } else {
      if (!opts.formData) headers["Content-Type"] = "application/json";
      const res = await fetch(url, {
        method: opts.method ?? (opts.body || opts.formData ? "POST" : "GET"),
        headers,
        body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      });
      status = res.status;
      text = await res.text();
    }
  } catch {
    throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa koneksi internet.");
  }
  if (status === 401) {
    await storage.secureRemove(TOKEN_KEY);
    unauthorizedHandler?.();
  }
  if (status < 200 || status >= 300) {
    let msg = `Terjadi kesalahan (${status})`;
    try {
      const j = JSON.parse(text);
      if (typeof j.detail === "string") msg = j.detail;
      else if (Array.isArray(j.detail)) msg = j.detail.map((d: any) => d.msg).join(", ");
    } catch {}
    throw new ApiError(status, msg);
  }
  if (status === 204) return undefined as T;
  return JSON.parse(text) as T;
}

export const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "" && v !== false)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
};
