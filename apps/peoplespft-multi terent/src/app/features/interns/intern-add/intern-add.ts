import { AlertService } from '../../../shared/services/alert';
import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ApiService } from '../../../services/api.service';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-intern-add',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './intern-add.html',
  styleUrl: './intern-add.css'
})
export class InternAdd implements OnInit {
  private alertService = inject(AlertService);
  private apiService = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private location = inject(Location);

  goBack() {
    this.router.navigate(['/interns'], { queryParams: { tab: 'requests' } });
  }
  
  isSaving = signal(false);
  isUpdatingStatus = signal<string | null>(null);
  submitted = signal(false);
  isApprovalMode = signal(false);
  isEditMode = signal(false);
  requestId = '';
  
  intern = {
    _id: '',
    fullName: '',
    email: '',
    contact: '',
    college: '',
    department: '',
    role: '',
    onboardingDate: '',
    endDate: '',
    durationValue: 1,
    durationType: 'month' as 'day' | 'month',
    internshipType: 'Stipend',
    applicationType: 'Internship',
    isRemote: false,
    webAccess: false,
    remoteAccess: false
  };

  internRoles = signal<string[]>([]);

  applicantDetails = signal<any>({
    year: '',
    emergencyContact: '',
    linkedin: '',
    projectLinks: [],
    degree: '',
    dob: null,
    gender: '',
    location: '',
    maritalStatus: '',
    jobId: '',
    assessmentAnswers: {},
    createdAt: null,
    resume: '',
    currentCtc: '',
    expectedCtc: '',
    noticePeriod: '',
    previousOrg: '',
    experienceYears: '',
    isExperienced: false
  });

  getAssessmentEntries(): { label: string; value: string; isLinks: boolean; links: string[] }[] {
    const answers = this.applicantDetails().assessmentAnswers;
    if (!answers || typeof answers !== 'object') return [];
    
    return Object.entries(answers)
      .filter(([_, val]) => val !== undefined && val !== null && val !== '')
      .map(([key, value]) => {
        const label = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
          .trim();

        let rawItems: string[] = [];
        if (Array.isArray(value)) {
          rawItems = value.map(v => String(v).trim()).filter(Boolean);
        } else if (typeof value === 'string' && (value.includes('http://') || value.includes('https://') || value.includes('drive.google.com') || value.includes('github.com') || value.includes('www.'))) {
          rawItems = value.split(',').map(s => s.trim()).filter(Boolean);
        }

        const isLinks = rawItems.length > 0 && rawItems.every(item => 
          item.startsWith('http://') || item.startsWith('https://') || item.startsWith('www.') || item.includes('drive.google.com') || item.includes('github.com')
        );

        const displayValue = Array.isArray(value) ? value.join(', ') : (typeof value === 'object' ? JSON.stringify(value) : String(value));
        return { label, value: displayValue, isLinks, links: isLinks ? rawItems : [] };
      });
  }

  hasAdditionalInfo(): boolean {
    const d = this.applicantDetails();
    if (!d) return false;
    return Boolean(
      d.degree || d.year || d.location || d.gender || d.dob || d.maritalStatus ||
      d.emergencyContact || d.linkedin || (d.projectLinks && d.projectLinks.length > 0) ||
      d.jobId || (d.assessmentAnswers && Object.keys(d.assessmentAnswers).length > 0) ||
      (d.currentCtc !== undefined && d.currentCtc !== null && d.currentCtc !== '') ||
      (d.expectedCtc !== undefined && d.expectedCtc !== null && d.expectedCtc !== '') ||
      (d.noticePeriod !== undefined && d.noticePeriod !== null && d.noticePeriod !== '') ||
      d.previousOrg || d.experienceYears
    );
  }

  companySettings = signal<any>(null);
  showShortlistModal = signal(false);
  isSendingShortlist = signal(false);
  showRejectModal = signal(false);
  isSendingReject = signal(false);

  rejectForm = {
    reason: '',
    emailSubject: '',
    emailBody: ''
  };

  shortlistForm = {
    meetDate: '',
    meetTime: '11:00',
    meetLink: 'https://meet.google.com/',
    meetNotes: 'Please join 5 minutes prior with a working webcam and stable internet connection.',
    emailSubject: '',
    emailBody: ''
  };

  openShortlistModal() {
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.shortlistForm.meetDate = tomorrow.toISOString().split('T')[0];
    
    this.shortlistForm.emailSubject = `Application Shortlisted - Interview Scheduled for ${this.intern.role || 'Role'} | Softrate`;
    this.generateShortlistEmailBody();
    this.showShortlistModal.set(true);
  }

  closeShortlistModal() {
    this.showShortlistModal.set(false);
  }

  generateShortlistEmailBody() {
    const rawTemplate = this.companySettings()?.communication?.shortlistInterviewTemplate || `
<p>Dear {formattedName},</p>
<p>Congratulations! We are pleased to inform you that your application for the <b>{role}</b> position at Softrate has been shortlisted.</p>
<p>We would like to invite you for an online interview discussion scheduled as follows:</p>
<ul>
  <li><b>Date:</b> {meetDate}</li>
  <li><b>Time:</b> {meetTime}</li>
  <li><b>Meeting Link:</b> <a href="{meetLink}" target="_blank">{meetLink}</a></li>
  <li><b>Instructions:</b> {meetNotes}</li>
</ul>
<p>Please confirm your availability by replying to this email. Looking forward to speaking with you!</p>
<p>Best regards,<br><b>HR Team</b><br>Softrate Technologies</p>
    `.trim();

    this.shortlistForm.emailBody = rawTemplate
      .replace(/{formattedName}/g, this.intern.fullName || 'Candidate')
      .replace(/{role}/g, this.intern.role || 'Applicant')
      .replace(/{meetDate}/g, this.shortlistForm.meetDate || 'TBD')
      .replace(/{meetTime}/g, this.shortlistForm.meetTime || 'TBD')
      .replace(/{meetLink}/g, this.shortlistForm.meetLink || '')
      .replace(/{meetNotes}/g, this.shortlistForm.meetNotes || '')
      .replace(/{signature}/g, '')
      .replace(/{logo}/g, '');
  }

  submitShortlistWithMeeting() {
    if (!this.requestId) return;
    this.isSendingShortlist.set(true);

    const payload = {
      ...this.intern,
      emailSubject: this.shortlistForm.emailSubject,
      emailBody: this.shortlistForm.emailBody,
      meetDate: this.shortlistForm.meetDate,
      meetTime: this.shortlistForm.meetTime,
      meetLink: this.shortlistForm.meetLink,
      meetNotes: this.shortlistForm.meetNotes
    };

    this.apiService.shortlistIntern(this.requestId, payload).subscribe({
      next: (res: any) => {
        this.isSendingShortlist.set(false);
        this.showShortlistModal.set(false);
        this.alertService.show(res?.message || 'Candidate shortlisted and meeting invite email sent successfully!');
        this.router.navigate(['/interns'], { queryParams: { tab: 'requests' } });
      },
      error: (err: any) => {
        this.isSendingShortlist.set(false);
        console.error('Shortlist error:', err);
        this.alertService.show('Failed to shortlist: ' + (err.error?.message || err.message));
      }
    });
  }

  openRejectModal() {
    const roleName = this.intern.role || (this.intern as any).domain || 'Internship / Job';
    this.rejectForm.emailSubject = `Update regarding your application for ${roleName} at Softrate`;
    this.rejectForm.reason = '';
    this.generateRejectEmailBody();
    this.showRejectModal.set(true);
  }

  closeRejectModal() {
    this.showRejectModal.set(false);
  }

  generateRejectEmailBody() {
    const rawTemplate = this.companySettings()?.communication?.applicationRejectionTemplate || `
<p>Dear {formattedName},</p>
<p>Thank you for taking the time to apply for the <b>{role}</b> position with us and for your interest in our company.</p>
<p>After careful consideration and review of your application, we regret to inform you that we will not be moving forward with your candidacy for this role at this time.</p>
{reason}
<p>We truly appreciate the effort you put into your application and wish you the very best in your job search and future professional endeavors.</p>
<p>Best regards,<br><b>HR Team</b><br>Softrate Technologies</p>
    `.trim();

    const roleName = this.intern.role || (this.intern as any).domain || 'Applicant';
    const reasonText = this.rejectForm.reason ? `<p>${this.rejectForm.reason}</p>` : '';

    this.rejectForm.emailBody = rawTemplate
      .replace(/{formattedName}/g, this.intern.fullName || 'Candidate')
      .replace(/{role}/g, roleName)
      .replace(/{reason}/g, reasonText)
      .replace(/{signature}/g, '')
      .replace(/{logo}/g, '');
  }

  submitReject() {
    if (!this.requestId) return;
    this.isSendingReject.set(true);

    const payload = {
      reason: this.rejectForm.reason,
      emailSubject: this.rejectForm.emailSubject,
      emailBody: this.rejectForm.emailBody
    };

    this.apiService.rejectIntern(this.requestId, payload).subscribe({
      next: (res: any) => {
        this.isSendingReject.set(false);
        this.showRejectModal.set(false);
        this.alertService.show(res?.message || 'Application rejected and notification email sent.');
        this.router.navigate(['/interns'], { queryParams: { tab: 'requests' } });
      },
      error: (err: any) => {
        this.isSendingReject.set(false);
        console.error('Reject error:', err);
        this.alertService.show('Failed to reject: ' + (err.error?.message || err.message));
      }
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    const isEdit = this.route.snapshot.queryParamMap.get('edit') === 'true';

    if (id) {
      if (isEdit) {
        this.isEditMode.set(true);
      } else {
        this.isApprovalMode.set(true);
      }
      this.requestId = id;
      this.fetchRequestData(id);
    }
    this.fetchSettings();
  }

  fetchSettings() {
    this.apiService.getCompanySettings().subscribe({
      next: (res: any) => {
        if (res.success && res.settings) {
          this.companySettings.set(res.settings);
          const fetchedRoles = res.settings.internRoles || [];
          const currentRoles = this.internRoles();
          const mergedRoles = Array.from(new Set([...fetchedRoles, ...currentRoles]));
          this.internRoles.set(mergedRoles);
        }
      },
      error: (err) => console.error('Failed to fetch settings', err)
    });
  }

  fetchRequestData(id: string) {
    this.apiService.getInternById(id).subscribe({
      next: (data) => {
        console.log('Fetched applicant data:', data);
        this.intern.fullName = data.fullName || '';
        this.intern.email = data.email || '';
        this.intern.contact = data.contact || '';
        this.intern.college = data.college || '';
        this.intern.department = data.department || '';
        this.intern.role = data.role || '';
        this.intern.isRemote = data.isRemote || false;
        this.intern.webAccess = data.webAccess || false;
        this.intern.remoteAccess = data.remoteAccess || false;
        
        if (this.intern.role) {
          const currentRoles = this.internRoles();
          if (!currentRoles.includes(this.intern.role)) {
            this.internRoles.set([...currentRoles, this.intern.role]);
          }
        }

        this.intern.applicationType = data.applicationType || 'Internship';
        this.intern._id = data._id;

        let safeDob = null;
        if (data.dob) {
          const d = new Date(data.dob);
          if (!isNaN(d.getTime())) {
            safeDob = d.toISOString().split('T')[0];
          }
        }

        this.applicantDetails.set({
          year: data.year || '',
          emergencyContact: data.emergencyContact || '',
          linkedin: data.linkedin || '',
          projectLinks: data.projectLinks || [],
          degree: data.degree || '',
          dob: safeDob,
          gender: data.gender || '',
          location: data.location || '',
          maritalStatus: data.maritalStatus || '',
          jobId: data.jobId || '',
          assessmentAnswers: data.assessmentAnswers || {},
          createdAt: data.createdAt || null,
          resume: data.resume || '',
          currentCtc: (data.currentCtc !== undefined && data.currentCtc !== null && data.currentCtc !== '') ? data.currentCtc : '',
          expectedCtc: (data.expectedCtc !== undefined && data.expectedCtc !== null && data.expectedCtc !== '') ? data.expectedCtc : '',
          noticePeriod: (data.noticePeriod !== undefined && data.noticePeriod !== null && data.noticePeriod !== '') ? data.noticePeriod : '',
          previousOrg: data.previousOrg || data.currentCompany || '',
          experienceYears: data.experienceYears || data.yearsOfExperience || '',
          isExperienced: data.isExperienced || false
        });

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to fetch request data', err);
        this.alertService.show('Failed to load application data');
      }
    });
  }

  calculateEndDate() {
    if (!this.intern.onboardingDate || !this.intern.durationValue) return;

    const start = new Date(this.intern.onboardingDate);
    const end = new Date(start);

    if (this.intern.durationType === 'day') {
      end.setDate(start.getDate() + this.intern.durationValue);
    } else {
      end.setMonth(start.getMonth() + this.intern.durationValue);
    }
    const year = end.getFullYear();
    const month = String(end.getMonth() + 1).padStart(2, '0');
    const day = String(end.getDate()).padStart(2, '0');
    this.intern.endDate = `${year}-${month}-${day}`;
  }

  saveIntern() {
    this.submitted.set(true);
    
    if (!this.intern.fullName || !this.intern.email || !this.intern.onboardingDate || !this.intern.department || !this.intern.role) {
      this.alertService.show('Please fill all required fields including Department, Role, and Onboarding Date');
      return;
    }

    this.isSaving.set(true);
    
    if (this.isEditMode()) {
      this.apiService.updateIntern(this.requestId, this.intern).subscribe({
        next: () => {
          this.alertService.show('Intern profile updated successfully!');
          this.router.navigate(['/interns', this.requestId]);
        },
        error: (err: any) => {
          console.error('Failed to update intern', err);
          this.alertService.show('Failed to update: ' + (err.error?.message || err.message));
          this.isSaving.set(false);
        }
      });
    } else if (this.isApprovalMode()) {
      this.apiService.acceptIntern(this.requestId, this.intern).subscribe({
        next: () => {
          this.alertService.show('Intern approved and onboarding started!');
          this.router.navigate(['/interns'], { queryParams: { tab: 'requests' } });
        },
        error: (err) => {
          console.error('Failed to approve intern', err);
          this.alertService.show('Failed to approve intern: ' + (err.error?.message || err.message));
          this.isSaving.set(false);
        }
      });
    } else {
      this.apiService.addIntern(this.intern).subscribe({
        next: () => {
          this.alertService.show('Intern added successfully');
          this.router.navigate(['/interns'], { queryParams: { tab: 'requests' } });
        }
      });
    }
  }

  updateStatus(newStatus: 'shortlist' | 'maybe') {
    if (!this.requestId) return;
    this.isUpdatingStatus.set(newStatus);
    
    const payload = {
      ...this.intern,
      status: newStatus,
      managerApprovalStatus: newStatus
    };

    this.apiService.updateIntern(this.requestId, payload).subscribe({
      next: () => {
        this.isUpdatingStatus.set(null);
        const label = newStatus === 'shortlist' ? 'Shortlisted' : 'Marked as Maybe';
        this.alertService.show(`Application ${label} successfully!`);
        this.router.navigate(['/interns'], { queryParams: { tab: 'requests' } });
      },
      error: (err: any) => {
        this.isUpdatingStatus.set(null);
        console.error(`Failed to update status to ${newStatus}`, err);
        this.alertService.show(`Failed to update status: ` + (err.error?.message || err.message));
      }
    });
  }
}
