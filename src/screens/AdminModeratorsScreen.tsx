import React, { useCallback, useState } from "react";
import { View, FlatList, Pressable, StyleSheet } from "react-native";
import { Text } from "../components/Themed";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { quitarModerador } from "../lib/adminModeration";
import ActionSheetModal from "../components/ActionSheetModal";
import ConfirmModal from "../components/ConfirmModal";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Moderador {
  id: string;
  username: string | null;
  display_name: string | null;
}

export default function AdminModeratorsScreen({ navigation }: any) {
  const { t } = useT();
  const [moderadores, setModeradores] = useState<Moderador[]>([]);
  const [loading, setLoading] = useState(true);
  const [seleccionado, setSeleccionado] = useState<Moderador | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("id, username, display_name").eq("is_moderator", true).order("username");
    setModeradores(data ?? []);
    setLoading(false);
  }

  function abrirMenu(m: Moderador) {
    setSeleccionado(m);
    setMenuVisible(true);
  }

  async function confirmarQuitar() {
    if (!seleccionado) return;
    await quitarModerador(seleccionado.id);
    setConfirmVisible(false);
    cargar();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        data={moderadores}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12 }}
        refreshing={loading}
        onRefresh={cargar}
        ListEmptyComponent={<Text style={styles.vacio}>{t("Todavía no hay moderadores.")}</Text>}
        renderItem={({ item }) => (
          <View style={styles.fila}>
            <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate("AdminDenunciasModerador", { userId: item.id, username: item.username })}>
              <Text style={styles.nombre}>{item.display_name || item.username || t("Usuario")}</Text>
              {item.username && <Text style={styles.username}>@{item.username}</Text>}
            </Pressable>
            <Pressable onPress={() => abrirMenu(item)} hitSlop={10}>
              <Text style={styles.puntitos}>⋯</Text>
            </Pressable>
          </View>
        )}
      />

      <ActionSheetModal
        visible={menuVisible}
        onCerrar={() => setMenuVisible(false)}
        titulo={seleccionado?.username ? `@${seleccionado.username}` : undefined}
        opciones={[
          {
            label: t("Dejar de ser moderador"),
            icono: "close-circle-outline",
            destructivo: true,
            onPress: () => {
              setMenuVisible(false);
              setConfirmVisible(true);
            },
          },
          {
            label: t("Ir al perfil"),
            icono: "person-outline",
            onPress: () => {
              setMenuVisible(false);
              if (seleccionado) navigation.navigate("PerfilAjeno", { userId: seleccionado.id });
            },
          },
        ]}
      />

      <ConfirmModal
        visible={confirmVisible}
        onCerrar={() => setConfirmVisible(false)}
        titulo={t("Dejar de ser moderador")}
        mensaje={t("¿Seguro que querés sacarle el rol de moderador a esta persona?")}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: t("Sí, quitar"), onPress: confirmarQuitar, destacado: true },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 32 },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  nombre: { fontSize: 15, fontWeight: "600" },
  username: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  puntitos: { fontSize: 20, color: theme.colors.textMuted, paddingHorizontal: 8 },
});
