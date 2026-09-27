import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { LOMBOK_VILLAGES } from "@/src/data/lombok-villages";
import { Input } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";

export type Address = { dusun: string; desa: string; kecamatan: string; kabupaten: string };
export const EMPTY_ADDRESS: Address = { dusun: "", desa: "", kecamatan: "", kabupaten: "" };

export function AddressFields({ value, onChange, testPrefix = "address" }: { value: Address; onChange: (a: Address) => void; testPrefix?: string }) {
  const styles = useStyles();
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const q = value.desa.trim().toLowerCase();
    if (!q) return [];
    const starts = LOMBOK_VILLAGES.filter((v) => v.desa.toLowerCase().startsWith(q));
    const incl = LOMBOK_VILLAGES.filter((v) => !v.desa.toLowerCase().startsWith(q) && v.desa.toLowerCase().includes(q));
    return [...starts, ...incl].slice(0, 8);
  }, [value.desa]);

  const exactMatch = LOMBOK_VILLAGES.some((v) => v.desa.toLowerCase() === value.desa.trim().toLowerCase());
  const showList = focused && value.desa.trim().length > 0 && suggestions.length > 0 && !exactMatch;

  return (
    <View>
      <Text style={styles.hint}>Alamat (opsional) — wilayah Lombok</Text>
      <Input label="Dusun" value={value.dusun} onChangeText={(t) => onChange({ ...value, dusun: t })} placeholder="mis. Batu Ngereng" testID={`${testPrefix}-dusun`} />

      <View>
        <Input
          label="Desa / Kelurahan"
          value={value.desa}
          onChangeText={(t) => onChange({ ...value, desa: t })}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="ketik nama desa…"
          testID={`${testPrefix}-desa`}
        />
        {showList ? (
          <View style={styles.dropdown} testID={`${testPrefix}-desa-suggestions`}>
            {suggestions.map((v, i) => (
              <Pressable
                key={`${v.desa}-${v.kecamatan}-${i}`}
                style={[styles.option, i < suggestions.length - 1 && styles.optionBorder]}
                onPress={() => { onChange({ ...value, desa: v.desa, kecamatan: v.kecamatan, kabupaten: v.kabupaten }); setFocused(false); }}
                testID={`${testPrefix}-desa-option-${i}`}
              >
                <Text style={styles.optName}>{v.desa}</Text>
                <Text style={styles.optSub}>{v.kecamatan} · {v.kabupaten}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Input label="Kecamatan" value={value.kecamatan} onChangeText={(t) => onChange({ ...value, kecamatan: t })} placeholder="otomatis" testID={`${testPrefix}-kecamatan`} />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Kabupaten/Kota" value={value.kabupaten} onChangeText={(t) => onChange({ ...value, kabupaten: t })} placeholder="otomatis" testID={`${testPrefix}-kabupaten`} />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  hint: { color: c.muted, fontSize: 11, letterSpacing: 0.5, marginBottom: 6, marginTop: 4, textTransform: "uppercase" },
  row: { flexDirection: "row", gap: 8 },
  dropdown: { borderWidth: 2, borderColor: c.brandPrimary, backgroundColor: c.surface, marginTop: -6, marginBottom: 10 },
  option: { paddingHorizontal: 12, paddingVertical: 10 },
  optionBorder: { borderBottomWidth: 1, borderBottomColor: c.divider },
  optName: { color: c.onSurface, fontSize: 14, fontWeight: "600" },
  optSub: { color: c.muted, fontSize: 12, marginTop: 1 },
}));
