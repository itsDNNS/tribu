import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DisplayPairingQr, { qrModules } from '../../components/admin/DisplayPairingQr';

const LINK = 'https://tribu.example.com/display?token=tribu_display_AbC-123_xyz';

describe('DisplayPairingQr', () => {
  test('encodes the link with finder patterns in three corners', () => {
    const { size, path } = qrModules(LINK);
    expect(size).toBeGreaterThanOrEqual(21);
    expect((size - 17) % 4).toBe(0);
    const dark = new Set(path.match(/M\d+ \d+/g).map((move) => move.slice(1)));
    for (const [col, row] of [[0, 0], [size - 1, 0], [0, size - 1], [3, 3], [size - 4, 3], [3, size - 4]]) {
      expect(dark.has(`${col} ${row}`)).toBe(true);
    }
    // The ring inside each finder and the separator around it stay light.
    expect(dark.has('1 1')).toBe(false);
    expect(dark.has('7 0')).toBe(false);
    expect(dark.has(`${size - 8} 0`)).toBe(false);
  });

  test('renders a labelled image with a quiet zone', () => {
    render(<DisplayPairingQr value={LINK} label="Scan with the Tribu app" />);
    const svg = screen.getByRole('img', { name: 'Scan with the Tribu app' });
    const { size } = qrModules(LINK);
    expect(svg).toHaveAttribute('viewBox', `-4 -4 ${size + 8} ${size + 8}`);
  });
});
