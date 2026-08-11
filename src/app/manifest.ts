import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BabyTrack – Nhật ký của bé",
    short_name: "BabyTrack",
    description: "Theo dõi ăn, ngủ, thay tã và nhịp sinh hoạt của bé.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f8f6fb",
    theme_color: "#6d4cc4",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.png",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "any",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
