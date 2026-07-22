import React, { useCallback, useState } from "react";
import { View, FlatList, Image, Pressable, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { listarChats, ChatResumen } from "../lib/chats";
import ChatOptionsMenu from "../components/ChatOptionsMenu";
import { formatearFechaHora } from "../lib/dates";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function ActivityScreen({ navigation }: any) {
  const { t } = useT();
  const [chats, setChats] = useState<ChatResumen[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [menuChat, setMenuChat] = useState<ChatResumen | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  async function cargar() {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);
    if (uid) setChats(await listarChats(uid, t));
  }

  const chatsFiltrados = busqueda.trim()
    ? chats.filter((c) => (c.otroUsername ?? "").toLowerCase().includes(busqueda.trim().toLowerCase()))
    : chats;

  return (
    <View style={styles.container}>
      <FlatList
        data={chatsFiltrados}
        keyExtractor={(c) => c.chatId}
        contentContainerStyle={{ padding: 12 }}
        ListHeaderComponent={
          <View style={styles.buscadorConLupa}>
            <Ionicons name="search" size={16} color={theme.colors.primaryLight} />
            <TextInput
              style={styles.buscadorInput}
              placeholder={t("Buscar chat...")}
              placeholderTextColor={theme.colors.textFaint}
              value={busqueda}
              onChangeText={setBusqueda}
            />
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.vacio}>
            {busqueda.trim() ? "No encontramos ningún chat con ese nombre." : t("Todavía no tenés conversaciones. Recomendale algo a alguien para arrancar una.")}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, item.noLeidos > 0 && styles.cardNoLeida]}
            onPress={() => navigation.navigate("HiloActividad", { chatId: item.chatId, otroUsername: item.otroUsername, otroUserId: item.otroUserId })}
          >
            {item.noLeidos > 0 && (
              <View style={styles.noLeidosBadge}>
                <Text style={styles.noLeidosTexto}>{item.noLeidos > 99 ? "99+" : item.noLeidos}</Text>
              </View>
            )}
            {item.otroAvatarUrl ? (
              <Image source={{ uri: item.otroAvatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>
                {item.otroUsername ?? t("Usuario")} {item.silenciado && "🔇"}
              </Text>
              {item.noLeidos > 0 ? (
                <Text style={styles.nuevoMensaje}>{t("Tienen mensajes nuevos")}</Text>
              ) : (
                item.ultimoMensaje && (
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.ultimoMensaje}
                  </Text>
                )
              )}
            </View>
            <View style={styles.derechaCol}>
              <Pressable
                style={styles.menuBtn}
                onPress={() => {
                  setMenuChat(item);
                  setMenuVisible(true);
                }}
                hitSlop={10}
              >
                <Text style={styles.menuBtnTexto}>⋯</Text>
              </Pressable>
              {item.ultimoMensajeFecha && <Text style={styles.fecha}>{formatearFechaHora(item.ultimoMensajeFecha)}</Text>}
            </View>
          </Pressable>
        )}
      />

      {menuChat && (
        <ChatOptionsMenu
          visible={menuVisible}
          onCerrar={() => setMenuVisible(false)}
          userId={userId}
          chatId={menuChat.chatId}
          otroUserId={menuChat.otroUserId}
          silenciado={menuChat.silenciado}
          bloqueado={menuChat.bloqueado}
          onCambio={cargar}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  buscadorConLupa: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  buscadorInput: { flex: 1, color: theme.colors.text, fontSize: 14, padding: 0 },
  topRow: { flexDirection: "row", padding: 12 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 20 },
  card: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, marginBottom: 8, position: "relative" },
  cardNoLeida: { backgroundColor: theme.colors.primaryDark },
  avatar: { width: 46, height: 46, borderRadius: 23, marginRight: 12, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  nombre: { fontSize: 15, fontWeight: "700" },
  preview: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  nuevoMensaje: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700", marginTop: 2 },
  fecha: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2 },
  derechaCol: { alignItems: "flex-end" },
  menuBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  menuBtnTexto: { fontSize: 20, color: theme.colors.textMuted },
  noLeidosBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#E8E8E8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: theme.colors.background,
    zIndex: 1,
  },
  noLeidosTexto: { fontSize: 10, fontWeight: "700", color: theme.colors.background },
});
