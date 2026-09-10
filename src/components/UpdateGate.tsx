import React, { useEffect, useState } from "react";
import { View, Pressable, StyleSheet, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text, AppButton } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { chequearVersionMinima, chequearVersionRecomendada } from "../lib/appVersionCheck";
import { chequearActualizacionOTA, aplicarActualizacionOTA } from "../lib/otaUpdates";
import { theme } from "../theme";

const CLAVE_DESCARTE = "@lavinola/actualizacion_recomendada_descartada_version";

/**
 * Envuelve toda la app y se encarga de tres cosas relacionadas con
 * versiones:
 *
 * 1. Si la versión instalada quedó por debajo de la mínima permitida (algo
 *    que se controla a mano desde Supabase, ver appVersionCheck.ts), tapa
 *    la app entera con una pantalla que pide actualizar — no deja pasar.
 * 2. Si hay una versión más nueva publicada pero NO es obligatoria
 *    (`latest_app_version` en Supabase), muestra un banner cerrable
 *    avisando — la persona puede seguir usando la app y actualizar cuando
 *    quiera. Si lo cierra, no se lo volvemos a mostrar para esa misma
 *    versión (pero sí en cuanto se publique una más nueva todavía).
 * 3. Si hay una actualización OTA (de JS, sin pasar por la tienda) ya
 *    lista para aplicar, muestra un banner chiquito y no invasivo
 *    ofreciendo reiniciar para tomarla.
 */
export default function UpdateGate({ children }: { children: React.ReactNode }) {
  const [bloqueada, setBloqueada] = useState<{ bloqueada: boolean; storeUrl?: string } | null>(null);
  const [otaLista, setOtaLista] = useState(false);
  const [recomendada, setRecomendada] = useState<{ ultimaVersion: string; storeUrl?: string } | null>(null);

  useEffect(() => {
    chequearVersionMinima().then(setBloqueada);
    chequearActualizacionOTA().then((lista) => {
      if (lista) setOtaLista(true);
    });
    chequearVersionRecomendada().then(async (resultado) => {
      if (!resultado) return;
      const descartada = await AsyncStorage.getItem(CLAVE_DESCARTE);
      if (descartada !== resultado.ultimaVersion) {
        setRecomendada(resultado);
      }
    });
  }, []);

  async function descartarRecomendada() {
    if (recomendada) await AsyncStorage.setItem(CLAVE_DESCARTE, recomendada.ultimaVersion);
    setRecomendada(null);
  }

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
      {!!recomendada && (
        <View style={styles.recomendadaBanner}>
          <Ionicons name="arrow-up-circle" size={20} color={theme.colors.primary} />
          <Text style={styles.recomendadaTexto}>Hay una versión nueva de Lavinola</Text>
          <Pressable
            style={styles.recomendadaBoton}
            onPress={() => recomendada.storeUrl && Linking.openURL(recomendada.storeUrl)}
          >
            <Text style={styles.recomendadaBotonTexto}>Actualizar</Text>
          </Pressable>
          <Pressable onPress={descartarRecomendada} hitSlop={10}>
            <Ionicons name="close" size={18} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      )}
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

  recomendadaBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 44, // deja lugar para la barra de estado/notch
  },
  recomendadaTexto: { flex: 1, fontSize: 13, color: theme.colors.text, fontWeight: "600" },
  recomendadaBoton: { backgroundColor: theme.colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill },
  recomendadaBotonTexto: { color: "#000000", fontSize: 12, fontWeight: "800" },

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
