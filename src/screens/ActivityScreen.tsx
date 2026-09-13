import React, { useCallback, useState } from "react";
import { View, FlatList, Image, Pressable, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Text } from "../components/Themed";
import Avatar from "../components/Avatar";
import NombreUsuario from "../components/NombreUsuario";
import { supabase } from "../lib/supabase";
import { listarChats, ChatResumen, obtenerOCrearChat } from "../lib/chats";
import { usuariosQueSigo, UsuarioBasico } from "../lib/follows";
import ChatOptionsMenu from "../components/ChatOptionsMenu";
import { formatearFechaHora } from "../lib/dates";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

const TANDA_INICIAL = 15;
const TANDA_SIGUIENTE = 10;

export default function ActivityScreen({ navigation }: any) {
  const { t } = useT();
  const [chats, setChats] = useState<ChatResumen[]>([]);
  const [sinInteractuar, setSinInteractuar] = useState<UsuarioBasico[]>([]);
  const [cantidadMostrada, setCantidadMostrada] = useState(TANDA_INICIAL);
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
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;
    const [chatsData, seguidos] = await Promise.all([listarChats(uid, t), usuariosQueSigo(uid)]);
    setChats(chatsData);
    const conChatYa = new Set(chatsData.map((c) => c.otroUserId));
    const sinChat = seguidos
      .filter((u) => !conChatYa.has(u.id))
      .sort((a, b) => (a.username ?? "").toLowerCase().localeCompare((b.username ?? "").toLowerCase()));
    setSinInteractuar(sinChat);
    setCantidadMostrada(TANDA_INICIAL);
  }

  const chatsFiltrados = busqueda.trim()
    ? chats.filter(
        (c) =>
          (c.otroUsername ?? "").toLowerCase().includes(busqueda.trim().toLowerCase()) ||
          (c.otroDisplayName ?? "").toLowerCase().includes(busqueda.trim().toLowerCase())
      )
    : chats;

  const sinInteractuarFiltrados = busqueda.trim()
    ? sinInteractuar.filter(
        (u) =>
          (u.username ?? "").toLowerCase().includes(busqueda.trim().toLowerCase()) ||
          (u.display_name ?? "").toLowerCase().includes(busqueda.trim().toLowerCase())
      )
    : sinInteractuar;

  const sinInteractuarMostrados = sinInteractuarFiltrados.slice(0, cantidadMostrada);

  async function abrirChatCon(u: UsuarioBasico) {
    if (!userId) return;
    const chatId = await obtenerOCrearChat(u.id);
    navigation.navigate("HiloActividad", { chatId, otroUsername: u.username, otroUserId: u.id });
  }

  return (
    <View style={styles.container}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={chatsFiltrados}
        keyExtractor={(c) => c.chatId}
        contentContainerStyle={{ padding: 12 }}
        onEndReachedThreshold={0.4}
        onEndReached={() => setCantidadMostrada((prev) => Math.min(prev + TANDA_SIGUIENTE, sinInteractuarFiltrados.length))}
        ListHeaderComponent={
          <View style={styles.buscadorFilaConBoton}>
            <View style={[styles.buscadorConLupa, { flex: 1, marginBottom: 0 }]}>
              <Ionicons name="search" size={16} color={theme.colors.primaryLight} />
              <TextInput
                style={styles.buscadorInput}
                placeholder={t("Buscar chat...")}
                placeholderTextColor={theme.colors.textFaint}
                value={busqueda}
                onChangeText={setBusqueda}
              />
            </View>
            <Pressable style={styles.nuevoChatBtn} onPress={() => navigation.navigate("BuscadorGlobal", { tabInicial: "usuarios" })} hitSlop={8}>
              <Ionicons name="add" size={22} color={theme.colors.primaryLight} />
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          chatsFiltrados.length === 0 && sinInteractuarMostrados.length === 0 ? (
            <Text style={styles.vacio}>
              {busqueda.trim() ? "No encontramos ningún chat con ese nombre." : t("Todavía no tenés conversaciones. Recomendale algo a alguien para arrancar una.")}
            </Text>
          ) : null
        }
        ListFooterComponent={
          sinInteractuarMostrados.length > 0 ? (
            <View>
              {sinInteractuarMostrados.map((u) => (
                <Pressable key={u.id} style={styles.card} onPress={() => abrirChatCon(u)}>
                  <Avatar uri={u.avatar_url} size={46} style={{ marginRight: 12 }} />
                  <NombreUsuario style={styles.nombre} displayName={u.display_name} username={u.username} />
                </Pressable>
              ))}
            </View>
          ) : null
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
            <Avatar uri={item.otroAvatarUrl} size={46} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <NombreUsuario style={styles.nombre} displayName={item.otroDisplayName} username={item.otroUsername} />
                {item.silenciado && <Text style={styles.nombre}> 🔇</Text>}
              </View>
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
  buscadorFilaConBoton: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  nuevoChatBtn: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.md,
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
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
