import { useEffect } from 'react';
import { X, Printer, ShieldCheck, Award } from 'lucide-react';

export default function CertificateModal({ certificate, onClose }) {
  if (!certificate) return null;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="certificate-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cert-recipient">
      <button
        type="button"
        className="certificate-modal-backdrop"
        onClick={onClose}
        aria-label="Close certificate view"
      />
      <div className="certificate-modal-container">
        {/* Top Control Bar (Hidden on print) */}
        <div className="certificate-modal-topbar">
          <div className="certificate-modal-meta">
            <ShieldCheck size={18} className="verified-icon" />
            <span>Official Verified Certificate</span>
          </div>

          <div className="certificate-modal-actions">
            <button
              type="button"
              className="btn-print-certificate"
              onClick={handlePrint}
              title="Print or Save as PDF"
            >
              <Printer size={15} />
              <span>Print / Save PDF</span>
            </button>

            <button
              type="button"
              className="btn-close-certificate"
              onClick={onClose}
              aria-label="Close Certificate"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Certificate Printable Canvas */}
        <div className="certificate-frame">
          <div className="certificate-inner-border">
            {/* Corner Ornamental Accents */}
            <div className="corner-accent top-left" />
            <div className="corner-accent top-right" />
            <div className="corner-accent bottom-left" />
            <div className="corner-accent bottom-right" />

            {/* Certificate Header */}
            <div className="cert-header">
              <div className="cert-logo-row">
                <div className="cert-logo-badge">S</div>
                <div className="cert-org-text">
                  <h3>SOFTRATE</h3>
                  <span>ENGINEERING & DEVELOPMENT ACADEMY</span>
                </div>
              </div>
              <div className="cert-badge-seal">
                <Award size={32} />
              </div>
            </div>

            {/* Certificate Title */}
            <div className="cert-title-section">
              <span className="cert-super-title">CERTIFICATE OF COMPLETION</span>
              <p className="cert-intro">This is proudly presented to</p>
              <h1 className="cert-recipient-name">{certificate.recipientName}</h1>
              <div className="cert-underline" />
            </div>

            {/* Course Information */}
            <div className="cert-body">
              <p className="cert-statement">
                for successfully fulfilling all curriculum requirements, continuous assessments,
                and practical engineering standards for the professional course
              </p>
              <h2 className="cert-course-title">{certificate.courseTitle}</h2>
              <div className="cert-course-tags">
                <span className="cert-course-code">{certificate.courseCode}</span>
                <span className="cert-course-cat">{certificate.category}</span>
              </div>
            </div>

            {/* Signatures & Verification */}
            <div className="cert-footer">
              <div className="cert-footer-col">
                <div className="cert-sig-line">
                  <span className="sig-handwritten">Softrate Academy</span>
                </div>
                <span className="cert-signatory-name">Director of Learning</span>
                <span className="cert-signatory-title">Softrate Systems</span>
              </div>

              <div className="cert-footer-center">
                <div className="cert-stamp">
                  <ShieldCheck size={28} />
                  <span>VERIFIED</span>
                </div>
              </div>

              <div className="cert-footer-col right-col">
                <div className="cert-meta-item">
                  <span className="cert-meta-label">Date Issued:</span>
                  <span className="cert-meta-val">{certificate.issueDate}</span>
                </div>
                <div className="cert-meta-item">
                  <span className="cert-meta-label">Credential ID:</span>
                  <span className="cert-meta-val">{certificate.credentialId}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

