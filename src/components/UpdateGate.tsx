import React, { useEffect, useState } from "react";
import { View, Pressable, StyleSheet, Linking } from "react-native";
import { Text, AppButton } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { chequearVersionMinima } from "../lib/appVersionCheck";
import { chequearActualizacionOTA, aplicarActualizacionOTA } from "../lib/otaUpdates";
import { theme } from "../theme";

/**
 * Envuelve toda la app y se encarga de dos cosas relacionadas con
 * versiones:
 *
 * 1. Si la versión instalada quedó por debajo de la mínima permitida (algo
 *    que se controla a mano desde Supabase, ver appVersionCheck.ts), tapa
 *    la app entera con una pantalla que pide actualizar — no deja pasar.
 * 2. Si hay una actualización OTA (de JS, sin pasar por la tienda) ya
 *    lista para aplicar, muestra un banner chiquito y no invasivo
 *    ofreciendo reiniciar para tomarla — la persona sigue usando la app
 *    mientras tanto, no se la interrumpe.
 */
export default function UpdateGate({ children }: { children: React.ReactNode }) {
  const [bloqueada, setBloqueada] = useState<{ bloqueada: boolean; storeUrl?: string } | null>(null);
  const [otaLista, setOtaLista] = useState(false);

  useEffect(() => {
    chequearVersionMinima().then(setBloqueada);
    chequearActualizacionOTA().then((lista) => {
      if (lista) setOtaLista(true);
    });
  }, []);

  if (bloqueada === null) return null; // chequeo instantáneo en la práctica, no hace falta spinner

  if (bloqueada.bloqueada) {
    return (
      <View style={styles.bloqueoContenedor}>
        <Ionicons name="cloud-download-outline" size={48} color={theme.colors.primary} />
        <Text style={styles.bloqueoTitulo}>Hay una actualización disponible</Text>
        <Text style={styles.bloqueoTexto}>Esta versión de la app ya no es compatible. Actualizala para seguir usándola.</Text>
        {!!bloqueada.storeUrl && <AppButton title="Actualizar ahora" onPress={() => Linking.openURL(bloqueada.storeUrl!)} />}
      </View>
    );
  }

  return (
    <>
      {children}
      {otaLista && (
        <Pressable style={styles.otaBanner} onPress={async () => await aplicarActualizacionOTA()}>
          <Ionicons name="sparkles" size={16} color="#000000" />
          <Text style={styles.otaTexto}>Hay una actualización lista — Tocá para reiniciar</Text>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bloqueoContenedor: { flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center", padding: 32 },
  bloqueoTitulo: { fontSize: 20, fontWeight: "700", marginTop: 16, marginBottom: 8, textAlign: "center" },
  bloqueoTexto: { fontSize: 14, color: theme.colors.textMuted, textAlign: "center", marginBottom: 24, lineHeight: 20 },
  otaBanner: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
  },
  otaTexto: { color: "#000000", fontSize: 13, fontWeight: "700" },
});
