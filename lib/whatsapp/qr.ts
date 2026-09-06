import QRCode from "qrcode";

export async function qrToDataUrl(qr: string): Promise<string> {
  return QRCode.toDataURL(qr, { margin: 1, width: 256 });
}
