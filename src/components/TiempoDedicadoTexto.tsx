import React from "react";
import { Text } from "./Themed";
import { formatTiempo } from "../lib/stats";
import { useT } from "../i18n/i18n";

interface Props {
  minutos: number;
  tamanoNumero?: number; // tamaño de los números — las letras (A/M/D/H) salen un poco más chicas que esto
  color?: string; // mismo color para números y letras (antes las letras quedaban en gris por error)
}

/**
 * Muestra "1A 0M 3D 18H" (o "2M 18D 8H" si todavía no hay años). Usa el
 * Text propio de la app (no el de react-native puro) para heredar bien el
 * color por defecto — antes, al usar el de react-native, los números
 * quedaban en negro en vez de blanco.
 */
export default function TiempoDedicadoTexto({ minutos, tamanoNumero = 17, color }: Props) {
  const { t } = useT();
  const { anios, meses, dias, horas } = formatTiempo(minutos);
  const estiloNumero = { fontSize: tamanoNumero, fontWeight: "700" as const, ...(color ? { color } : {}) };
  const estiloLetra = { fontSize: Math.max(tamanoNumero - 4, 9), fontWeight: "700" as const, ...(color ? { color } : {}) };

  return (
    <Text>
      {anios > 0 && (
        <>
          <Text style={estiloNumero}>{anios}</Text>
          <Text style={estiloLetra}>{t("A")} </Text>
        </>
      )}
      <Text style={estiloNumero}>{meses}</Text>
      <Text style={estiloLetra}>M </Text>
      <Text style={estiloNumero}>{dias}</Text>
      <Text style={estiloLetra}>{t("D")} </Text>
      <Text style={estiloNumero}>{horas}</Text>
      <Text style={estiloLetra}>{t("H")}</Text>
    </Text>
  );
}
