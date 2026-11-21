import { startBackend, type BackendInstance } from './backend-instance';

/**
 * A second, real backend instance with an empty SQLite DB.
 *
 * "Zero sessions" is a data state, not a failure mode, so it is produced by
 * starting the real server against an empty `DB_PATH` instead of intercepting
 * the list response (docs/e2e-mocking-policy.md). The list endpoint reads only
 * SQLite, so the empty instance never touches S3.
 */

export type EmptyBackend = BackendInstance;

export function startEmptyBackend(): Promise<EmptyBackend> {
  return startBackend();
}
