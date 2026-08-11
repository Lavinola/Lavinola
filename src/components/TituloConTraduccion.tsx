import React, { useEffect, useState } from "react";
import { StyleProp, TextStyle, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { obtenerTituloSecundario } from "../lib/titleTranslation";
import { theme } from "../theme";

/**
 * Título principal + (entre paréntesis, en gris y más chico) el mismo
 * título en el otro idioma — inglés si estás viendo todo en tu idioma,
 * o tu idioma si estás viendo todo en inglés. No muestra nada extra si
 * tenés la app en inglés (ahí no hay "segundo idioma" que mostrar), o si
 * el título es igual en los dos idiomas (no vale la pena repetirlo).
 */
export default function TituloConTraduccion({
  tipo,
  id,
  titulo,
  style,
  styleSecundario,
  numberOfLines,
}: {
  tipo: "series" | "movie";
  id: number;
  titulo: string;
  style?: StyleProp<TextStyle>;
  styleSecundario?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const [secundario, setSecundario] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setSecundario(null);
    obtenerTituloSecundario(tipo, id).then((t) => {
      if (vigente) setSecundario(t);
    });
    return () => {
      vigente = false;
    };
  }, [tipo, id]);

  const mostrarSecundario = !!secundario && secundario.trim().toLowerCase() !== titulo.trim().toLowerCase();

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {titulo}
      {mostrarSecundario && <Text style={[styles.secundario, styleSecundario]}> ({secundario})</Text>}
    </Text>
  );
}

const styles = StyleSheet.create({
  secundario: { color: theme.colors.textFaint, fontSize: 12, fontWeight: "400", lineHeight: 24 },
});
