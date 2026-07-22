import React from "react";
import { Modal, View, Pressable, ScrollView, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Themed";
import { theme } from "../theme";

export interface OpcionMenu {
  label: string;
  onPress: () => void;
  destructivo?: boolean;
  violeta?: boolean; // texto e ícono en violeta (para acciones normales que se quieren destacar, no negativas)
  icono?: keyof typeof Ionicons.glyphMap;
}

interface Props {
  visible: boolean;
  onCerrar: () => void;
  titulo?: string;
  opciones: OpcionMenu[];
}

export default function ActionSheetModal({ visible, onCerrar, titulo, opciones }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.hoja} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            {!!titulo && (
              <Text style={styles.titulo} numberOfLines={1}>
                {titulo}
              </Text>
            )}
            <Pressable onPress={onCerrar} hitSlop={12} style={[styles.cerrarBtn, !titulo && { marginLeft: "auto" }]}>
              <Text style={styles.cerrarTexto}>✕</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.lista} bounces={false}>
            {opciones.map((op, i) => (
              <Pressable
                key={i}
                style={styles.opcion}
                onPress={() => {
                  onCerrar();
                  op.onPress();
                }}
              >
                {op.icono && (
                  <Ionicons
                    name={op.icono}
                    size={19}
                    color={op.destructivo ? theme.colors.danger : theme.colors.primaryLight}
                    style={styles.opcionIcono}
                  />
                )}
                <Text style={[styles.opcionTexto, op.destructivo && styles.opcionDestructiva, op.violeta && styles.opcionVioleta]}>{op.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  hoja: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, paddingBottom: 24, maxHeight: Dimensions.get("window").height * 0.7 },
  lista: { flexGrow: 0 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  titulo: { fontSize: 15, fontWeight: "700", flex: 1 },
  cerrarBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", marginLeft: 12 },
  cerrarTexto: { color: theme.colors.text, fontSize: 14 },
  opcion: { flexDirection: "row", alignItems: "center", paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  opcionIcono: { marginRight: 12 },
  opcionTexto: { fontSize: 15, color: theme.colors.text },
  opcionDestructiva: { color: theme.colors.danger },
  opcionVioleta: { color: theme.colors.primaryLight, fontWeight: "700" },
});
