export function appOrigin() {
  const raw = process.env.APP_ORIGIN;
  if (!raw) throw new Error("ยังไม่พร้อมส่งอีเมล กรุณาให้ผู้ดูแลตั้งค่า URL ของแอปก่อน");
  const url = new URL(raw);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.origin !== raw || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) {
    throw new Error("URL ของแอปไม่ถูกต้อง กรุณาติดต่อผู้ดูแล");
  }
  return url.origin;
}
