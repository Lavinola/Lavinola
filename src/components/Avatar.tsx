import React, { useEffect, useState } from "react";
import { Image, View, StyleProp, ImageStyle } from "react-native";
import { theme } from "../theme";

const REINTENTOS_MAXIMOS = 3;

/**
 * Avatar con reintento automático si falla la carga — pensado sobre todo
 * para los avatares generados por default (DiceBear), que a veces
 * rechazan el pedido si se cargan muchos de golpe (por ejemplo, una lista
 * larga de usuarios o varios posts del Lobby a la vez), no porque la
 * imagen no exista. Ante ese tipo de error transitorio, reintenta un par
 * de veces con una pequeña espera antes de rendirse y mostrar el
 * placeholder gris de siempre.
 */
export default function Avatar({ uri, size = 36, style }: { uri: string | null | undefined; size?: number; style?: StyleProp<ImageStyle> }) {
  const [intento, setIntento] = useState(0);
  const [seRindio, setSeRindio] = useState(false);

  useEffect(() => {
    setIntento(0);
    setSeRindio(false);
  }, [uri]);

  const base = { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.surfaceAlt };

  if (!uri || seRindio) {
    return <View style={[base, style]} />;
  }

  return (
    <Image
      key={intento}
      source={{ uri }}
      style={[base, style]}
      onError={() => {
        if (intento < REINTENTOS_MAXIMOS) {
          setTimeout(() => setIntento((i) => i + 1), 500 * (intento + 1));
        } else {
          setSeRindio(true);
        }
      }}
    />
  );
}
