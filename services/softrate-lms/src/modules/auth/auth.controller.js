const authService = require('./auth.service');

const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const { status, data } = await authService.loginWithPeopleSoft({
      identifier,
      password,
    });

    return res.status(status).json(data);
  } catch (error) {
    next(error);
  }
};

const verifyMfa = async (req, res, next) => {
  try {
    const { tempToken, code } = req.body;

    if (!tempToken || !code) {
      return res.status(400).json({
        success: false,
        message: 'Temporary token and MFA code are required',
      });
    }

    const { status, data } = await authService.verifyMfaWithPeopleSoft({
      tempToken,
      code,
    });

    return res.status(status).json(data);
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const token = req.headers.authorization || '';
    const { status, data } = await authService.getMeWithPeopleSoft(token);
    return res.status(status).json(data);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  verifyMfa,
  getMe,
};
