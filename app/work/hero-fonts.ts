import { Archivo, IBM_Plex_Mono } from "next/font/google";

/* HALOGRIP's small-text pair, loaded only by the case-study route. */
export const heroSans = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--hero-sans",
});
export const heroMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--hero-mono",
});
