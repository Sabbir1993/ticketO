'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
export default function QR({ value, size = 160, className, alt }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc); }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt={alt || `QR code ${value}`} className={className} /> : <div style={{ width: size, height: size }} className="animate-pulse rounded bg-ink-100" />;
}
