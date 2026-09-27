import * as Print from "expo-print";
import { Platform } from "react-native";

// Layout nota untuk kertas thermal 80mm (area cetak efektif ±72mm).
// 80mm ≈ 226pt; body dibatasi 72mm agar tidak terpotong di tepi printer.
const THERMAL_CSS = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: 72mm; margin: 0 auto; padding: 2mm 1mm 4mm; font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.35; color: #000; word-break: break-word; }
  h1 { font-size: 14px; margin: 2px 0 0; text-align: center; letter-spacing: 1px; font-weight: 700; }
  .c { text-align: center; font-size: 10px; }
  .logo { display: block; margin: 0 auto 2px; width: 60px; height: 60px; object-fit: contain; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td { padding: 1px 0; vertical-align: top; font-size: 11px; }
  td.r { text-align: right; white-space: nowrap; width: 34%; }
  .hr { border-top: 1px dashed #000; margin: 5px 0; }
  .sec { font-weight: 700; margin-top: 4px; text-transform: uppercase; font-size: 10.5px; }
  .tot td { font-weight: 700; font-size: 13px; }
  .item { padding-top: 3px; }
  .sub { font-size: 10px; color: #000; padding-left: 4px; }
`;

export function thermalRow(label: string, value: string, cls = ""): string {
  return `<tr class="${cls}"><td>${label}</td><td class="r">${value}</td></tr>`;
}

/** Baris item 2 tingkat: nama di atas, "qty x harga" & subtotal di bawah — pas untuk 80mm. */
export function thermalItem(name: string, qty: number, price: string, subtotal: string): string {
  return `<tr><td colspan="2" class="item">${name}</td></tr><tr><td class="sub">${qty} x ${price}</td><td class="r">${subtotal}</td></tr>`;
}

export function thermalHtml(body: string): string {
  return `<html><head><meta charset="utf-8"><meta name="viewport" content="width=302"><style>${THERMAL_CSS}</style></head><body>${body}</body></html>`;
}

/** Cetak HTML nota ke printer thermal 80mm (iOS: ukuran halaman 80mm; Android: pilih ukuran 80mm/roll di dialog print). */
export async function printThermal(body: string): Promise<void> {
  await Print.printAsync({
    html: thermalHtml(body),
    ...(Platform.OS === "ios" ? { width: 226, height: 1400, margins: { left: 0, top: 0, right: 0, bottom: 0 } } : {}),
  });
}
