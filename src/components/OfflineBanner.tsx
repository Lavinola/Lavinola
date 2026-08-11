import React, { useEffect, useState } from "react";
import { View, StyleSheet, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

/**
 * Banner que aparece arriba de TODA la app cuando se detecta que no hay
 * conexión a internet — así, si algo no carga o no se guarda, la persona
 * entiende por qué en vez de pensar que la app está rota. Se esconde
 * solo apenas vuelve la conexión.
 */
export default function OfflineBanner() {
  const { t } = useT();
  const [sinConexion, setSinConexion] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((estado) => {
      // `isConnected` puede ser true con wifi "conectado" pero sin internet
      // real — `isInternetReachable` es el chequeo más confiable, pero
      // arranca en null hasta que se confirma, así que no lo tratamos como
      // desconectado hasta tener una respuesta clara (evita un parpadeo del
      // banner al abrir la app).
      const desconectado = estado.isConnected === false || estado.isInternetReachable === false;
      setSinConexion(desconectado);
    });
    return () => unsubscribe();
  }, []);

  if (!sinConexion) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="cloud-offline-outline" size={16} color="#000000" />
      <Text style={styles.texto}>{t("Sin conexión a internet")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#E8B93F",
    paddingVertical: 6,
    paddingTop: Platform.OS === "ios" ? 6 : 6,
  },
  texto: { color: "#000000", fontSize: 12, fontWeight: "700" },
});
