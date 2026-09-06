export const mediaTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];
export function mediaFileError(file: Pick<File, "type" | "size">) {
  if (!mediaTypes.includes(file.type))
    return "Format neacceptat. Folosește JPG, PNG, WebP, MP4, MOV sau WebM.";
  const max = (file.type.startsWith("image/") ? 20 : 100) * 1024 * 1024;
  if (!file.size || file.size > max)
    return `Fișierul trebuie să aibă între 1 octet și ${max / 1024 / 1024} MB.`;
  return null;
}
export function opaqueUploadToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function fileChecksum(file: File) {
  if (!crypto.subtle)
    throw new Error("Încărcarea necesită o conexiune HTTPS securizată.");
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function uploadWithProgress(
  file: File,
  url: string,
  headers: Record<string, string>,
  onProgress: (value: number) => void,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const done = (error?: Error) => {
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    xhr.open("PUT", url);
    xhr.timeout = 10 * 60_000;
    Object.entries(headers).forEach(([key, value]) =>
      xhr.setRequestHeader(key, value),
    );
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 95));
    };
    xhr.onload = () =>
      done(
        xhr.status >= 200 && xhr.status < 300
          ? undefined
          : new Error("Încărcarea nu a reușit. Reîncearcă."),
      );
    xhr.onerror = () =>
      done(
        new Error(
          "Conexiunea s-a întrerupt. Reîncearcă atunci când ai internet.",
        ),
      );
    xhr.ontimeout = () =>
      done(
        new Error(
          "Încărcarea a durat prea mult. Reîncearcă pe o conexiune mai bună.",
        ),
      );
    xhr.onabort = () => done(new Error("Încărcare oprită. Poți reîncerca."));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return done(new Error("Încărcare oprită."));
    xhr.send(file);
  });
}
