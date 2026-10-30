const { getMasterConnection, getTenantConnection, waitForConnection } = require('../db');
const CompanyModelExport = require('../models/CompanyModel');
const { getModelsForConnection } = require('../utilities/modelLoader');
const { runWithTenant } = require('../utilities/tenantContext');

// ── Company Cache (5 min TTL) ─────────────────────────────────────────────────
// Prevents a full Atlas round-trip on every unauthenticated public request.
const _publicCompanyCache = new Map();
const PUBLIC_CACHE_TTL = 5 * 60 * 1000;

function _getCachedPublicCompany(key) {
  const entry = _publicCompanyCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  _publicCompanyCache.delete(key);
  return null;
}

function _setCachedPublicCompany(key, data) {
  _publicCompanyCache.set(key, { data, expiresAt: Date.now() + PUBLIC_CACHE_TTL });
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Middleware to identify a tenant based on a companyCode or companyId in the body/query
 * Used for public routes like registration/onboarding where no JWT exists.
 *
 * Includes an in-memory 5-minute cache to avoid Atlas round-trips on every request.
 */
const verifyPublicTenant = async (req, res, next) => {
  try {
    const { companyCode, companyId } = req.body || req.query;

    if (!companyCode && !companyId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Tenant identification required (companyCode or companyId)' 
      });
    }

    // Load Company from master DB — check cache first
    const cacheKey = companyId ? `id:${companyId}` : `code:${(companyCode || '').trim().toUpperCase()}`;
    let company = _getCachedPublicCompany(cacheKey);

    if (!company) {
      const masterDb = getMasterConnection();
      if (masterDb.readyState !== 1) await waitForConnection(masterDb);
      const Company = masterDb.models.Company || masterDb.model('Company', CompanyModelExport.schema);

      if (companyId) {
        company = await Company.findById(companyId,
          { name: 1, companyCode: 1, dbName: 1, 'settings.receivingEmail': 1, 'settings.defaultPassword': 1, 'settings.careerPostings': 1, 'settings.communication': 1, 'settings.offerLetterSettings': 1 }
        );
      } else {
        const code = companyCode.trim();
        // Try exact match first (fast, index-friendly), fall back to case-insensitive regex
        company = await Company.findOne({ companyCode: code },
          { name: 1, companyCode: 1, dbName: 1, 'settings.receivingEmail': 1, 'settings.defaultPassword': 1, 'settings.careerPostings': 1, 'settings.communication': 1, 'settings.offerLetterSettings': 1 }
        );
        if (!company) {
          const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          company = await Company.findOne(
            { companyCode: { $regex: new RegExp(`^${escapedCode}$`, 'i') } },
            { name: 1, companyCode: 1, dbName: 1, 'settings.receivingEmail': 1, 'settings.defaultPassword': 1, 'settings.careerPostings': 1, 'settings.communication': 1, 'settings.offerLetterSettings': 1 }
          );
        }
      }

      if (company) _setCachedPublicCompany(cacheKey, company);
    }

    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found with the provided identifier' 
      });
    }

    // Use stored dbName (pre-computed at registration time, no dots)
    const dbName = company.dbName || `hrdb_${company.companyCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
    const tenantDb = getTenantConnection(dbName);
    if (tenantDb.readyState !== 1) await waitForConnection(tenantDb);

    // Attach models and tenant context to request
    req.models = getModelsForConnection(tenantDb);
    req.tenant = {
      companyId: company._id,
      companyCode: company.companyCode,
      dbName: dbName,
      receivingEmail: company.settings?.receivingEmail || process.env.RECIVER_EMAIL_USER,
      defaultPassword: company.settings?.defaultPassword || "",
      // ✅ Attach full company so routes don't need to re-fetch from Atlas
      companyData: company,
    };

    runWithTenant({ companyId: company._id, dbName }, () => {
      next();
    });
  } catch (err) {
    console.error("Public Tenant Verification Error:", err.message);
    res.status(500).json({ success: false, message: 'Server error during tenant verification' });
  }
};

module.exports = verifyPublicTenant;

/**
 * Called once at server startup to pre-warm the in-memory company cache.
 * Eliminates the ~26s first-request cold-fetch on Atlas M0 for all public endpoints.
 * @param {Array} companies - Array of lean company objects from master DB
 */
module.exports.warmPublicCompanyCache = (companies) => {
  if (!Array.isArray(companies)) return;
  companies.forEach(c => {
    if (c.companyCode) {
      const key = `code:${c.companyCode.trim().toUpperCase()}`;
      _setCachedPublicCompany(key, c);
    }
    if (c._id) {
      const key = `id:${c._id.toString()}`;
      _setCachedPublicCompany(key, c);
    }
  });
};

module.exports.clearPublicCompanyCache = (key) => {
  if (key) {
    _publicCompanyCache.delete(key);
    _publicCompanyCache.delete(`code:${key.toString().toUpperCase()}`);
    _publicCompanyCache.delete(`id:${key.toString()}`);
  } else {
    _publicCompanyCache.clear();
  }
};

