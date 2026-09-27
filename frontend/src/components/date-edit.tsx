import React, { useEffect, useState } from "react";
import { Text } from "react-native";

import { Button, Input, Sheet } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";

// YYYYMMDD -> DD/MM/YYYY
export function ymdToDMY(ymd?: string): string {
  return ymd && ymd.length === 8 ? `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}` : "";
}

// ISO timestamp -> DD/MM/YYYY (local)
export function isoToDMY(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// DD/MM/YYYY -> YYYY-MM-DD (empty string if incomplete/invalid)
export function dmyToYmd(dmy?: string): string {
  if (!dmy) return "";
  const m = dmy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function DateEditSheet({
  visible, onClose, initial, onSave, loading, note, testID = "date-sheet",
}: {
  visible: boolean; onClose: () => void; initial: string; onSave: (dmy: string) => void;
  loading?: boolean; note?: string; testID?: string;
}) {
  const styles = useStyles();
  const [val, setVal] = useState(initial);
  useEffect(() => { if (visible) setVal(initial); }, [visible, initial]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Ubah Tanggal" testID={testID} scroll={false}>
      <Text style={styles.note}>{note ?? "Owner dapat mengubah tanggal transaksi. Format: HH/BB/TTTT (mis. 25/09/2026). Laporan & omzet mengikuti tanggal baru."}</Text>
      <Input label="Tanggal (HH/BB/TTTT)" value={val} onChangeText={setVal} placeholder="25/09/2026" keyboardType="numbers-and-punctuation" autoFocus testID={`${testID}-input`} />
      <Button title="Simpan Tanggal" onPress={() => onSave(val)} loading={loading} disabled={!val.trim()} testID={`${testID}-save`} />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  note: { color: c.onSurface, fontSize: 13, lineHeight: 20, marginBottom: 14 },
}));
