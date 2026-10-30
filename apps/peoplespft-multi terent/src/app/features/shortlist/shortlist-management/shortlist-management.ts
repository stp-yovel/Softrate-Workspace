import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ApiService } from '../../../services/api.service';
import { AlertService } from '../../../shared/services/alert';
import { HttpCacheService } from '../../../services/cache.service';
import { EmployeeSidebar } from '../../employees/employee-sidebar/employee-sidebar';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  Calendar01Icon,
  Video01Icon,
  Copy01Icon,
  CheckmarkCircle02Icon,
  CancelCircleIcon,
  Comment01Icon,
  Clock01Icon,
  Search01Icon,
  FilterIcon,
  ArrowRight01Icon,
  UserCheck01Icon,
  UserIcon,
  Briefcase01Icon,
  Link01Icon,
  RefreshIcon,
  Note01Icon,
  Target01Icon,
  Building02Icon,
  HelpCircleIcon,
  Flag01Icon,
  Task01Icon,
  Idea01Icon,
  Location01Icon
} from '@hugeicons/core-free-icons';

export interface IRemark {
  _id?: string;
  text: string;
  addedBy?: string;
  addedByName?: string;
  role?: string;
  createdAt: string | Date;
}

export interface IInterviewEvaluation {
  longTermGoal?: string;
  expectationsFromCompany?: string;
  reasonNotSelectedPreviously?: string;
  redFlags?: string;
  greenFlags?: string;
  bond?: 'Agree' | 'Disagree' | '';
  startupIdeasNext2Years?: 'Yes' | 'No' | 'Not at all' | '';
  locationAndRelocation?: string;
  evaluatedBy?: string;
  evaluatedByName?: string;
  evaluatedAt?: string | Date;
}

export interface IShortlistCandidate {
  _id: string;
  companyId: string;
  candidateId: string;
  candidateType: 'Employee' | 'Intern' | 'Walkin';
  fullName: string;
  email: string;
  phone: string;
  role: string;
  department?: string;
  qualification?: string;
  college?: string;
  location?: string;
  experienceYears?: string;
  isExperienced?: boolean;
  currentCtc?: number;
  expectedCtc?: number;
  noticePeriod?: number;
  linkedin?: string;
  projectLinks?: string[];
  resumeUrl?: string;
  meetDate: string | Date;
  meetTime: string;
  meetLink: string;
  meetNotes: string;
  emailSubject?: string;
  emailBody?: string;
  remarks: IRemark[];
  interviewEvaluation?: IInterviewEvaluation;
  status: 'scheduled' | 'interviewed' | 'onboarded' | 'rejected' | 'cancelled';
  rescheduleToken?: string;
  rescheduleCount?: number;
  rescheduleRequest?: {
    status: 'none' | 'pending' | 'accepted' | 'declined';
    requestedDate?: string | Date;
    requestedTime?: string;
    reason?: string;
    requestedAt?: string | Date;
    respondedBy?: string;
    respondedAt?: string | Date;
    adminNotes?: string;
  };
  scheduledBy?: {
    userId: string;
    name: string;
  };
  scheduledAt?: string | Date;
  interviewedAt?: string | Date;
  onboardedAt?: string | Date;
  rejectedAt?: string | Date;
  rejectionReason?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

@Component({
  selector: 'app-shortlist-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    HugeiconsIconComponent,
    EmployeeSidebar
  ],
  templateUrl: './shortlist-management.html',
  styleUrls: ['./shortlist-management.css']
})
export class ShortlistManagementComponent implements OnInit {
  private apiService = inject(ApiService);
  private alertService = inject(AlertService);
  private router = inject(Router);
  private cacheService = inject(HttpCacheService);

  // Icons
  CalendarIcon = Calendar01Icon;
  VideoIcon = Video01Icon;
  CopyIcon = Copy01Icon;
  CheckIcon = CheckmarkCircle02Icon;
  CancelIcon = CancelCircleIcon;
  CommentIcon = Comment01Icon;
  ClockIcon = Clock01Icon;
  SearchIcon = Search01Icon;
  FilterIcon = FilterIcon;
  ArrowRightIcon = ArrowRight01Icon;
  UserCheckIcon = UserCheck01Icon;
  UserIcon = UserIcon;
  BriefcaseIcon = Briefcase01Icon;
  LinkIcon = Link01Icon;
  RefreshIcon = RefreshIcon;
  NoteIcon = Note01Icon;
  TargetIcon = Target01Icon;
  BuildingIcon = Building02Icon;
  HelpCircleIcon = HelpCircleIcon;
  FlagIcon = Flag01Icon;
  TaskIcon = Task01Icon;
  IdeaIcon = Idea01Icon;
  LocationIcon = Location01Icon;

  // Signals for state
  candidates = signal<IShortlistCandidate[]>([]);
  isLoading = signal(false);
  activeTab = signal<'active' | 'interviewed' | 'onboarded' | 'rejected' | 'reschedule' | 'all'>('active');
  selectedType = signal<'all' | 'Employee' | 'Intern'>('all');
  searchQuery = signal('');

  metrics = signal({
    todayCount: 0,
    upcomingCount: 0,
    interviewedCount: 0,
    onboardedMonthCount: 0,
    totalActiveCount: 0,
    reschedulePendingCount: 0
  });

  // Remarks Drawer state
  showRemarksDrawer = signal(false);
  selectedCandidate = signal<IShortlistCandidate | null>(null);
  activeDrawerTab = signal<'assessment' | 'timeline'>('assessment');
  newRemarkText = signal('');
  isAddingRemark = signal(false);
  isSavingEvaluation = signal(false);

  evaluationForm: IInterviewEvaluation = {
    longTermGoal: '',
    expectationsFromCompany: '',
    reasonNotSelectedPreviously: '',
    redFlags: '',
    greenFlags: '',
    bond: '',
    startupIdeasNext2Years: '',
    locationAndRelocation: ''
  };

  // Reschedule Modal state
  showRescheduleModal = signal(false);
  rescheduleCandidate = signal<IShortlistCandidate | null>(null);
  rescheduleForm = {
    meetDate: '',
    meetTime: '11:00 AM',
    meetLink: '',
    meetNotes: '',
    emailSubject: '',
    emailBody: '',
    sendNotification: true
  };
  isRescheduling = signal(false);

  // Onboard Modal state
  showOnboardModal = signal(false);
  onboardCandidate = signal<IShortlistCandidate | null>(null);
  onboardForm = {
    onboardingDate: '',
    webAccess: true,
    remoteAccess: false
  };
  isOnboarding = signal(false);

  // Reject Modal state
  showRejectModal = signal(false);
  rejectCandidate = signal<IShortlistCandidate | null>(null);
  rejectForm = {
    reason: 'Profile does not align with current requirements',
    emailSubject: '',
    emailBody: ''
  };
  isRejecting = signal(false);

  // Company settings cache for templates
  companySettings = signal<any>(null);

  ngOnInit() {
    this.fetchCompanySettings();
    this.loadCandidates();
  }

  fetchCompanySettings() {
    this.apiService.getCompanySettings().subscribe({
      next: (res: any) => {
        const comp = res?.company || res?.data || res;
        this.companySettings.set(comp);
      },
      error: () => {}
    });
  }

  loadCandidates(force = false) {
    if (force) {
      this.cacheService.clear('/api/shortlist');
    }
    this.isLoading.set(true);
    const params: any = {
      tab: this.activeTab(),
      type: this.selectedType(),
      search: this.searchQuery()
    };

    this.apiService.getShortlistedCandidates(params).subscribe({
      next: (res: any) => {
        this.isLoading.set(false);
        this.candidates.set(res?.data || []);
        if (res?.metrics) {
          this.metrics.set(res.metrics);
        }
      },
      error: (err: any) => {
        this.isLoading.set(false);
        console.error('Error loading shortlisted candidates:', err);
        this.alertService.show('Failed to load shortlisted candidates');
      }
    });
  }

  setTab(tab: 'active' | 'interviewed' | 'onboarded' | 'rejected' | 'reschedule' | 'all') {
    this.activeTab.set(tab);
    this.loadCandidates();
  }

  setTypeFilter(type: 'all' | 'Employee' | 'Intern') {
    this.selectedType.set(type);
    this.loadCandidates();
  }

  onSearchChange() {
    this.loadCandidates();
  }

  // ── Remarks Drawer ──────────────────────────────────────────────────────────
  openRemarksDrawer(candidate: IShortlistCandidate) {
    this.selectedCandidate.set(candidate);
    this.newRemarkText.set('');
    const ev = candidate.interviewEvaluation || {};
    this.evaluationForm = {
      longTermGoal: ev.longTermGoal || '',
      expectationsFromCompany: ev.expectationsFromCompany || '',
      reasonNotSelectedPreviously: ev.reasonNotSelectedPreviously || '',
      redFlags: ev.redFlags || '',
      greenFlags: ev.greenFlags || '',
      bond: ev.bond || '',
      startupIdeasNext2Years: ev.startupIdeasNext2Years || '',
      locationAndRelocation: ev.locationAndRelocation || ''
    };
    this.activeDrawerTab.set('assessment');
    this.showRemarksDrawer.set(true);
  }

  closeRemarksDrawer() {
    this.showRemarksDrawer.set(false);
    this.selectedCandidate.set(null);
  }

  submitEvaluation() {
    const candidate = this.selectedCandidate();
    if (!candidate) return;

    this.isSavingEvaluation.set(true);
    this.cacheService.clear('/api/shortlist');
    this.apiService.saveShortlistEvaluation(candidate._id, this.evaluationForm).subscribe({
      next: (res: any) => {
        this.isSavingEvaluation.set(false);
        const updatedCandidate = res?.data || candidate;
        candidate.interviewEvaluation = updatedCandidate.interviewEvaluation || { ...this.evaluationForm };
        if (updatedCandidate.remarks) {
          candidate.remarks = updatedCandidate.remarks;
        }
        this.selectedCandidate.set({ ...candidate });

        this.candidates.update(list =>
          list.map(c => (c._id === candidate._id ? { ...candidate } : c))
        );
        this.alertService.show('Interview evaluation saved successfully!');
      },
      error: (err: any) => {
        this.isSavingEvaluation.set(false);
        console.error('Error saving evaluation:', err);
        this.alertService.show('Failed to save interview evaluation');
      }
    });
  }

  addRemark() {
    const text = this.newRemarkText().trim();
    const candidate = this.selectedCandidate();
    if (!text || !candidate) return;

    this.isAddingRemark.set(true);
    this.apiService.addShortlistRemark(candidate._id, text).subscribe({
      next: (res: any) => {
        this.isAddingRemark.set(false);
        this.newRemarkText.set('');
        
        // Update local candidate remarks list
        const updatedRemarks = res?.data || [];
        candidate.remarks = updatedRemarks;
        this.selectedCandidate.set({ ...candidate });

        // Update in candidates signal array
        this.candidates.update(list =>
          list.map(c => (c._id === candidate._id ? { ...c, remarks: updatedRemarks } : c))
        );
        this.alertService.show('Remark added successfully!');
      },
      error: (err: any) => {
        this.isAddingRemark.set(false);
        console.error('Error adding remark:', err);
        this.alertService.show('Failed to add remark');
      }
    });
  }

  // ── Reschedule Interview Modal ──────────────────────────────────────────────
  openRescheduleModal(candidate: IShortlistCandidate) {
    this.rescheduleCandidate.set(candidate);
    
    // Default meet date
    let dateStr = '';
    if (candidate.meetDate) {
      dateStr = new Date(candidate.meetDate).toISOString().split('T')[0];
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateStr = tomorrow.toISOString().split('T')[0];
    }

    this.rescheduleForm = {
      meetDate: dateStr,
      meetTime: candidate.meetTime || '11:00 AM',
      meetLink: candidate.meetLink || 'https://meet.google.com/',
      meetNotes: candidate.meetNotes || 'Please join 5 minutes prior.',
      emailSubject: `Interview Rescheduled - ${candidate.role || 'Job Application'} | Softrate`,
      emailBody: '',
      sendNotification: true
    };

    this.generateRescheduleEmail();
    this.showRescheduleModal.set(true);
  }

  closeRescheduleModal() {
    this.showRescheduleModal.set(false);
    this.rescheduleCandidate.set(null);
  }

  generateRescheduleEmail() {
    const candidate = this.rescheduleCandidate();
    if (!candidate) return;

    const rawTemplate = this.companySettings()?.communication?.shortlistInterviewTemplate || `
<p>Dear {formattedName},</p>
<p>Please note that your interview for the <b>{role}</b> position has been rescheduled.</p>
<p>The revised discussion details are as follows:</p>
<ul>
  <li><b>Date:</b> {meetDate}</li>
  <li><b>Time:</b> {meetTime}</li>
  <li><b>Meeting Link:</b> <a href="{meetLink}" target="_blank">{meetLink}</a></li>
  <li><b>Instructions:</b> {meetNotes}</li>
</ul>
<p>Please confirm your availability. Best regards,<br><b>HR Team</b><br>Softrate Technologies</p>
    `.trim();

    this.rescheduleForm.emailBody = rawTemplate
      .replace(/{formattedName}/g, candidate.fullName)
      .replace(/{role}/g, candidate.role || 'Role')
      .replace(/{meetDate}/g, this.rescheduleForm.meetDate || 'TBD')
      .replace(/{meetTime}/g, this.rescheduleForm.meetTime || 'TBD')
      .replace(/{meetLink}/g, this.rescheduleForm.meetLink || '')
      .replace(/{meetNotes}/g, this.rescheduleForm.meetNotes || '')
      .replace(/{signature}/g, '')
      .replace(/{logo}/g, '');
  }

  submitReschedule() {
    const candidate = this.rescheduleCandidate();
    if (!candidate || !this.rescheduleForm.meetDate) return;

    this.isRescheduling.set(true);
    this.cacheService.clear('/api/shortlist');
    this.apiService.rescheduleShortlist(candidate._id, this.rescheduleForm).subscribe({
      next: (res: any) => {
        this.isRescheduling.set(false);
        this.showRescheduleModal.set(false);
        this.alertService.show(res?.message || 'Interview rescheduled successfully!');
        this.loadCandidates(true);
      },
      error: (err: any) => {
        this.isRescheduling.set(false);
        console.error('Error rescheduling interview:', err);
        this.alertService.show('Failed to reschedule interview');
      }
    });
  }

  // ── Candidate Reschedule Request Review Modal ──────────────────────────────
  showRescheduleReviewModal = signal(false);
  rescheduleReviewCandidate = signal<IShortlistCandidate | null>(null);
  rescheduleReviewAction = signal<'accept' | 'decline'>('accept');
  rescheduleReviewForm = {
    meetDate: '',
    meetTime: '11:00 AM',
    meetLink: '',
    adminNotes: ''
  };
  isRespondingReschedule = signal(false);

  openRescheduleReviewModal(candidate: IShortlistCandidate, action: 'accept' | 'decline' = 'accept') {
    this.rescheduleReviewCandidate.set(candidate);
    this.rescheduleReviewAction.set(action);

    let defaultDate = '';
    if (candidate.rescheduleRequest?.requestedDate) {
      const d = new Date(candidate.rescheduleRequest.requestedDate);
      if (!isNaN(d.getTime())) {
        defaultDate = d.toISOString().split('T')[0];
      }
    }
    if (!defaultDate && candidate.meetDate) {
      const d = new Date(candidate.meetDate);
      if (!isNaN(d.getTime())) {
        defaultDate = d.toISOString().split('T')[0];
      }
    }
    if (!defaultDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      defaultDate = tomorrow.toISOString().split('T')[0];
    }

    this.rescheduleReviewForm = {
      meetDate: defaultDate,
      meetTime: candidate.rescheduleRequest?.requestedTime || candidate.meetTime || '11:00 AM',
      meetLink: candidate.meetLink || 'https://meet.google.com/',
      adminNotes: ''
    };

    this.showRescheduleReviewModal.set(true);
  }

  closeRescheduleReviewModal() {
    this.showRescheduleReviewModal.set(false);
    this.rescheduleReviewCandidate.set(null);
  }

  submitRescheduleResponse() {
    const candidate = this.rescheduleReviewCandidate();
    if (!candidate) return;

    if (this.rescheduleReviewAction() === 'accept') {
      if (!this.rescheduleReviewForm.meetDate) {
        this.alertService.show('Please select a valid interview date');
        return;
      }
      if (!this.rescheduleReviewForm.meetTime) {
        this.alertService.show('Please select a valid interview time');
        return;
      }
    }

    this.isRespondingReschedule.set(true);
    this.cacheService.clear('/api/shortlist');

    const payload = {
      action: this.rescheduleReviewAction(),
      meetDate: this.rescheduleReviewForm.meetDate,
      meetTime: this.rescheduleReviewForm.meetTime,
      meetLink: this.rescheduleReviewForm.meetLink,
      adminNotes: this.rescheduleReviewForm.adminNotes
    };

    this.apiService.respondToRescheduleRequest(candidate._id, payload).subscribe({
      next: (res: any) => {
        this.isRespondingReschedule.set(false);
        this.showRescheduleReviewModal.set(false);
        this.alertService.show(res?.message || 'Reschedule request responded successfully!');
        this.loadCandidates(true);
      },
      error: (err: any) => {
        this.isRespondingReschedule.set(false);
        console.error('Error responding to reschedule request:', err);
        const errMsg = err?.error?.message || err?.message || 'Failed to process reschedule request';
        this.alertService.show(errMsg);
      }
    });
  }

  // ── Onboard Modal ───────────────────────────────────────────────────────────
  openOnboardModal(candidate: IShortlistCandidate) {
    this.onboardCandidate.set(candidate);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.onboardForm.onboardingDate = tomorrow.toISOString().split('T')[0];
    this.onboardForm.webAccess = true;
    this.onboardForm.remoteAccess = false;
    this.showOnboardModal.set(true);
  }

  closeOnboardModal() {
    this.showOnboardModal.set(false);
    this.onboardCandidate.set(null);
  }

  submitOnboard() {
    const candidate = this.onboardCandidate();
    if (!candidate || !this.onboardForm.onboardingDate) return;

    this.isOnboarding.set(true);
    this.cacheService.clear('/api/shortlist');
    this.apiService.onboardShortlistCandidate(candidate._id, this.onboardForm).subscribe({
      next: (res: any) => {
        this.isOnboarding.set(false);
        this.showOnboardModal.set(false);
        this.alertService.show(res?.message || 'Candidate approved & onboarded successfully!');
        this.loadCandidates(true);
      },
      error: (err: any) => {
        this.isOnboarding.set(false);
        console.error('Error onboarding candidate:', err);
        this.alertService.show('Failed to onboard candidate: ' + (err.error?.message || err.message));
      }
    });
  }

  // ── Reject Modal ────────────────────────────────────────────────────────────
  openRejectModal(candidate: IShortlistCandidate) {
    this.rejectCandidate.set(candidate);
    this.rejectForm.reason = 'Profile does not align with current requirements';
    this.rejectForm.emailSubject = `Update regarding your application for ${candidate.role || 'Role'} | Softrate`;
    
    this.rejectForm.emailBody = `
<p>Dear ${candidate.fullName},</p>
<p>Thank you for taking the time to interview with us for the <b>${candidate.role || 'Position'}</b> role at Softrate.</p>
<p>While we were impressed with your background, after careful consideration, we have decided to move forward with other candidates whose skill sets more closely align with our current needs.</p>
<p>We appreciate your interest in Softrate and wish you the very best in your job search and professional endeavors.</p>
<p>Best regards,<br><b>HR Team</b><br>Softrate Technologies</p>
    `.trim();

    this.showRejectModal.set(true);
  }

  closeRejectModal() {
    this.showRejectModal.set(false);
    this.rejectCandidate.set(null);
  }

  submitReject() {
    const candidate = this.rejectCandidate();
    if (!candidate) return;

    this.isRejecting.set(true);
    this.cacheService.clear('/api/shortlist');
    this.apiService.rejectShortlistCandidate(candidate._id, this.rejectForm).subscribe({
      next: (res: any) => {
        this.isRejecting.set(false);
        this.showRejectModal.set(false);
        this.alertService.show(res?.message || 'Candidate marked as rejected.');
        this.loadCandidates(true);
      },
      error: (err: any) => {
        this.isRejecting.set(false);
        console.error('Error rejecting candidate:', err);
        this.alertService.show('Failed to reject candidate');
      }
    });
  }

  // ── Status toggles (e.g. Mark Interviewed) ──────────────────────────────────
  markInterviewed(candidate: IShortlistCandidate) {
    if (!candidate) return;
    const prevStatus = candidate.status;
    const candidateId = candidate._id;

    // 1. Optimistic / immediate state update
    candidate.status = 'interviewed';
    this.candidates.update(list =>
      list.map(c => (c._id === candidateId ? { ...c, status: 'interviewed' } : c))
    );
    if (this.selectedCandidate()?._id === candidateId) {
      this.selectedCandidate.set({ ...this.selectedCandidate()!, status: 'interviewed' });
    }

    // 2. Clear cache to prevent stale GET responses
    this.cacheService.clear('/api/shortlist');

    this.apiService.updateShortlistStatus(candidateId, 'interviewed', 'Completed interview discussion.').subscribe({
      next: (res: any) => {
        this.alertService.show('Marked as Interviewed');
        this.loadCandidates(true);
      },
      error: (err: any) => {
        // Rollback on error
        candidate.status = prevStatus;
        this.candidates.update(list =>
          list.map(c => (c._id === candidateId ? { ...c, status: prevStatus } : c))
        );
        if (this.selectedCandidate()?._id === candidateId) {
          this.selectedCandidate.set({ ...this.selectedCandidate()!, status: prevStatus });
        }
        console.error('Failed to update status:', err);
        this.alertService.show('Failed to update status');
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  copyMeetLink(link: string) {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      this.alertService.show('Meeting link copied to clipboard!');
    });
  }

  viewApplicantDetails(candidate: IShortlistCandidate) {
    if (candidate.candidateType === 'Intern') {
      this.router.navigate(['/interns', candidate.candidateId]);
    } else {
      this.router.navigate(['/employees', candidate.candidateId]);
    }
  }

  getScheduleBadge(dateStr: string | Date): { label: string; class: string } {
    if (!dateStr) return { label: 'TBD', class: 'badge-gray' };
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(date);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return { label: 'Today', class: 'badge-today' };
    } else if (diffDays === 1) {
      return { label: 'Tomorrow', class: 'badge-tomorrow' };
    } else if (diffDays > 1) {
      return { label: `In ${diffDays} days`, class: 'badge-upcoming' };
    } else {
      return { label: 'Past', class: 'badge-past' };
    }
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
}
