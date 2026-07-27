import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/pagination";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface UsuarioFila {
  id: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
}

type Orden = "alfabetico" | "recientes";

export default function AdminUsersScreen({ navigation }: any) {
  const { t } = useT();
  const [usuarios, setUsuarios] = useState<UsuarioFila[]>([]);
  const [orden, setOrden] = useState<Orden>("alfabetico");
  const [cargando, setCargando] = useState(true);
  const [autorizado, setAutorizado] = useState<boolean | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: t("Usuarios") });
    verificarYcargar();
  }, []);

  async function verificarYcargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setAutorizado(false);
      return;
    }
    const { data: perfil } = await supabase.from("profiles").select("is_admin").eq("id", uid).single();
    if (!perfil?.is_admin) {
      setAutorizado(false);
      return;
    }
    setAutorizado(true);
    setCargando(true);
    const filas = await fetchAllRows<UsuarioFila>((desde, hasta) =>
      supabase.from("profiles").select("id, username, avatar_url, created_at").range(desde, hasta)
    );
    setUsuarios(ordenar(filas, orden));
    setCargando(false);
  }

  function ordenar(filas: UsuarioFila[], criterio: Orden): UsuarioFila[] {
    const copia = [...filas];
    if (criterio === "recientes") copia.sort((a, b) => b.created_at.localeCompare(a.created_at));
    else copia.sort((a, b) => (a.username ?? "").localeCompare(b.username ?? ""));
    return copia;
  }

  function cambiarOrden() {
    const nuevo = orden === "alfabetico" ? "recientes" : "alfabetico";
    setOrden(nuevo);
    setUsuarios((prev) => ordenar(prev, nuevo));
  }

  if (autorizado === false) {
    return (
      <View style={styles.centro}>
        <Text style={styles.vacio}>{t("No tenés permiso para ver esto.")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.ordenBtn} onPress={cambiarOrden}>
        <Ionicons name={orden === "alfabetico" ? "time-outline" : "text-outline"} size={16} color={theme.colors.primaryLight} />
        <Text style={styles.ordenBtnTexto}>
          {orden === "alfabetico" ? t("Ver por más recientes") : t("Ver alfabético")}
        </Text>
      </Pressable>
      <FlatList
        data={usuarios}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={!cargando ? <Text style={styles.vacio}>{t("No hay usuarios todavía.")}</Text> : null}
        renderItem={({ item }) => (
          <Pressable style={styles.fila} onPress={() => navigation.navigate("PerfilAjeno", { userId: item.id })}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]} />
            )}
            <Text style={styles.nombre}>{item.username ?? "—"}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  ordenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    margin: 12,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ordenBtnTexto: { fontSize: 12.5, fontWeight: "700", color: theme.colors.primaryLight },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 32 },
  fila: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  nombre: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
});
