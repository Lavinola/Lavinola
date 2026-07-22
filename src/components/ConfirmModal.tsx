import React from "react";
import { Modal, View, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { theme } from "../theme";

interface BotonConfirm {
  label: string;
  onPress: () => void;
  destacado?: boolean; // true = violeta con letra negra, false = gris con letra blanca
}

interface Props {
  visible: boolean;
  onCerrar: () => void;
  titulo: string;
  mensaje?: string;
  botones: BotonConfirm[];
}

/** Reemplaza el Alert.alert nativo (blanco, no combina con la app) por uno con la estética de Lavinola. */
export default function ConfirmModal({ visible, onCerrar, titulo, mensaje, botones }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.caja} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titulo}>{titulo}</Text>
          {mensaje && <Text style={styles.mensaje}>{mensaje}</Text>}
          <View style={styles.botonesRow}>
            {botones.map((b, i) => (
              <Pressable
                key={i}
                style={[styles.boton, b.destacado ? styles.botonDestacado : styles.botonNormal]}
                onPress={() => {
                  onCerrar();
                  b.onPress();
                }}
              >
                <Text style={[styles.botonTexto, b.destacado && styles.botonTextoDestacado]}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  caja: { width: "100%", maxWidth: 340, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 20 },
  titulo: { fontSize: 17, fontWeight: "700", marginBottom: 8 },
  mensaje: { fontSize: 14, color: theme.colors.textMuted, marginBottom: 20 },
  botonesRow: { flexDirection: "row", gap: 10 },
  boton: { flex: 1, paddingVertical: 12, borderRadius: theme.radius.md, alignItems: "center" },
  botonNormal: { backgroundColor: theme.colors.surfaceAlt },
  botonDestacado: { backgroundColor: theme.colors.primary },
  botonTexto: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  botonTextoDestacado: { color: "#000000" },
});
