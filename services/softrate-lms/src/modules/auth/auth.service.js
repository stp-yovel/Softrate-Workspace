const config = require('../../config');

const authService = {
  /**
   * Proxies login request to PeopleSoft Unified Login API
   */
  async loginWithPeopleSoft({ identifier, password, companyCode }) {
    const targetCompany = companyCode || config.defaultCompanyCode;
    const url = `${config.peopleSoftApiUrl}/api/auth/unified-login`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyCode: targetCompany,
          identifier: identifier?.trim(),
          password,
          source: 'web',
        }),
      });

      const data = await response.json().catch(() => ({
        success: false,
        message: 'Invalid response from PeopleSoft auth server',
      }));

      return {
        status: response.status,
        data,
      };
    } catch (error) {
      console.error('[authService] Error reaching PeopleSoft API:', error.message);
      return {
        status: 503,
        data: {
          success: false,
          message: 'PeopleSoft service is currently unavailable. Please verify HRMS service is running.',
        },
      };
    }
  },

  /**
   * Proxies MFA verification request to PeopleSoft MFA API
   */
  async verifyMfaWithPeopleSoft({ tempToken, code }) {
    const url = `${config.peopleSoftApiUrl}/api/auth/mfa/verify-login`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tempToken,
          code,
        }),
      });

      const data = await response.json().catch(() => ({
        success: false,
        message: 'Invalid response from PeopleSoft auth server',
      }));

      return {
        status: response.status,
        data,
      };
    } catch (error) {
      console.error('[authService] Error reaching PeopleSoft MFA API:', error.message);
      return {
        status: 503,
        data: {
          success: false,
          message: 'PeopleSoft MFA service is currently unavailable.',
        },
      };
    }
  },

  /**
   * Fetches the current logged in user profile with photo from PeopleSoft
   */
  async getMeWithPeopleSoft(token) {
    const url = `${config.peopleSoftApiUrl}/api/auth/me`;
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, { headers });
      const data = await response.json().catch(() => ({
        success: false,
        message: 'Invalid response from PeopleSoft auth server',
      }));

      return {
        status: response.status,
        data,
      };
    } catch (error) {
      console.error('[authService] Error reaching PeopleSoft /me API:', error.message);
      return {
        status: 503,
        data: {
          success: false,
          message: 'PeopleSoft service is currently unavailable.',
        },
      };
    }
  },
};

module.exports = authService;
