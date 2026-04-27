import { buildShoppingWebSocketUrl } from '../../hooks/useWebSocket';

describe('buildShoppingWebSocketUrl', () => {
  test('uses current origin path so reverse proxies do not need port 8000', () => {
    const url = buildShoppingWebSocketUrl(42, new URL('https://tribu.example.test/family'));
    expect(url).toBe('wss://tribu.example.test/ws/shopping/42');
  });

  test('preserves non-standard frontend ports for local development', () => {
    const url = buildShoppingWebSocketUrl('abc', new URL('http://127.0.0.1:3000/app'));
    expect(url).toBe('ws://127.0.0.1:3000/ws/shopping/abc');
  });
});
