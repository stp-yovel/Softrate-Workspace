/**
 * Generates an enterprise-grade HTML email containing the full applicant profile
 * including personal details, academic background, experience profile, assessment answers,
 * and project links.
 */
function formatApplicationEmailHtml(data) {
  const {
    applicationType = 'Employee',
    fullName = 'N/A',
    email = 'N/A',
    phone = 'N/A',
    dob = '',
    gender = '',
    maritalStatus = '',
    location = '',
    degree = '',
    qualification = '',
    college = '',
    department = '',
    year = '',
    passingYear = '',
    cgpaOrPercentage = '',
    isExperienced = false,
    experienceYears = '',
    previousOrg = '',
    designation = '',
    role = '',
    currentCtc = 0,
    expectedCtc = 0,
    noticePeriod = 0,
    joiningDate = '',
    jobId = '',
    linkedin = '',
    projectLinks = [],
    assessmentAnswers = {}
  } = data;

  const isExp = isExperienced === true || isExperienced === 'true' || isExperienced === 1;
  const isEmployeeApp = Boolean(
    applicationType && (
      applicationType.toLowerCase().includes('employee') ||
      applicationType.toLowerCase().includes('job') ||
      applicationType.toLowerCase().includes('full')
    )
  );

  // Format Assessment Answers nicely
  let assessmentHtml = '';
  if (assessmentAnswers && Object.keys(assessmentAnswers).length > 0) {
    const rows = [];
    for (const [key, value] of Object.entries(assessmentAnswers)) {
      if (value === undefined || value === null || value === '') continue;
      
      // Convert camelCase key to readable Label
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();

      let displayVal = '';
      if (Array.isArray(value)) {
        displayVal = value.join(', ');
      } else if (typeof value === 'object') {
        displayVal = JSON.stringify(value);
      } else {
        displayVal = String(value);
      }

      rows.push(`
        <tr>
          <td style="padding: 8px 12px; font-weight: 600; color: #475569; width: 40%; border-bottom: 1px solid #f1f5f9;">${label}</td>
          <td style="padding: 8px 12px; color: #1e293b; border-bottom: 1px solid #f1f5f9;">${displayVal}</td>
        </tr>
      `);
    }

    if (rows.length > 0) {
      assessmentHtml = `
        <div style="margin-top: 24px;">
          <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
            📝 Role Assessment Answers
          </h4>
          <table style="width: 100%; border-collapse: collapse; background: #fafafa; border-radius: 6px; overflow: hidden; font-size: 14px;">
            <tbody>
              ${rows.join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  // Format Project Links
  let projectLinksHtml = '';
  if (projectLinks && projectLinks.length > 0) {
    const validLinks = projectLinks.filter(l => l && l.trim());
    if (validLinks.length > 0) {
      projectLinksHtml = `
        <div style="margin-top: 24px;">
          <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
            🔗 Live Project / Portfolio Links
          </h4>
          <ul style="margin: 8px 0; padding-left: 20px; font-size: 14px; color: #2563eb;">
            ${validLinks.map((l, idx) => `<li><a href="${l.startsWith('http') ? l : 'https://' + l}" target="_blank" style="color: #2563eb; text-decoration: underline;">Project ${idx + 1}: ${l}</a></li>`).join('')}
          </ul>
        </div>
      `;
    }
  }

  // Professional Experience Section (For Experienced Employee)
  let professionalExpHtml = '';
  if (isEmployeeApp && isExp) {
    professionalExpHtml = `
      <div style="margin-top: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
          💼 Professional Experience
        </h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tbody>
            <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569; width: 35%;">Experience Status:</td><td style="padding: 6px 12px; color: #1e293b;"><span style="background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">Experienced Professional</span></td></tr>
            <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Total Experience:</td><td style="padding: 6px 12px; color: #1e293b; font-weight: 600;">${experienceYears || 'N/A'}</td></tr>
            <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Current / Previous Org:</td><td style="padding: 6px 12px; color: #1e293b; font-weight: 600;">${previousOrg || 'N/A'}</td></tr>
            <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Current Designation:</td><td style="padding: 6px 12px; color: #1e293b;">${designation || role || 'N/A'}</td></tr>
            <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Current Annual CTC:</td><td style="padding: 6px 12px; color: #1e293b;">${currentCtc ? '₹ ' + currentCtc + ' LPA' : 'N/A'}</td></tr>
            <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Expected Annual CTC:</td><td style="padding: 6px 12px; color: #1e293b;">${expectedCtc ? '₹ ' + expectedCtc + ' LPA' : 'N/A'}</td></tr>
            <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Notice Period:</td><td style="padding: 6px 12px; color: #1e293b;">${noticePeriod !== undefined && noticePeriod !== null && noticePeriod !== '' ? (Number(noticePeriod) === 0 ? 'Immediate' : noticePeriod + ' Days') : 'Immediate'}</td></tr>
            ${joiningDate ? `<tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Available Joining Date:</td><td style="padding: 6px 12px; color: #1e293b;">${joiningDate}</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    `;
  }

  // Fresher Profile Section (For Fresher Employee)
  let fresherProfileHtml = '';
  if (isEmployeeApp && !isExp) {
    fresherProfileHtml = `
      <div style="margin-top: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
          💼 Candidate Type
        </h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tbody>
            <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569; width: 35%;">Experience Status:</td><td style="padding: 6px 12px; color: #1e293b;"><span style="background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">Fresher (Recent Graduate)</span></td></tr>
            ${passingYear || year ? `<tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Graduation Year:</td><td style="padding: 6px 12px; color: #1e293b;">${passingYear || year}</td></tr>` : ''}
            ${cgpaOrPercentage ? `<tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Score / CGPA:</td><td style="padding: 6px 12px; color: #1e293b;">${cgpaOrPercentage}</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    `;
  }

  // Academic / Education Section
  let educationHtml = '';
  if (isExp) {
    // For Experienced candidates, clean concise education
    educationHtml = `
      <div style="margin-top: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
          🎓 Education & Qualifications
        </h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tbody>
            <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569; width: 35%;">Highest Degree:</td><td style="padding: 6px 12px; color: #1e293b;">${qualification || degree || 'N/A'}</td></tr>
            <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">College / University:</td><td style="padding: 6px 12px; color: #1e293b;">${college || 'N/A'}</td></tr>
            ${department ? `<tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Department:</td><td style="padding: 6px 12px; color: #1e293b;">${department}</td></tr>` : ''}
            ${passingYear || year ? `<tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Passing Year:</td><td style="padding: 6px 12px; color: #1e293b;">${passingYear || year}</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    `;
  } else {
    // For Freshers & Interns
    educationHtml = `
      <div style="margin-top: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
          🎓 Academic Background
        </h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tbody>
            <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569; width: 35%;">Degree / Qualification:</td><td style="padding: 6px 12px; color: #1e293b;">${qualification || degree || 'N/A'}</td></tr>
            <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">College / University:</td><td style="padding: 6px 12px; color: #1e293b;">${college || 'N/A'}</td></tr>
            ${department ? `<tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Department / Major:</td><td style="padding: 6px 12px; color: #1e293b;">${department}</td></tr>` : ''}
            ${passingYear || year ? `<tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Year / Batch:</td><td style="padding: 6px 12px; color: #1e293b;">${passingYear || year}</td></tr>` : ''}
            ${cgpaOrPercentage ? `<tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Score / CGPA:</td><td style="padding: 6px 12px; color: #1e293b;">${cgpaOrPercentage}</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    `;
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 24px; color: #ffffff;">
        <span style="background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
          ${applicationType} Application
        </span>
        <h2 style="margin: 12px 0 4px 0; font-size: 22px; color: #ffffff;">${fullName}</h2>
        <p style="margin: 0; font-size: 14px; opacity: 0.9;">Applied for <b>${role || designation}</b> ${jobId ? `(Job ID: ${jobId})` : ''}</p>
      </div>

      <div style="padding: 24px;">

        <!-- 1. Personal & Contact Information -->
        <div>
          <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
            👤 Personal & Contact Details
          </h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tbody>
              <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569; width: 35%;">Email:</td><td style="padding: 6px 12px; color: #1e293b;"><a href="mailto:${email}" style="color: #2563eb;">${email}</a></td></tr>
              <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Phone Number:</td><td style="padding: 6px 12px; color: #1e293b;">${phone}</td></tr>
              <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Date of Birth:</td><td style="padding: 6px 12px; color: #1e293b;">${dob || 'N/A'}</td></tr>
              <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Gender:</td><td style="padding: 6px 12px; color: #1e293b;">${gender || 'N/A'}</td></tr>
              <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Marital Status:</td><td style="padding: 6px 12px; color: #1e293b;">${maritalStatus || 'N/A'}</td></tr>
              <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">Current Location:</td><td style="padding: 6px 12px; color: #1e293b;">${location || 'N/A'}</td></tr>
              <tr><td style="padding: 6px 12px; font-weight: 600; color: #475569;">LinkedIn Profile:</td><td style="padding: 6px 12px; color: #1e293b;">${linkedin ? `<a href="${linkedin.startsWith('http') ? linkedin : 'https://' + linkedin}" target="_blank" style="color: #2563eb;">${linkedin}</a>` : 'N/A'}</td></tr>
            </tbody>
          </table>
        </div>

        <!-- 2. For Experienced Candidate: Professional Experience First -->
        ${professionalExpHtml}

        <!-- 3. Academic Background / Education -->
        ${educationHtml}

        <!-- 4. For Fresher: Fresher Status -->
        ${fresherProfileHtml}

        <!-- 5. Role-Specific Assessment -->
        ${assessmentHtml}

        <!-- 6. Live Project Links -->
        ${projectLinksHtml}

        <!-- 7. Resume Note -->
        <div style="margin-top: 24px; padding: 12px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 13px; color: #166534;">
          📄 <b>Resume Attached:</b> The candidate's resume PDF is attached to this email for full review.
        </div>

      </div>

      <!-- Footer -->
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 12px; color: #64748b;">
        This is an automated candidate application email notification from PeopleSoft HRMS.
      </div>
    </div>
  `;
}

module.exports = { formatApplicationEmailHtml };
