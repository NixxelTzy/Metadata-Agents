export const MAX_IMAGES = 15;

export function compressImage(file: File, maxWidth = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas tidak tersedia"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      img.onerror = () => reject(new Error(`Gagal memuat: ${file.name}`));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error(`Gagal membaca: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function formatKeywords(keywords: string[]): string {
  return keywords.join(", ");
}

export function exportToCsv(results: Array<{ filename: string; title: string; keywords: string[] }>): void {
  // Header sesuai format Adobe Stock bulk upload
  const header = ["Filename", "Title", "Keywords"];

  const rows = results.map((r) => {
    const filename = `"${r.filename.replace(/"/g, '""')}"`;
    const title = `"${r.title.replace(/"/g, '""')}"`;
    const keywords = `"${r.keywords.join(", ").replace(/"/g, '""')}"`;
    return [filename, title, keywords].join(",");
  });

  const csv = [header.join(","), ...rows].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "adobe-stock-metadata.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function extractImageHints(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 50;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(`Dimensions: ${img.width}x${img.height}px`);
        return;
      }

      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const colorMap = new Map<string, number>();

      for (let i = 0; i < data.length; i += 4) {
        const r = Math.round(data[i] / 32) * 32;
        const g = Math.round(data[i + 1] / 32) * 32;
        const b = Math.round(data[i + 2] / 32) * 32;
        const key = `${r},${g},${b}`;
        colorMap.set(key, (colorMap.get(key) ?? 0) + 1);
      }

      const topColors = [...colorMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([rgb]) => `rgb(${rgb})`);

      const orientation =
        img.width > img.height * 1.2
          ? "landscape"
          : img.height > img.width * 1.2
            ? "portrait"
            : "square";

      resolve(
        `Dimensions: ${img.width}x${img.height}px, Orientation: ${orientation}, Dominant colors: ${topColors.join(", ")}`
      );
    };
    img.onerror = () => resolve("Image analysis unavailable");
    img.src = dataUrl;
  });
}
