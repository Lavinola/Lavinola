import React, { useState, useRef } from "react";
import { TextInput, View, Pressable, FlatList, StyleSheet, StyleProp, TextStyle, NativeSyntheticEvent, TextInputSelectionChangeEventData } from "react-native";
import Avatar from "./Avatar";
import NombreUsuario from "./NombreUsuario";
import { buscarCandidatosMencion, detectarMencionEnCurso, completarMencion, CandidatoMencion } from "../lib/mentions";
import { theme } from "../theme";

interface Props {
  userId: string | null;
  groupId?: string | null;
  value: string;
  onChangeText: (texto: string) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  placeholderTextColor?: string;
  multiline?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  editable?: boolean;
}

/**
 * TextInput con autocompletado de @menciones — al escribir "@" y letras,
 * aparece una lista de gente que seguís (y, si estás adentro de un grupo,
 * que además sea miembro de ese grupo) para elegir y completar. Mismo
 * criterio que cualquier red social, pero acotado a follows (no se puede
 * mencionar a cualquiera).
 */
export default function MentionTextInput({ userId, groupId, value, onChangeText, style, placeholder, placeholderTextColor, multiline, maxLength, autoFocus, editable }: Props) {
  const [candidatos, setCandidatos] = useState<CandidatoMencion[]>([]);
  const [mencionEnCurso, setMencionEnCurso] = useState<{ query: string; inicio: number } | null>(null);
  const cursorRef = useRef(0);
  const pedidoIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function alCambiarSeleccion(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    cursorRef.current = e.nativeEvent.selection.start;
  }

  function alCambiarTexto(texto: string) {
    onChangeText(texto);
    // El evento de texto llega antes de que se actualice la selección para
    // el nuevo largo — usamos la posición del cursor previa a este cambio
    // más la diferencia de largo, así la detección de "@algo" no queda un
    // toque atrasada.
    const posEstimada = cursorRef.current + (texto.length - value.length);
    const deteccion = detectarMencionEnCurso(texto, Math.max(0, posEstimada));
    setMencionEnCurso(deteccion);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!deteccion || !userId) {
      setCandidatos([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const miPedido = ++pedidoIdRef.current;
      const resultados = await buscarCandidatosMencion(userId, deteccion.query, groupId ?? undefined).catch(() => []);
      if (pedidoIdRef.current === miPedido) setCandidatos(resultados);
    }, 200);
  }

  function elegirCandidato(candidato: CandidatoMencion) {
    if (!mencionEnCurso) return;
    const { texto, cursor } = completarMencion(value, mencionEnCurso.inicio, cursorRef.current, candidato.username);
    onChangeText(texto);
    cursorRef.current = cursor;
    setMencionEnCurso(null);
    setCandidatos([]);
  }

  return (
    <View style={{ flex: 1 }}>
      {mencionEnCurso && candidatos.length > 0 && (
        <View style={styles.listaBox}>
          <FlatList
            data={candidatos}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.fila} onPress={() => elegirCandidato(item)}>
                <Avatar uri={item.avatar_url} size={28} />
                <View style={{ marginLeft: 8 }}>
                  <NombreUsuario username={item.username} displayName={item.display_name} style={styles.nombre} />
                </View>
              </Pressable>
            )}
          />
        </View>
      )}
      <TextInput
        style={style}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        value={value}
        onChangeText={alCambiarTexto}
        onSelectionChange={alCambiarSeleccion}
        multiline={multiline}
        maxLength={maxLength}
        autoFocus={autoFocus}
        editable={editable}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listaBox: {
    maxHeight: 180,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    marginBottom: 6,
    overflow: "hidden",
  },
  fila: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10 },
  nombre: { fontSize: 13, color: theme.colors.text },
});
