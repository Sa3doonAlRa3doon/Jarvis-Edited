import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GOOGLE_OAUTH_PORT,
  DEFAULT_SETTINGS_BACKEND_PORT,
  googleOAuthClientFromEnvironment,
  resolveGoogleOAuthConfig
} from '../lib/google-oauth-config.mjs';

test('requires both private Google OAuth environment values before using them', () => {
  assert.equal(googleOAuthClientFromEnvironment({ GOOGLE_CLIENT_ID: 'id-only' }), null);
  assert.equal(googleOAuthClientFromEnvironment({ GOOGLE_CLIENT_SECRET: 'secret-only' }), null);
  assert.deepEqual(googleOAuthClientFromEnvironment({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }), {
    client_id: 'id', client_secret: 'secret'
  });
});

test('default Google callback uses a dedicated port separate from the settings service', () => {
  const config = resolveGoogleOAuthConfig({});
  assert.equal(DEFAULT_SETTINGS_BACKEND_PORT, 8789);
  assert.equal(DEFAULT_GOOGLE_OAUTH_PORT, 8792);
  assert.equal(config.port, 8792);
  assert.equal(config.redirectUri, 'http://127.0.0.1:8792/');
});

test('migrates the legacy Google callback away from the settings backend port', () => {
  const config = resolveGoogleOAuthConfig({ GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:8789/' });
  assert.equal(config.port, 8792);
  assert.equal(config.redirectUri, 'http://localhost:8792/');
  assert.equal(config.migratedFrom, 'http://localhost:8789/');
});

test('migrates an explicitly configured legacy OAuth port and aligns both settings', () => {
  const config = resolveGoogleOAuthConfig({
    GOOGLE_OAUTH_PORT: '8789',
    GOOGLE_OAUTH_REDIRECT_URI: 'http://127.0.0.1:8789/'
  });
  assert.equal(config.port, 8792);
  assert.equal(config.redirectUri, 'http://127.0.0.1:8792/');
});

test('supports an explicitly registered loopback callback on a separate custom port', () => {
  const config = resolveGoogleOAuthConfig({
    JARVIS_SETTINGS_BACKEND_PORT: '8800',
    GOOGLE_OAUTH_PORT: '9000',
    GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:9000/consent'
  });
  assert.equal(config.port, 9000);
  assert.equal(config.redirectUri, 'http://localhost:9000/consent');
});

test('rejects public hosts, invalid ports, and mismatched explicit callback ports', () => {
  assert.throws(() => resolveGoogleOAuthConfig({ GOOGLE_OAUTH_REDIRECT_URI: 'https://example.com/callback' }), /stays local/i);
  assert.throws(() => resolveGoogleOAuthConfig({ GOOGLE_OAUTH_PORT: '80' }), /integer port/i);
  assert.throws(() => resolveGoogleOAuthConfig({ GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:8792/callback?ignored=yes' }), /must not contain query/i);
  assert.throws(() => resolveGoogleOAuthConfig({ GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:8792/callback#fragment' }), /must not contain query/i);
  assert.throws(() => resolveGoogleOAuthConfig({
    GOOGLE_OAUTH_PORT: '8792',
    GOOGLE_OAUTH_REDIRECT_URI: 'http://127.0.0.1:9000/'
  }), /must match the port/i);
  assert.throws(() => resolveGoogleOAuthConfig({
    GOOGLE_OAUTH_PORT: '8792',
    GOOGLE_OAUTH_REDIRECT_URI: 'http://127.0.0.1:9000/'
  }), /must match the port/i);
});

test('moves an explicitly collided callback to the separate default port', () => {
  const config = resolveGoogleOAuthConfig({
    JARVIS_SETTINGS_BACKEND_PORT: '8800',
    GOOGLE_OAUTH_PORT: '8800',
    GOOGLE_OAUTH_REDIRECT_URI: 'http://127.0.0.1:8800/'
  });
  assert.equal(config.port, 8792);
  assert.equal(config.redirectUri, 'http://127.0.0.1:8792/');
});
