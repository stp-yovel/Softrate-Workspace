const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_key";

function generateRawToken() {
  return crypto.randomBytes(16).toString("hex");
}

function createRescheduleToken(shortlistId, companyId, rawToken) {
  return jwt.sign(
    {
      shortlistId: shortlistId.toString(),
      companyId: companyId.toString(),
      token: rawToken
    },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function verifyRescheduleToken(tokenString) {
  try {
    return jwt.verify(tokenString, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function getFrontendBaseUrl() {
  return process.env.FRONTEND_URL || "https://peoplesoft.softrateglobal.com";
}

function buildRescheduleUrl(signedToken) {
  const base = getFrontendBaseUrl().replace(/\/+$/, "");
  return `${base}/hrms/reschedule?token=${encodeURIComponent(signedToken)}`;
}

function buildRescheduleButtonHtml(rescheduleUrl) {
  return `
    <div style="margin: 24px 0 16px 0; text-align: left;">
      <a href="${rescheduleUrl}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 11px 22px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px; box-shadow: 0 1px 3px rgba(79, 70, 229, 0.3);">
        Request to Reschedule
      </a>
      <p style="font-size: 12px; color: #64748b; margin-top: 8px; line-height: 1.4;">
        If you are unable to attend at the scheduled time, click the button above to request an alternative date & time.
      </p>
    </div>
  `;
}

function buildRescheduleAcceptedEmailHtml({
  fullName,
  role,
  newDate,
  newTime,
  meetLink,
  meetNotes,
  signatureHtml
}) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Interview Rescheduled & Confirmed</h2>
      <p>Dear ${fullName},</p>
      <p>Your request to reschedule the interview for the <b>${role || 'Candidate'}</b> position has been accepted and confirmed by the HR team.</p>
      
      <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 14px 16px; margin: 18px 0; border-radius: 4px;">
        <p style="margin: 0 0 6px 0; font-weight: 600; color: #065f46;">Updated Interview Details:</p>
        <ul style="margin: 0; padding-left: 20px; color: #334155;">
          <li><b>Date & Time:</b> ${newDate} at ${newTime}</li>
          <li><b>Meeting Link:</b> <a href="${meetLink || '#'}" target="_blank" style="color: #4f46e5; word-break: break-all;">${meetLink || 'Link will be provided before the session'}</a></li>
          ${meetNotes ? `<li><b>Notes / Instructions:</b> ${meetNotes}</li>` : ''}
        </ul>
      </div>

      <p style="font-size: 13px; color: #475569;">
        Please make sure to join promptly at the updated time. If you have any further questions, feel free to reply directly to this email.
      </p>
      <p style="margin-bottom: 4px;">Best regards,</p>
      ${signatureHtml || ''}
    </div>
  `;
}

function buildRescheduleDeclinedEmailHtml({
  fullName,
  role,
  currentDate,
  currentTime,
  meetLink,
  adminNotes,
  signatureHtml
}) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Interview Schedule Update</h2>
      <p>Dear ${fullName},</p>
      <p>We received your request to reschedule your interview for the <b>${role || 'Candidate'}</b> position.</p>
      <p>Due to interview panel availability constraints, we are unable to accommodate the requested alternative time. Your original interview schedule remains in place:</p>
      
      <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 14px 16px; margin: 18px 0; border-radius: 4px;">
        <p style="margin: 0 0 6px 0; font-weight: 600; color: #3730a3;">Confirmed Interview Schedule:</p>
        <ul style="margin: 0; padding-left: 20px; color: #334155;">
          <li><b>Date & Time:</b> ${currentDate} at ${currentTime}</li>
          <li><b>Meeting Link:</b> <a href="${meetLink || '#'}" target="_blank" style="color: #4f46e5; word-break: break-all;">${meetLink || 'Link will be provided'}</a></li>
          ${adminNotes ? `<li><b>Note from HR:</b> ${adminNotes}</li>` : ''}
        </ul>
      </div>

      <p style="font-size: 13px; color: #475569;">
        We appreciate your understanding and look forward to speaking with you at the scheduled time.
      </p>
      <p style="margin-bottom: 4px;">Best regards,</p>
      ${signatureHtml || ''}
    </div>
  `;
}

module.exports = {
  generateRawToken,
  createRescheduleToken,
  verifyRescheduleToken,
  buildRescheduleUrl,
  buildRescheduleButtonHtml,
  buildRescheduleAcceptedEmailHtml,
  buildRescheduleDeclinedEmailHtml
};

