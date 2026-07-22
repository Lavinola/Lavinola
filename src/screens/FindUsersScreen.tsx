import React, { useCallback, useEffect, useState } from "react";
import { View, TextInput, FlatList, Pressable, Image, StyleSheet, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { buscarUsuarios, dejarDeSeguir, UsuarioBasico } from "../lib/follows";
import { seguirRespetandoPrivacidad } from "../lib/followRequests";
import { Text } from "../components/Themed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function FindUsersScreen({ navigation }: any) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<UsuarioBasico[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Se re-lee cada vez que la pantalla toma foco, así si seguiste/dejaste de
  // seguir a alguien desde otro lado (su perfil, por ejemplo) y volvés acá,
  // el botón ya refleja el estado correcto.
  useFocusEffect(
    useCallback(() => {
      supabase.auth.getUser().then(({ data }) => {
        const uid = data.user?.id ?? null;
        setUserId(uid);
        if (query.trim().length >= 2) buscarCon(uid, query);
      });
    }, [])
  );

  async function buscarCon(uid: string | null, texto: string) {
    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    const data = await buscarUsuarios(texto.trim(), uid);
    setResultados(data);
  }

  function buscar(texto: string) {
    setQuery(texto);
    buscarCon(userId, texto);
  }

  async function toggleFollow(u: UsuarioBasico) {
    if (!userId || u.solicitudPendiente) return;
    try {
      if (u.siguiendo) {
        await dejarDeSeguir(userId, u.id);
      } else {
        await seguirRespetandoPrivacidad(userId, u.id);
      }
      buscarCon(userId, query);
    } catch (e: any) {
      Alert.alert("No se pudo actualizar", e.message);
    }
  }

  return (
    <View style={styles.container}>
      <TextInput placeholderTextColor={theme.colors.textFaint} style={styles.input} placeholder={t("Buscar por usuario...")} value={query} onChangeText={buscar} />
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={resultados}
        keyExtractor={(u) => u.id}
        ListEmptyComponent={
          query.length >= 2 ? <Text style={styles.vacio}>{t("No encontramos a nadie con ese nombre.")}</Text> : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable style={styles.cardInfo} onPress={() => navigation.navigate("PerfilAjeno", { userId: item.id })}>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <Text style={styles.username}>{item.username ?? "Usuario"}</Text>
            </Pressable>
            <Pressable
              style={[styles.followBtn, (item.siguiendo || item.solicitudPendiente) && styles.followBtnActivo]}
              onPress={() => toggleFollow(item)}
              disabled={item.solicitudPendiente}
            >
              <Text style={[styles.followBtnText, (item.siguiendo || item.solicitudPendiente) && styles.followBtnTextActivo]}>
                {item.solicitudPendiente ? t("Solicitud enviada") : item.siguiendo ? t("Siguiendo") : t("Seguir")}
              </Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: theme.colors.background },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 10, marginBottom: 12, color: theme.colors.text, backgroundColor: theme.colors.surface },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  cardInfo: { flexDirection: "row", alignItems: "center", flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  username: { flex: 1, fontSize: 15 },
  followBtn: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  followBtnText: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  followBtnActivo: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
  followBtnTextActivo: { color: theme.colors.textMuted },
});
