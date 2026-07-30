// Metro necesita los require() escritos literal (no se puede armar el path
// con un string dinámico) — por eso el mapa explícito, uno por idioma. Se
// usa tanto en la pantalla de Insignias como en la animación de "subiste de
// nivel", así que vive acá en vez de duplicarse en los dos lugares.
export const IMAGENES_INSIGNIAS_GRANDES: Record<string, Record<number, any>> = {
  es: {
    1: require("../../assets/badges/es/nivel-1.png"),
    2: require("../../assets/badges/es/nivel-2.png"),
    3: require("../../assets/badges/es/nivel-3.png"),
    4: require("../../assets/badges/es/nivel-4.png"),
    5: require("../../assets/badges/es/nivel-5.png"),
    6: require("../../assets/badges/es/nivel-6.png"),
    7: require("../../assets/badges/es/nivel-7.png"),
    8: require("../../assets/badges/es/nivel-8.png"),
    9: require("../../assets/badges/es/nivel-9.png"),
    10: require("../../assets/badges/es/nivel-10.png"),
  },
  en: {
    1: require("../../assets/badges/en/nivel-1.png"),
    2: require("../../assets/badges/en/nivel-2.png"),
    3: require("../../assets/badges/en/nivel-3.png"),
    4: require("../../assets/badges/en/nivel-4.png"),
    5: require("../../assets/badges/en/nivel-5.png"),
    6: require("../../assets/badges/en/nivel-6.png"),
    7: require("../../assets/badges/en/nivel-7.png"),
    8: require("../../assets/badges/en/nivel-8.png"),
    9: require("../../assets/badges/en/nivel-9.png"),
    10: require("../../assets/badges/en/nivel-10.png"),
  },
  pt: {
    1: require("../../assets/badges/pt/nivel-1.png"),
    2: require("../../assets/badges/pt/nivel-2.png"),
    3: require("../../assets/badges/pt/nivel-3.png"),
    4: require("../../assets/badges/pt/nivel-4.png"),
    5: require("../../assets/badges/pt/nivel-5.png"),
    6: require("../../assets/badges/pt/nivel-6.png"),
    7: require("../../assets/badges/pt/nivel-7.png"),
    8: require("../../assets/badges/pt/nivel-8.png"),
    9: require("../../assets/badges/pt/nivel-9.png"),
    10: require("../../assets/badges/pt/nivel-10.png"),
  },
  it: {
    1: require("../../assets/badges/it/nivel-1.png"),
    2: require("../../assets/badges/it/nivel-2.png"),
    3: require("../../assets/badges/it/nivel-3.png"),
    4: require("../../assets/badges/it/nivel-4.png"),
    5: require("../../assets/badges/it/nivel-5.png"),
    6: require("../../assets/badges/it/nivel-6.png"),
    7: require("../../assets/badges/it/nivel-7.png"),
    8: require("../../assets/badges/it/nivel-8.png"),
    9: require("../../assets/badges/it/nivel-9.png"),
    10: require("../../assets/badges/it/nivel-10.png"),
  },
};
