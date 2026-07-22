import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet } from "react-native";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { theme } from "../theme";

interface Miembro {
  id: string;
  username: string | null;
  avatar_url: string | null;
}

export default function GroupMembersScreen({ route, navigation }: any) {
  const { groupId } = route.params;
  const [miembros, setMiembros] = useState<Miembro[]>([]);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data } = await supabase.from("group_members").select("profiles!group_members_user_id_fkey(id, username, avatar_url)").eq("group_id", groupId);
    setMiembros((data ?? []).map((r: any) => r.profiles).filter(Boolean));
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      data={miembros}
      keyExtractor={(m) => m.id}
      contentContainerStyle={{ padding: 12 }}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => navigation.navigate("PerfilAjeno", { userId: item.id })}>
          {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarPlaceholder]} />}
          <Text style={styles.nombre}>{item.username ?? "Usuario"}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, marginRight: 12, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  nombre: { fontSize: 15 },
});
