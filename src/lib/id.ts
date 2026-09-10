/** Short, collision-resistant ids. `randomUUID` isn't available on every browser we target. */
export function newId(): string {
  const bytes = new Uint8Array(9);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (const b of bytes) out += b.toString(36).padStart(2, "0");
  return out.slice(0, 12);
}
