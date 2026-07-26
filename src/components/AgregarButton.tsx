import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { theme } from "../theme";
import { useT } from "../i18n/i18n";

/**
 * Botón "Agregar +" — lleva a la pestaña Explorar → Descubrir (que es la
 * sub-pestaña que se abre por default ahí, no hace falta pedirle una en
 * particular). Se usa en varias pantallas de listas, así que vive acá para
 * no repetir el mismo estilo en cada una.
 */
export default function AgregarButton({ navigation, style }: { navigation: any; style?: any }) {
  const { t } = useT();
  return (
    <Pressable style={[styles.boton, style]} onPress={() => navigation.navigate("Explorar")}>
      <Text style={styles.texto}>{t("Agregar +")}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boton: {
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  texto: { color: theme.colors.primary, fontWeight: "700", fontSize: 13 },
});
