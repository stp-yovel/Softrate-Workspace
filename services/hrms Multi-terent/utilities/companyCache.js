/**
 * companyCache.js
 * Shared in-memory cache for master-DB company lookups.
 * Prevents full Atlas collection scans on every login/public request.
 *
 * TTL: 10 minutes (companies don't change often; login-critical path)
 */

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const _cache = new Map();

/**
 * Get cached company by companyCode (case-insensitive key).
 * @param {string} companyCode
 * @returns {object|null}
 */
function getCachedCompany(companyCode) {
  const key = companyCode.toLowerCase();
  const entry = _cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  _cache.delete(key);
  return null;
}

/**
 * Store a company in the cache by companyCode (case-insensitive).
 * @param {string} companyCode
 * @param {object} companyData
 */
function setCachedCompany(companyCode, companyData) {
  const key = companyCode.toLowerCase();
  _cache.set(key, { data: companyData, expiresAt: Date.now() + CACHE_TTL });
}

/**
 * Invalidate a single company entry (e.g., after settings update).
 * @param {string} companyCode
 */
function invalidateCachedCompany(companyCode) {
  _cache.delete(companyCode.toLowerCase());
}

/**
 * Resolve a company from masterDb or cache.
 * Returns { companyCode, dbName, _id, ... } or null if not found.
 *
 * @param {string} companyCode
 * @param {object} masterDb - mongoose connection to master DB
 * @param {object} CompanySchema - mongoose schema for Company
 */
async function resolveCompany(companyCode, masterDb, CompanySchema) {
  const cleanCode = companyCode.trim();
  const cached = getCachedCompany(cleanCode);
  if (cached) return cached;

  const MasterCompany =
    masterDb.models.Company || masterDb.model('Company', CompanySchema);

  // Try exact match first (fast index hit if companyCode is indexed)
  let company = await MasterCompany.findOne({ companyCode: cleanCode }).select(
    'companyCode name dbName settings.receivingEmail settings.defaultPassword _id'
  );

  // Fallback to case-insensitive regex only if exact match fails
  if (!company) {
    const escaped = cleanCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    company = await MasterCompany.findOne({
      companyCode: { $regex: new RegExp(`^${escaped}$`, 'i') }
    }).select('companyCode name dbName settings.receivingEmail settings.defaultPassword _id');
  }

  if (company) {
    const plain = company.toObject ? company.toObject() : company;
    setCachedCompany(cleanCode, plain);
    return plain;
  }

  return null;
}

module.exports = { getCachedCompany, setCachedCompany, invalidateCachedCompany, resolveCompany };
