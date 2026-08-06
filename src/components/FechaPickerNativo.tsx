import React from "react";
import { Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

interface Props {
  value: Date;
  maximumDate?: Date;
  onElegida: (fecha: Date) => void;
  onCerrar: () => void;
}

/**
 * @react-native-community/datetimepicker es una librería nativa — no
 * dibuja nada en la versión web de la app, así que "Elegir otra fecha"
 * no hacía nada ahí. En web usamos el selector de fecha propio del
 * navegador (<input type="date">, ya viene con calendario y todo), y en
 * la app (Android/iOS) seguimos usando el picker nativo de siempre.
 */
export default function FechaPickerNativo({ value, maximumDate, onElegida, onCerrar }: Props) {
  if (Platform.OS === "web") {
    return React.createElement("input", {
      type: "date",
      autoFocus: true,
      defaultValue: value.toISOString().slice(0, 10),
      max: maximumDate ? maximumDate.toISOString().slice(0, 10) : undefined,
      onChange: (e: any) => {
        if (e.target.value) onElegida(new Date(e.target.value + "T00:00:00"));
        onCerrar();
      },
      onBlur: onCerrar,
      style: {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 99999,
        fontSize: 16,
        padding: 10,
        borderRadius: 8,
        border: "1px solid #A63FE0",
        background: "#161616",
        color: "#FFFFFF",
      },
    });
  }

  return (
    <DateTimePicker
      value={value}
      mode="date"
      display="default"
      maximumDate={maximumDate}
      onChange={(_event: any, fecha?: Date) => {
        onCerrar();
        if (fecha) onElegida(fecha);
      }}
    />
  );
}
