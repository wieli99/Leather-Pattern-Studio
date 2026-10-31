export type ImportedImage = {
  name: string;
  data: string;
  width: number;
  height: number;
};

export async function decodeImageFile(file: File): Promise<ImportedImage> {
  if (!file.type && /\.svg$/i.test(file.name))
    file = new File([file], file.name, { type: "image/svg+xml" });
  if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type))
    throw Error("Choose a PNG, JPEG, WebP or SVG image");
  if (file.size > 7_000_000)
    throw Error("Image is too large for the 10 MB project limit");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("Could not read image"));
    reader.readAsDataURL(file);
  });
  const bitmap = new Image();
  bitmap.src = data;
  await bitmap.decode();
  if (!bitmap.naturalWidth || !bitmap.naturalHeight)
    throw Error("Image has invalid dimensions");
  return { name: file.name.slice(0, 200), data,
    width: bitmap.naturalWidth, height: bitmap.naturalHeight };
}
