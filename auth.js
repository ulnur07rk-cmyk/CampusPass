// CampusPass — authentication helpers (Node.js crypto only, no external packages)
'use strict';
const crypto = require('node:crypto');

const N = 16384, KEYLEN = 32;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N }).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, KEYLEN, { N });
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

const newToken = () => crypto.randomBytes(32).toString('hex');

// Simple in-memory limiter: max 10 failed logins per IP in 5 minutes (NFR: brute-force protection)
const failures = new Map();
function tooManyAttempts(ip) {
  const now = Date.now(), list = (failures.get(ip) || []).filter((t) => now - t < 5 * 60000);
  failures.set(ip, list);
  return list.length >= 10;
}
function recordFailure(ip) { const l = failures.get(ip) || []; l.push(Date.now()); failures.set(ip, l); }
function clearFailures(ip) { failures.delete(ip); }

module.exports = { hashPassword, verifyPassword, newToken, tooManyAttempts, recordFailure, clearFailures };
