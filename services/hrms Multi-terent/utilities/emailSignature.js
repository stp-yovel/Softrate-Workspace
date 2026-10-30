const HARDCODED_SIGNATURE_URL = "https://www.softrateglobal.com/assets/img/logo/softrate-transparent-logo.png";

const getSignature = (customUrl = '') => {
  // If customUrl is a valid http/https URL and not a base64 data URI, use it; otherwise fallback to the hardcoded URL
  const url = (customUrl && typeof customUrl === 'string' && !customUrl.startsWith('data:') && customUrl.startsWith('http'))
    ? customUrl
    : HARDCODED_SIGNATURE_URL;

  return `<div style="margin-top: 20px;"><img src="${url}" alt="Softrate Logo" width="150" style="width: 150px; max-width: 100%; height: auto; max-height: 30px; display: block; border: 0;" /></div>`;
};

module.exports = { getSignature, HARDCODED_SIGNATURE_URL };