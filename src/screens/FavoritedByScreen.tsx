import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../components/Themed";
import { listarUsuariosQueFavoritearon, UsuarioFavoriteo } from "../lib/favorites";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function FavoritedByScreen({ route, navigation }: any) {
  const { t } = useT();
  const { itemType, tmdbId, nombre } = route.params;
  const [usuarios, setUsuarios] = useState<UsuarioFavoriteo[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    navigation.setOptions({ title: nombre ? `${nombre} ${t("en Favoritos")}` : t("En Favoritos") });
  }, [nombre]);

  useEffect(() => {
    listarUsuariosQueFavoritearon(itemType, tmdbId)
      .then(setUsuarios)
      .finally(() => setLoading(false));
  }, []);

  const filtrados = busqueda.trim()
    ? usuarios.filter((u) => (u.username ?? "").toLowerCase().includes(busqueda.trim().toLowerCase()))
    : usuarios;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.buscadorConLupa}>
        <Ionicons name="search" size={16} color={theme.colors.primaryLight} />
        <TextInput
          style={styles.buscadorInput}
          placeholder={t("Buscar usuario...")}
          placeholderTextColor={theme.colors.textFaint}
          value={busqueda}
          onChangeText={setBusqueda}
        />
      </View>
      <FlatList
        data={filtrados}
        keyExtractor={(u) => u.user_id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.vacio}>
              {busqueda.trim() ? t("No encontramos ningún usuario con ese nombre.") : t("Todavía nadie que muestre sus favoritas la agregó.")}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate("PerfilAjeno", { userId: item.user_id })}>
            {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarPlaceholder]} />}
            <Text style={styles.nombre}>{item.username ?? "Usuario"}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  buscadorConLupa: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
  },
  buscadorInput: { flex: 1, color: theme.colors.text, paddingVertical: 10 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 20 },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, marginRight: 12, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  nombre: { fontSize: 15 },
});
