/**
 * A tiny registry holding the single live Baileys socket so the inbound
 * listener (index.ts) and the outbound HTTP server (server.ts) share ONE
 * socket. index.ts calls `setSocket` whenever it (re)creates the socket and
 * clears it on disconnect; the HTTP handler reads it via `getSocket`.
 */
import type { WASocket } from "@whiskeysockets/baileys";

let current: WASocket | null = null;

/** Store the live socket (called by index.ts after makeWASocket / on open). */
export function setSocket(sock: WASocket | null): void {
  current = sock;
}

/** Get the live socket, or null if not connected. */
export function getSocket(): WASocket | null {
  return current;
}

/** True when a live socket is present (used by GET /health). */
export function isConnected(): boolean {
  return current !== null;
}
