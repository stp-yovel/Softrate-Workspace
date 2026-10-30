import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, KeyRound, Eye, EyeOff } from 'lucide-react';

function BrandEmblem({ size = 32, className = '' }) {
  return (
    <img
      src="/images/iSkill-icon.png"
      alt="iSkill"
      width={size}
      height={size}
      className={`brand-emblem-img ${className}`}
      style={{ objectFit: 'contain', borderRadius: 'var(--radius-sm)', display: 'block' }}
    />
  );
}

export default function LoginPage() {
  const { login, completeMfa, isLoading, error, setError } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // MFA State
  const [mfaStep, setMfaStep] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  const handleStandardSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;

    try {
      const res = await login(identifier.trim(), password);
      if (res?.requiresMfa || res?.mfaRequired) {
        setTempToken(res.tempToken);
        setMfaStep(true);
      }
    } catch {
      // Error handled in AuthContext
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    if (!mfaCode.trim() || !tempToken) return;

    try {
      await completeMfa(tempToken, mfaCode.trim());
    } catch {
      // Error handled in AuthContext
    }
  };

  const resetToStandard = () => {
    setMfaStep(false);
    setTempToken('');
    setMfaCode('');
    setError(null);
  };

  return (
    <div className="login-screen-wrapper">
      {/* Left Rounded Visual Card with Architectural Corner Notch */}
      <div className="login-visual-card">
        {/* Curving White Corner Notch */}
        <div className="login-notch-container" aria-hidden="true">
          <svg
            className="login-notch-svg"
            viewBox="0 0 190 106"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M 0 0 L 180 0 C 166 0 155 13 150 24 L 132 64 C 128 71 118 76 108 76 L 20 76 C 9 76 0 87 0 98 Z"
              fill="var(--color-surface)"
            />
          </svg>
        </div>

        {/* Brand Logo inside the White Notch */}
        <div className="visual-top-brand">
          <img
            src="/logo/iSkill-logo.png"
            alt="iSkill"
            className="visual-brand-logo"
          />
        </div>

        <div className="visual-bottom-content">
          <h1>Learn, connect & grow with iSkill.</h1>
          <p>Your all-in-one platform for courses, community and continuous learning.</p>
        </div>
      </div>

      {/* Right Form Area */}
      <div className="login-form-area">
        <div className="login-card-box">
          <div className="card-top-emblem">
            <BrandEmblem size={34} color="var(--color-brand)" />
          </div>

          <div className="form-header">
            <h2>{mfaStep ? 'Two-Factor Authentication' : 'Connect Your Account'}</h2>
            <p>
              {mfaStep
                ? 'Please enter the 6-digit code from your Authenticator app.'
                : 'Welcome back! Please enter your details.'}
            </p>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
            </div>
          )}

          {!mfaStep ? (
            <form onSubmit={handleStandardSubmit} className="login-form">
              {/* Email Field */}
              <div className="form-group">
                <label htmlFor="identifier">Email</label>
                <div className="input-wrapper">
                  <Mail size={17} className="input-icon" />
                  <input
                    id="identifier"
                    type="email"
                    required
                    autoFocus
                    placeholder="Enter email"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="input-wrapper">
                  <Lock size={17} className="input-icon" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={isLoading || !identifier.trim() || !password}
              >
                {isLoading ? (
                  <div className="spinner-loader" />
                ) : (
                  <span>Sign In</span>
                )}
              </button>

              <div className="form-footer">
                <p>
                  Connected to <strong>SoftrateWorkspace</strong> Central Authentication
                </p>
              </div>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="mfaCode">Authenticator Code</label>
                <div className="input-wrapper">
                  <KeyRound size={17} className="input-icon" />
                  <input
                    id="mfaCode"
                    type="text"
                    required
                    autoFocus
                    maxLength={6}
                    placeholder="000000"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    className="otp-input"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={isLoading || mfaCode.length < 6}
              >
                {isLoading ? (
                  <div className="spinner-loader" />
                ) : (
                  <span>Verify & Proceed</span>
                )}
              </button>

              <button
                type="button"
                className="back-btn"
                onClick={resetToStandard}
                disabled={isLoading}
              >
                Back to Sign In
              </button>
            </form>
          )}
        </div>

        <div className="login-copyright">
          <span>&copy; iSkill 2026</span>
        </div>
      </div>
    </div>
  );
}
