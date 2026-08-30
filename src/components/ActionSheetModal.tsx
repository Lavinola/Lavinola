import React from "react";
import { Modal, View, Pressable, ScrollView, StyleSheet, Dimensions } from "react-native";
import { useSafeAreaInsets, SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Themed";
import { theme } from "../theme";

export interface OpcionMenu {
  label: string;
  onPress: () => void;
  destructivo?: boolean;
  violeta?: boolean; // texto e ícono en violeta (para acciones normales que se quieren destacar, no negativas)
  icono?: keyof typeof Ionicons.glyphMap;
  deshabilitado?: boolean; // se ve en gris y tocarla no hace nada — para mostrar una opción que todavía no se puede usar
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
      {/* El Modal de React Native se renderiza en un árbol nativo aparte —
      el SafeAreaProvider de la raíz de la app no llega hasta acá adentro,
      por eso hace falta uno propio, local a este modal. */}
      <SafeAreaProvider>
        <ContenidoHoja onCerrar={onCerrar} titulo={titulo} opciones={opciones} />
      </SafeAreaProvider>
    </Modal>
  );
}

function ContenidoHoja({ onCerrar, titulo, opciones }: Omit<Props, "visible">) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable style={styles.fondo} onPress={onCerrar}>
      <Pressable style={[styles.hoja, { paddingBottom: 24 + insets.bottom }]} onPress={(e) => e.stopPropagation()}>
        {/* TEXTO TEMPORAL DE DIAGNÓSTICO — sacar después de confirmar el problema */}
        <Text style={{ backgroundColor: "red", color: "white", padding: 8, fontSize: 12, fontWeight: "700" }}>
          DEBUG insets: top={insets.top} bottom={insets.bottom} left={insets.left} right={insets.right} | ventana alto={Dimensions.get("window").height}
        </Text>
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
                if (!op.deshabilitado) op.onPress();
              }}
            >
              {op.icono && (
                <Ionicons
                  name={op.icono}
                  size={19}
                  color={op.deshabilitado ? theme.colors.textFaint : op.destructivo ? theme.colors.danger : theme.colors.primaryLight}
                  style={styles.opcionIcono}
                />
              )}
              <Text
                style={[
                  styles.opcionTexto,
                  op.destructivo && styles.opcionDestructiva,
                  op.violeta && styles.opcionVioleta,
                  op.deshabilitado && styles.opcionDeshabilitada,
                ]}
              >
                {op.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  hoja: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, maxHeight: Dimensions.get("window").height * 0.7 },
  lista: { flexGrow: 1, flexShrink: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  titulo: { fontSize: 15, fontWeight: "700", flex: 1 },
  cerrarBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", marginLeft: 12 },
  cerrarTexto: { color: theme.colors.text, fontSize: 14 },
  opcion: { flexDirection: "row", alignItems: "center", paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  opcionIcono: { marginRight: 12 },
  opcionTexto: { fontSize: 15, color: theme.colors.text },
  opcionDestructiva: { color: theme.colors.danger },
  opcionVioleta: { color: theme.colors.primaryLight, fontWeight: "700" },
  opcionDeshabilitada: { color: theme.colors.textFaint },
});
