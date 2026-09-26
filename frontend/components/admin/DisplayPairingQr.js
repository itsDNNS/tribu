import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

const QUIET_ZONE = 4;

// Dark modules of the QR code as a single SVG path, one unit per module.
export function qrModules(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
    }
  }
  return { size, path };
}

/**
 * Pairing code for the Tribu app's family display mode: the tablet scans it
 * instead of typing the display link. Always dark on white so phone cameras
 * read it in every theme.
 */
export default function DisplayPairingQr({ value, label }) {
  const { size, path } = useMemo(() => qrModules(value), [value]);
  const box = size + QUIET_ZONE * 2;
  return (
    <svg
      className="display-pairing-qr"
      role="img"
      aria-label={label}
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${box} ${box}`}
      shapeRendering="crispEdges"
      data-testid="display-pairing-qr"
    >
      <rect x={-QUIET_ZONE} y={-QUIET_ZONE} width={box} height={box} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
