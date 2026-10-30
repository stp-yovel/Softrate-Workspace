/**
 * loginPreflight.middleware.js
 *
 * Runs BEFORE the login controller to:
 * 1. Ensure the master DB connection is ready (with a timeout to avoid hanging).
 * 2. Resolve + cache the company from masterDB so the controller never re-fetches it.
 * 3. Pre-open the tenant DB connection in the background (non-blocking).
 *
 * This eliminates the cold-start delay on Flutter login that was caused by:
 *  - waitForConnection() inside the controller blocking for up to 26s on Atlas M0 wakeup
 *  - Two sequential master-DB round-trips (company lookup + defaultPassword fetch)
 */

const { getMasterConnection, getTenantConnection, waitForConnection } = require('../db');
const CompanyModelExport = require('../models/CompanyModel');
const { resolveCompany, getCachedCompany, setCachedCompany } = require('../utilities/companyCache');

const PREFLIGHT_TIMEOUT_MS = 6000; // max 6s wait for DB before letting controller handle it

/**
 * Wraps waitForConnection with a max timeout so login never hangs indefinitely.
 * If the DB doesn't connect in time, we just let the request proceed — the
 * controller already handles connection errors.
 */
async function waitWithTimeout(conn, timeoutMs) {
  if (conn.readyState === 1) return conn; // already connected — instant
  return Promise.race([
    waitForConnection(conn),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`DB connection timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Pre-warm the master DB and resolve the company from cache.
 * Attaches req._preflightCompany and req._preflightDbName for the login controller to use.
 */
const loginPreflight = async (req, res, next) => {
  try {
    const companyCode = req.body?.companyCode?.trim();
    const masterDb = getMasterConnection();

    // ── 1. Ensure master DB is ready (fast if already connected) ──
    // We use a timeout so if Atlas is waking up, we don't block — the controller
    // will handle the connection state naturally.
    try {
      await waitWithTimeout(masterDb, PREFLIGHT_TIMEOUT_MS);
    } catch (timeoutErr) {
      // Non-fatal: continue — controller will call waitForConnection itself
      console.warn('[loginPreflight] Master DB not ready within timeout, proceeding anyway:', timeoutErr.message);
    }

    // ── 2. Resolve company from cache (or DB if not cached) ──
    if (companyCode) {
      let company = null;
      try {
        company = await resolveCompany(companyCode, masterDb, CompanyModelExport.schema);
      } catch (err) {
        console.warn('[loginPreflight] Company resolution failed (non-fatal):', err.message);
      }

      if (company) {
        // Attach to request so the login controller can skip its own DB lookup
        req._preflightCompany = company;
        req._preflightDbName = company.dbName || `hrdb_${companyCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;

        // ── 3. Pre-open the tenant connection in the background ──
        // This means by the time login controller reaches getTenantConnection(),
        // the pool is already warm — avoids the second big waitForConnection block.
        const tenantDb = getTenantConnection(req._preflightDbName);
        if (tenantDb.readyState !== 1) {
          waitWithTimeout(tenantDb, PREFLIGHT_TIMEOUT_MS).catch(() => {
            // Non-fatal background warm-up — swallow timeout
          });
        }
      }
    } else {
      // No companyCode — legacy hrdb path (old mobile users)
      req._preflightDbName = 'hrdb';
      const legacyDb = getTenantConnection('hrdb');
      if (legacyDb.readyState !== 1) {
        waitWithTimeout(legacyDb, PREFLIGHT_TIMEOUT_MS).catch(() => {});
      }
    }
  } catch (err) {
    // Preflight is fully non-fatal — never block login on middleware error
    console.error('[loginPreflight] Unexpected error (non-fatal):', err.message);
  }

  next();
};

module.exports = loginPreflight;
