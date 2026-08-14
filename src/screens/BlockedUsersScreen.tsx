import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Text } from "../components/Themed";
import Avatar from "../components/Avatar";
import { supabase } from "../lib/supabase";
import { usuariosBloqueados, desbloquearUsuario } from "../lib/reports";
import ConfirmModal from "../components/ConfirmModal";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface UsuarioBloqueado {
  id: string;
  username: string | null;
  avatar_url: string | null;
}

export default function BlockedUsersScreen() {
  const { t } = useT();
  const [userId, setUserId] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioBloqueado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [aDesbloquear, setADesbloquear] = useState<UsuarioBloqueado | null>(null);
  const [desbloqueando, setDesbloqueando] = useState(false);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) {
      setCargando(false);
      return;
    }
    setUserId(uid);
    const ids = await usuariosBloqueados(uid);
    if (ids.length === 0) {
      setUsuarios([]);
      setCargando(false);
      return;
    }
    const { data: perfiles } = await supabase.from("profiles").select("id, username, avatar_url").in("id", ids);
    setUsuarios(perfiles ?? []);
    setCargando(false);
  }

  async function confirmarDesbloqueo() {
    if (!userId || !aDesbloquear) return;
    setDesbloqueando(true);
    try {
      await desbloquearUsuario(userId, aDesbloquear.id);
      setUsuarios((prev) => prev.filter((u) => u.id !== aDesbloquear.id));
    } catch (e) {
      console.error("Error al desbloquear:", e);
    } finally {
      setDesbloqueando(false);
      setADesbloquear(null);
    }
  }

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={usuarios}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={<Text style={styles.vacio}>{t("No bloqueaste a nadie todavía.")}</Text>}
        renderItem={({ item }) => (
          <View style={styles.fila}>
            <Avatar uri={item.avatar_url} size={42} />
            <Text style={styles.username} numberOfLines={1}>
              @{item.username ?? t("Usuario")}
            </Text>
            <Pressable style={styles.desbloquearBtn} onPress={() => setADesbloquear(item)}>
              <Text style={styles.desbloquearBtnTexto}>{t("Desbloquear")}</Text>
            </Pressable>
          </View>
        )}
      />

      <ConfirmModal
        visible={!!aDesbloquear}
        onCerrar={() => setADesbloquear(null)}
        titulo={t("Desbloquear")}
        mensaje={
          aDesbloquear
            ? t("¿Seguro que querés desbloquear a @{username}?").replace("{username}", aDesbloquear.username ?? t("Usuario"))
            : ""
        }
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: desbloqueando ? t("Desbloqueando...") : t("Desbloquear"), destacado: true, onPress: confirmarDesbloqueo },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 24 },
  fila: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarPlaceholder: { backgroundColor: theme.colors.surfaceAlt },
  username: { flex: 1, fontSize: 14, fontWeight: "600" },
  desbloquearBtn: {
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  desbloquearBtnTexto: { color: theme.colors.primaryLight, fontWeight: "800", fontSize: 12.5 },
});
