import { AlertService } from '../../../shared/services/alert';
import { Component, signal, computed, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../services/api.service';
import { EmployeeRequestsStateService } from '../../../services/requests-state.service';

@Component({
  selector: 'app-employee-requests',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './employee-requests.html',
  styleUrl: './employee-requests.css'
})
export class EmployeeRequests implements OnInit, OnDestroy {
  private alertService = inject(AlertService);
  private apiService = inject(ApiService);
  private router = inject(Router);
  private stateService = inject(EmployeeRequestsStateService);

  navigateTo(path: string[]) {
    this.router.navigate(path).then(() => {
      const mainContent = document.querySelector('.main-content');
      if (mainContent) mainContent.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }
  
  allRequests = signal<any[]>([]);
  managers = signal<any[]>([]);
  currentCategory = signal<'Pending' | 'Shortlist' | 'Maybe' | 'Assigned' | 'Approved' | 'Rejected'>('Pending');
  isLoading = signal(true);
  isAssigning = signal<string | null>(null);

  // Filter Panel Toggle
  isFilterPanelOpen = signal<boolean>(false);

  // Search & Sorting
  searchQuery = signal<string>('');
  sortFilter = signal<string>('recent');

  companySettings = signal<any>(null);
  showRejectModal = signal(false);
  isSendingReject = signal(false);
  rejectCandidate = signal<any | null>(null);
  rejectForm = {
    reason: '',
    emailSubject: '',
    emailBody: ''
  };

  // Multi-Dimensional Filters
  roles = signal<string[]>([]);
  roleFilter = signal<string[]>([]);
  experienceOptions = [
    { value: 'fresher', label: 'Fresher (0 yrs)' },
    { value: 'experienced', label: 'Experienced (Any)' },
    { value: '<1yr', label: '< 1 Year' },
    { value: '1-2yr', label: '1 – 2 Years' },
    { value: '2-3yr', label: '2 – 3 Years' },
    { value: '3-5yr', label: '3 – 5 Years' },
    { value: '5+yr', label: '5+ Years' }
  ];
  experienceFilter = signal<string[]>([]);
  yearFilter = signal<string[]>([]);
  degreeFilter = signal<string[]>([]);
  assessmentFilter = signal<string[]>([]);
  managerFilter = signal<string[]>([]);
  noticePeriodFilter = signal<string[]>([]);
  currentCtcFilter = signal<string[]>([]);
  expectedCtcFilter = signal<string[]>([]);
  fromDate = signal<string>('');
  toDate = signal<string>('');

  activeDropdown = signal<string | null>(null);

  degreeOptions = [
    'B.E / B.Tech',
    'B.Sc / BCA',
    'M.E / M.Tech',
    'MCA / M.Sc',
    'MBA',
    'Diploma in Engineering',
    'Other'
  ];

  yearOptions = [
    '1st Year',
    '2nd Year',
    '3rd Year',
    '4th Year',
    '5th Year',
    'Passed Out'
  ];

  assessmentOptions = [
    { value: 'completed', label: 'Completed Assessment' },
    { value: 'none', label: 'No Assessment Submitted' }
  ];

  noticePeriodOptions = [
    { value: 'immediate', label: 'Immediate (0 Days)' },
    { value: '1-15', label: '1 – 15 Days' },
    { value: '16-30', label: '16 – 30 Days' },
    { value: '31-60', label: '31 – 60 Days' },
    { value: '60+', label: '60+ Days' }
  ];

  ctcOptions = [
    { value: '<3', label: '< 3 LPA' },
    { value: '3-6', label: '3 – 6 LPA' },
    { value: '6-10', label: '6 – 10 LPA' },
    { value: '10-15', label: '10 – 15 LPA' },
    { value: '15+', label: '15+ LPA' }
  ];

  // Active Filter Count Badge
  activeFilterCount = computed(() => {
    let count = 0;
    if (this.roleFilter().length > 0) count++;
    if (this.experienceFilter().length > 0) count++;
    if (this.yearFilter().length > 0) count++;
    if (this.degreeFilter().length > 0) count++;
    if (this.assessmentFilter().length > 0) count++;
    if (this.managerFilter().length > 0) count++;
    if (this.noticePeriodFilter().length > 0) count++;
    if (this.currentCtcFilter().length > 0) count++;
    if (this.expectedCtcFilter().length > 0) count++;
    if (this.fromDate()) count++;
    if (this.toDate()) count++;
    return count;
  });

  // Helpers to set filters
  toggleFilterPanel() {
    this.isFilterPanelOpen.set(!this.isFilterPanelOpen());
    this.syncToState();
  }

  isFresherCandidate(r: any): boolean {
    if (!r) return true;
    if (r.isFresher === true || r.experienceStatus === 'fresher') return true;
    if (r.isExperienced === false) return true;
    const rawYoe = r.yearsOfExperience ?? r.experienceYears ?? r.experienceLevel ?? r.experience;
    if (rawYoe === undefined || rawYoe === null || rawYoe === '') {
      return r.isExperienced !== true;
    }
    const num = parseFloat(rawYoe.toString().replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num > 0) return false;
    const str = rawYoe.toString().toLowerCase().trim();
    if (str === '0' || str === '0 yrs' || str === '0 years' || str === 'fresher') return true;
    if (r.isExperienced === true) return false;
    return true;
  }

  getNumericExperience(r: any): number {
    if (!r || this.isFresherCandidate(r)) return 0;
    const rawYoe = r.yearsOfExperience ?? r.experienceYears ?? r.experienceLevel ?? r.experience;
    if (rawYoe === undefined || rawYoe === null || rawYoe === '') return 0;
    const match = rawYoe.toString().match(/([0-9]+(\.[0-9]+)?)/);
    if (match) {
      return parseFloat(match[1]);
    }
    return 0;
  }

  getExperienceDisplay(r: any): string {
    if (!r) return 'Fresher';
    if (this.isFresherCandidate(r)) return 'Fresher';

    const yoe = r.yearsOfExperience ?? r.experienceYears ?? r.experienceLevel ?? r.experience;
    if (yoe !== undefined && yoe !== null && yoe !== '') {
      const str = yoe.toString().trim();
      const num = parseFloat(str.replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && num > 0) {
        return `${num} ${num === 1 ? 'Yr' : 'Yrs'} Exp`;
      }
      if (str.toLowerCase().includes('year') || str.toLowerCase().includes('yr') || str.toLowerCase().includes('exp')) {
        return str;
      }
      return `${str} Exp`;
    }
    return 'Experienced';
  }

  // Column Resizing Handler
  onColumnResize(event: MouseEvent, th: HTMLElement) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.pageX;
    const startWidth = th.offsetWidth;

    const mouseMoveHandler = (e: MouseEvent) => {
      const newWidth = Math.max(90, startWidth + (e.pageX - startX));
      th.style.width = `${newWidth}px`;
      th.style.minWidth = `${newWidth}px`;
    };

    const mouseUpHandler = () => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
    };

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  }

  getTimestamp(r: any): number {
    if (!r) return 0;
    if (r.createdAt) {
      const t = new Date(r.createdAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (r.appliedAt) {
      const t = new Date(r.appliedAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (r.registrationDate) {
      const t = new Date(r.registrationDate).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (r.created_at) {
      const t = new Date(r.created_at).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (r._id && typeof r._id === 'string' && r._id.length === 24) {
      const sec = parseInt(r._id.substring(0, 8), 16);
      if (!isNaN(sec) && sec > 0) return sec * 1000;
    }
    return 0;
  }

  setSort(sort: string) {
    this.sortFilter.set(sort);
    this.syncToState();
  }

  // Dropdown Open/Close
  toggleDropdown(name: string, event?: Event) {
    if (event) event.stopPropagation();
    this.activeDropdown.update(curr => curr === name ? null : name);
  }

  isDropdownOpen(name: string): boolean {
    return this.activeDropdown() === name;
  }

  closeAllDropdowns() {
    this.activeDropdown.set(null);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    this.activeDropdown.set(null);
  }

  // Generic Selection Helpers
  isItemSelected(list: string[], val: string): boolean {
    if (val === 'all') return list.length === 0;
    return list.includes(val);
  }

  toggleOptionInList(targetSignal: any, val: string, event?: Event) {
    if (event) event.stopPropagation();
    if (val === 'all') {
      targetSignal.set([]);
      this.syncToState();
      return;
    }
    const current = [...targetSignal()];
    const idx = current.indexOf(val);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(val);
    }
    targetSignal.set(current);
    this.syncToState();
  }

  removeOptionFromList(targetSignal: any, val: string, event?: Event) {
    if (event) event.stopPropagation();
    const current = targetSignal().filter((v: string) => v !== val);
    targetSignal.set(current);
    this.syncToState();
  }

  // Display texts for dropdown triggers
  getRoleFilterDisplayText(): string {
    const list = this.roleFilter();
    if (list.length === 0) return 'All Roles';
    if (list.length === 1) return list[0];
    return `${list.length} Roles Selected`;
  }

  getExpFilterDisplayText(): string {
    const list = this.experienceFilter();
    if (list.length === 0) return 'All Experience Levels';
    if (list.length === 1) {
      const opt = this.experienceOptions.find(o => o.value === list[0]);
      return opt ? opt.label : list[0];
    }
    return `${list.length} Levels Selected`;
  }

  getExpOptionLabel(val: string): string {
    const opt = this.experienceOptions.find(o => o.value === val);
    return opt ? opt.label : val;
  }

  getDegreeFilterDisplayText(): string {
    const list = this.degreeFilter();
    if (list.length === 0) return 'All Degrees';
    if (list.length === 1) return list[0];
    return `${list.length} Degrees Selected`;
  }

  getYearFilterDisplayText(): string {
    const list = this.yearFilter();
    if (list.length === 0) return 'All Batches / Years';
    if (list.length === 1) return list[0];
    return `${list.length} Batches Selected`;
  }

  getAssessmentFilterDisplayText(): string {
    const list = this.assessmentFilter();
    if (list.length === 0) return 'All Assessment Statuses';
    if (list.length === 1) {
      const opt = this.assessmentOptions.find(o => o.value === list[0]);
      return opt ? opt.label : list[0];
    }
    return `${list.length} Statuses Selected`;
  }

  getAssessmentOptionLabel(val: string): string {
    const opt = this.assessmentOptions.find(o => o.value === val);
    return opt ? opt.label : val;
  }

  getManagerFilterDisplayText(): string {
    const list = this.managerFilter();
    if (list.length === 0) return 'All Assignment Statuses';
    if (list.length === 1) return this.getManagerOptionLabel(list[0]);
    return `${list.length} Selected`;
  }

  getManagerOptionLabel(val: string): string {
    if (val === 'unassigned') return 'Unassigned (Needs Manager)';
    if (val === 'assigned') return 'Assigned (Any Manager)';
    const m = this.managers().find(mgr => mgr._id === val);
    return m ? `${m.fullName}${m.department ? ' (' + m.department + ')' : ''}` : val;
  }

  getNoticePeriodFilterDisplayText(): string {
    const list = this.noticePeriodFilter();
    if (list.length === 0) return 'All Notice Periods';
    if (list.length === 1) return this.getNoticePeriodOptionLabel(list[0]);
    return `${list.length} Periods Selected`;
  }

  getNoticePeriodOptionLabel(val: string): string {
    const opt = this.noticePeriodOptions.find(o => o.value === val);
    return opt ? opt.label : val;
  }

  getCurrentCtcFilterDisplayText(): string {
    const list = this.currentCtcFilter();
    if (list.length === 0) return 'All Current CTC';
    if (list.length === 1) return this.getCtcOptionLabel(list[0]);
    return `${list.length} Ranges Selected`;
  }

  getExpectedCtcFilterDisplayText(): string {
    const list = this.expectedCtcFilter();
    if (list.length === 0) return 'All Expected CTC';
    if (list.length === 1) return this.getCtcOptionLabel(list[0]);
    return `${list.length} Ranges Selected`;
  }

  getCtcOptionLabel(val: string): string {
    const opt = this.ctcOptions.find(o => o.value === val);
    return opt ? opt.label : val;
  }

  setFromDate(date: string) {
    this.fromDate.set(date);
    this.syncToState();
  }

  setToDate(date: string) {
    this.toDate.set(date);
    this.syncToState();
  }

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
    this.syncToState();
  }

  resetAllFilters() {
    this.searchQuery.set('');
    this.roleFilter.set([]);
    this.experienceFilter.set([]);
    this.yearFilter.set([]);
    this.degreeFilter.set([]);
    this.assessmentFilter.set([]);
    this.managerFilter.set([]);
    this.noticePeriodFilter.set([]);
    this.currentCtcFilter.set([]);
    this.expectedCtcFilter.set([]);
    this.fromDate.set('');
    this.toDate.set('');
    this.sortFilter.set('recent');
    this.syncToState();
  }

  clearSingleFilter(type: string) {
    switch (type) {
      case 'search': this.searchQuery.set(''); break;
      case 'role': this.roleFilter.set([]); break;
      case 'experience': this.experienceFilter.set([]); break;
      case 'year': this.yearFilter.set([]); break;
      case 'degree': this.degreeFilter.set([]); break;
      case 'assessment': this.assessmentFilter.set([]); break;
      case 'manager': this.managerFilter.set([]); break;
      case 'noticePeriod': this.noticePeriodFilter.set([]); break;
      case 'currentCtc': this.currentCtcFilter.set([]); break;
      case 'expectedCtc': this.expectedCtcFilter.set([]); break;
      case 'fromDate': this.fromDate.set(''); break;
      case 'toDate': this.toDate.set(''); break;
    }
    this.syncToState();
  }

  syncToState() {
    this.stateService.saveState({
      allRequests: this.allRequests(),
      managers: this.managers(),
      roles: this.roles(),
      companySettings: this.companySettings(),
      currentCategory: this.currentCategory(),
      searchQuery: this.searchQuery(),
      sortFilter: this.sortFilter(),
      isFilterPanelOpen: this.isFilterPanelOpen(),
      roleFilter: this.roleFilter(),
      experienceFilter: this.experienceFilter(),
      yearFilter: this.yearFilter(),
      degreeFilter: this.degreeFilter(),
      assessmentFilter: this.assessmentFilter(),
      managerFilter: this.managerFilter(),
      noticePeriodFilter: this.noticePeriodFilter(),
      currentCtcFilter: this.currentCtcFilter(),
      expectedCtcFilter: this.expectedCtcFilter(),
      fromDate: this.fromDate(),
      toDate: this.toDate(),
      hasLoaded: true
    });
  }

  private parseArrayFilter(val: any): string[] {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val !== 'all' && val.trim() !== '') return [val];
    return [];
  }

  ngOnInit() {
    if (this.stateService.hasLoaded) {
      // Instantly restore saved state without loading spinner
      this.allRequests.set(this.stateService.allRequests);
      this.managers.set(this.stateService.managers);
      this.roles.set(this.stateService.roles);
      this.companySettings.set(this.stateService.companySettings);
      this.currentCategory.set(this.stateService.currentCategory);
      this.searchQuery.set(this.stateService.searchQuery);
      this.sortFilter.set(this.stateService.sortFilter);
      this.isFilterPanelOpen.set(this.stateService.isFilterPanelOpen);
      this.roleFilter.set(this.parseArrayFilter(this.stateService.roleFilter));
      this.experienceFilter.set(this.parseArrayFilter(this.stateService.experienceFilter));
      this.yearFilter.set(this.parseArrayFilter(this.stateService.yearFilter));
      this.degreeFilter.set(this.parseArrayFilter(this.stateService.degreeFilter));
      this.assessmentFilter.set(this.parseArrayFilter(this.stateService.assessmentFilter));
      this.managerFilter.set(this.parseArrayFilter(this.stateService.managerFilter));
      this.noticePeriodFilter.set(this.parseArrayFilter(this.stateService.noticePeriodFilter));
      this.currentCtcFilter.set(this.parseArrayFilter(this.stateService.currentCtcFilter));
      this.expectedCtcFilter.set(this.parseArrayFilter(this.stateService.expectedCtcFilter));
      this.fromDate.set(this.stateService.fromDate);
      this.toDate.set(this.stateService.toDate);
      this.isLoading.set(false);

      // Perform silent background refresh
      this.fetchRequests(true);
      if (!this.managers().length) this.fetchManagers();
      if (!this.companySettings()) this.fetchCompanySettings();
    } else {
      this.isLoading.set(true);
      this.fetchRequests(false);
      this.fetchManagers();
      this.fetchCompanySettings();
    }
  }

  ngOnDestroy() {
    this.syncToState();
  }

  fetchCompanySettings() {
    this.apiService.getCompanySettings().subscribe(res => {
      const s = res?.settings;
      if (s) {
        this.companySettings.set(s);
        let combinedRoles: string[] = [];
        if (Array.isArray(s.roles) && s.roles.length > 0) {
          combinedRoles = s.roles.filter((r: any) => r.isEmployee && r.name !== 'Other').map((r: any) => r.name);
        } else if (Array.isArray(s.employeeRoles)) {
          combinedRoles = s.employeeRoles.filter((r: string) => r && r !== 'Other');
        }
        if (Array.isArray(s.careerPostings)) {
          s.careerPostings.forEach((cp: any) => {
            if (cp.title && cp.roleType !== 'Internship' && !combinedRoles.includes(cp.title)) {
              combinedRoles.push(cp.title);
            }
          });
        }
        this.roles.set(combinedRoles);
        this.syncToState();
      }
    });
  }

  fetchRequests(silent: boolean = false) {
    if (!silent) {
      this.isLoading.set(true);
    }
    this.apiService.getAllEmployees('all', 'initial,shortlist,maybe,approved,rejected').subscribe({
      next: (data) => {
        this.allRequests.set(data || []);
        this.isLoading.set(false);
        this.syncToState();
      },
      error: (err) => {
        console.error('Failed to fetch employee requests', err);
        this.isLoading.set(false);
      }
    });
  }

  fetchManagers() {
    this.apiService.getManagers().subscribe(data => {
      this.managers.set(data || []);
      this.syncToState();
    });
  }

  assignToManager(empId: string, managerId: string) {
    if (!managerId) return;
    this.isAssigning.set(empId);
    this.apiService.assignEmployeeToManager(empId, managerId).subscribe({
      next: () => {
        this.alertService.show('Employee assigned to manager successfully');
        this.fetchRequests(true);
        this.isAssigning.set(null);
      },
      error: (err) => {
        console.error('Assignment failed', err);
        this.alertService.show('Failed to assign manager');
        this.isAssigning.set(null);
      }
    });
  }

  // Verification Helper Functions for Data Filtering
  hasAssessmentAnswers(r: any): boolean {
    if (!r) return false;
    if (r.assessmentAnswers) {
      if (typeof r.assessmentAnswers === 'string') {
        try {
          const parsed = JSON.parse(r.assessmentAnswers);
          return parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0;
        } catch (e) {
          return r.assessmentAnswers.trim().length > 2;
        }
      }
      return typeof r.assessmentAnswers === 'object' && Object.keys(r.assessmentAnswers).length > 0;
    }
    return !!(r.assessment && (r.assessment.score !== undefined || r.assessment.answers));
  }

  inferCategory(roleName: string): string {
    const clean = (roleName || '').toLowerCase();
    if (clean.includes('sales') || clean.includes('business development') || clean.includes('bde') || clean.includes('telecalling')) return 'sales';
    if (clean.includes('market') || clean.includes('growth') || clean.includes('seo') || clean.includes('performance')) return 'marketing';
    if (clean.includes('video') || clean.includes('media') || clean.includes('graph') || clean.includes('content') || clean.includes('editor')) return 'media';
    if (clean.includes('design') || clean.includes('ui') || clean.includes('ux') || clean.includes('figma')) return 'design';
    if (clean.includes('hr') || clean.includes('talent') || clean.includes('recruit')) return 'hr';
    if (clean.includes('operation') || clean.includes('admin')) return 'operations';
    if (clean.includes('test') || clean.includes('qa') || clean.includes('quality') || clean.includes('automation')) return 'testing';
    return 'engineering';
  }

  matchesDateRange(dateStr: any, range: string): boolean {
    if (!range || range === 'all') return true;
    if (!dateStr) return false;
    const itemDate = new Date(dateStr).getTime();
    const now = Date.now();
    if (isNaN(itemDate)) return true;
    
    if (range === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return itemDate >= today.getTime();
    } else if (range === '7days') {
      return itemDate >= (now - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30days') {
      return itemDate >= (now - 30 * 24 * 60 * 60 * 1000);
    }
    return true;
  }

  matchesSingleExperience(r: any, filterKey: string): boolean {
    if (!filterKey || filterKey === 'all') return true;
    const isFresher = this.isFresherCandidate(r);
    if (filterKey === 'fresher') return isFresher;
    if (filterKey === 'experienced') return !isFresher;
    
    if (isFresher) return false;
    const yoe = this.getNumericExperience(r);
    
    if (filterKey === '<1yr') return yoe > 0 && yoe < 1;
    if (filterKey === '1-2yr') return yoe >= 1 && yoe <= 2;
    if (filterKey === '2-3yr') return yoe >= 2 && yoe <= 3;
    if (filterKey === '3-5yr') return yoe >= 3 && yoe <= 5;
    if (filterKey === '5+yr') return yoe >= 5;
    return true;
  }

  matchesExperience(r: any, expFilters: string[] | string): boolean {
    if (!expFilters) return true;
    if (typeof expFilters === 'string') {
      if (expFilters === 'all' || !expFilters.trim()) return true;
      return this.matchesSingleExperience(r, expFilters);
    }
    if (!Array.isArray(expFilters) || expFilters.length === 0) return true;
    return expFilters.some(f => this.matchesSingleExperience(r, f));
  }

  matchesSingleDegree(r: any, degreeFilter: string): boolean {
    if (!degreeFilter || degreeFilter === 'all' || degreeFilter === 'All Degrees') return true;
    const candidateDegree = (r.degree || r.qualification || '').toString().toLowerCase();
    const filterKey = degreeFilter.toLowerCase();
    if (filterKey.includes('b.e') || filterKey.includes('b.tech')) {
      return candidateDegree.includes('b.e') || candidateDegree.includes('btech') || candidateDegree.includes('b.tech') || candidateDegree.includes('engineering');
    }
    if (filterKey.includes('b.sc') || filterKey.includes('bca')) {
      return candidateDegree.includes('b.sc') || candidateDegree.includes('bsc') || candidateDegree.includes('bca') || candidateDegree.includes('science');
    }
    if (filterKey.includes('m.e') || filterKey.includes('m.tech')) {
      return candidateDegree.includes('m.e') || candidateDegree.includes('mtech') || candidateDegree.includes('m.tech');
    }
    if (filterKey.includes('mca') || filterKey.includes('m.sc')) {
      return candidateDegree.includes('mca') || candidateDegree.includes('m.sc') || candidateDegree.includes('msc');
    }
    if (filterKey.includes('mba')) {
      return candidateDegree.includes('mba') || candidateDegree.includes('management');
    }
    if (filterKey.includes('diploma')) {
      return candidateDegree.includes('diploma');
    }
    return candidateDegree.includes(filterKey);
  }

  matchesDegree(r: any, degreeFilters: string[] | string): boolean {
    if (!degreeFilters) return true;
    if (typeof degreeFilters === 'string') {
      if (degreeFilters === 'all' || !degreeFilters.trim()) return true;
      return this.matchesSingleDegree(r, degreeFilters);
    }
    if (!Array.isArray(degreeFilters) || degreeFilters.length === 0) return true;
    return degreeFilters.some(d => this.matchesSingleDegree(r, d));
  }

  matchesSingleYear(r: any, yearFilter: string): boolean {
    if (!yearFilter || yearFilter === 'all' || yearFilter === 'All Batches / Years') return true;
    const candidateYear = (r.year || r.batch || r.graduationYear || '').toString().toLowerCase();
    return candidateYear.includes(yearFilter.toLowerCase());
  }

  matchesYear(r: any, yearFilters: string[] | string): boolean {
    if (!yearFilters) return true;
    if (typeof yearFilters === 'string') {
      if (yearFilters === 'all' || !yearFilters.trim()) return true;
      return this.matchesSingleYear(r, yearFilters);
    }
    if (!Array.isArray(yearFilters) || yearFilters.length === 0) return true;
    return yearFilters.some(y => this.matchesSingleYear(r, y));
  }

  matchesSingleNoticePeriod(r: any, npFilter: string): boolean {
    if (!npFilter || npFilter === 'all') return true;
    const raw = r.noticePeriod ?? r.noticePeriodDays;
    const val = (raw !== undefined && raw !== null && raw !== '') ? Number(raw) : null;
    if (val === null || isNaN(val)) {
      return npFilter === 'immediate';
    }
    if (npFilter === 'immediate') return val === 0;
    if (npFilter === '1-15') return val >= 1 && val <= 15;
    if (npFilter === '16-30') return val >= 16 && val <= 30;
    if (npFilter === '31-60') return val >= 31 && val <= 60;
    if (npFilter === '60+') return val > 60;
    return true;
  }

  matchesNoticePeriod(r: any, npFilters: string[] | string): boolean {
    if (!npFilters) return true;
    if (typeof npFilters === 'string') {
      if (npFilters === 'all' || !npFilters.trim()) return true;
      return this.matchesSingleNoticePeriod(r, npFilters);
    }
    if (!Array.isArray(npFilters) || npFilters.length === 0) return true;
    return npFilters.some(np => this.matchesSingleNoticePeriod(r, np));
  }

  matchesSingleCtc(r: any, ctcFilter: string, field: 'currentCtc' | 'expectedCtc'): boolean {
    if (!ctcFilter || ctcFilter === 'all') return true;
    const raw = r[field];
    const val = (raw !== undefined && raw !== null && raw !== '') ? Number(raw) : null;
    if (val === null || isNaN(val)) return false;
    if (ctcFilter === '<3') return val < 3;
    if (ctcFilter === '3-6') return val >= 3 && val <= 6;
    if (ctcFilter === '6-10') return val > 6 && val <= 10;
    if (ctcFilter === '10-15') return val > 10 && val <= 15;
    if (ctcFilter === '15+') return val > 15;
    return true;
  }

  matchesCtc(r: any, ctcFilters: string[] | string, field: 'currentCtc' | 'expectedCtc'): boolean {
    if (!ctcFilters) return true;
    if (typeof ctcFilters === 'string') {
      if (ctcFilters === 'all' || !ctcFilters.trim()) return true;
      return this.matchesSingleCtc(r, ctcFilters, field);
    }
    if (!Array.isArray(ctcFilters) || ctcFilters.length === 0) return true;
    return ctcFilters.some(c => this.matchesSingleCtc(r, c, field));
  }

  // Complete Multi-Dimensional Filter Engine
  filteredRequests = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const category = this.currentCategory();
    const all = this.allRequests();
    
    const roleF = this.roleFilter();
    const expF = this.experienceFilter();
    const yrF = this.yearFilter();
    const degF = this.degreeFilter();
    const assessF = this.assessmentFilter();
    const mgrF = this.managerFilter();
    const noticeF = this.noticePeriodFilter();
    const curCtcF = this.currentCtcFilter();
    const expCtcF = this.expectedCtcFilter();

    const result = all.filter(r => {
      // 1. Search Query
      if (query) {
        const matchesSearch = 
          r.fullName?.toLowerCase().includes(query) || 
          r.college?.toLowerCase().includes(query) || 
          r.department?.toLowerCase().includes(query) ||
          r.phone?.toLowerCase().includes(query) ||
          r.contact?.toLowerCase().includes(query) ||
          r.email?.toLowerCase().includes(query) ||
          (r.role && r.role.toLowerCase().includes(query)) ||
          (r.designation && r.designation.toLowerCase().includes(query)) ||
          (r.location && r.location.toLowerCase().includes(query)) ||
          (r.EmployeeId && r.EmployeeId.toLowerCase().includes(query));
        
        if (!matchesSearch) return false;
      }

      // 2. Tab Filter (Category status)
      const isAssigned = !!r.assignedManager || !!r.assignedToManager;
      const managerStatus = r.managerApprovalStatus || 'pending';
      const status = r.status || 'initial';

      if (category === 'Shortlist') {
        if (status !== 'shortlist' && managerStatus !== 'shortlist') return false;
      } else if (category === 'Maybe') {
        if (status !== 'maybe' && managerStatus !== 'maybe') return false;
      } else if (category === 'Assigned') {
        if (!isAssigned || managerStatus !== 'pending') return false;
      } else if (category === 'Approved') {
        if (status !== 'approved' && managerStatus !== 'approved') return false;
      } else if (category === 'Rejected') {
        if (status !== 'rejected' && managerStatus !== 'rejected') return false;
      } else if (category === 'Pending') {
        if (isAssigned) return false;
        if (status === 'shortlist' || status === 'maybe' || status === 'approved' || status === 'rejected') return false;
        if (managerStatus === 'shortlist' || managerStatus === 'maybe' || managerStatus === 'approved' || managerStatus === 'rejected') return false;
      }

      const hasAssessment = this.hasAssessmentAnswers(r);

      // 3. Role Filter
      if (roleF && roleF.length > 0) {
        const reqRole = (r.designation || r.role || '').trim().toLowerCase();
        const matchesAnyRole = roleF.some(rf => rf.trim().toLowerCase() === reqRole);
        if (!matchesAnyRole) return false;
      }

      // 4. Experience Filter
      if (!this.matchesExperience(r, expF)) return false;

      // 5. Academic Year / Batch Filter
      if (!this.matchesYear(r, yrF)) return false;

      // 6. Degree / Qualification Filter
      if (!this.matchesDegree(r, degF)) return false;

      // 7. Assessment Status Filter
      if (assessF && assessF.length > 0) {
        const matchesCompleted = assessF.includes('completed') && hasAssessment;
        const matchesNone = assessF.includes('none') && !hasAssessment;
        if (!matchesCompleted && !matchesNone) return false;
      }

      // 8. Manager Assignment Filter
      if (mgrF && mgrF.length > 0) {
        const assignedId = (r.assignedManager?._id || r.assignedManager || r.assignedToManager?._id || r.assignedToManager || '').toString();
        const matchesMgr = mgrF.some(m => {
          if (m === 'unassigned') return !isAssigned;
          if (m === 'assigned') return isAssigned;
          return assignedId === m;
        });
        if (!matchesMgr) return false;
      }

      // 9. Notice Period Filter
      if (!this.matchesNoticePeriod(r, noticeF)) return false;

      // 10. Current CTC Filter
      if (!this.matchesCtc(r, curCtcF, 'currentCtc')) return false;

      // 11. Expected CTC Filter
      if (!this.matchesCtc(r, expCtcF, 'expectedCtc')) return false;

      // 12. Date Range Filter (From Date / To Date)
      if (this.fromDate() || this.toDate()) {
        const itemTime = this.getTimestamp(r);
        if (this.fromDate()) {
          const fromTime = new Date(this.fromDate() + 'T00:00:00').getTime();
          if (!isNaN(fromTime) && itemTime < fromTime) return false;
        }
        if (this.toDate()) {
          const toTime = new Date(this.toDate() + 'T23:59:59.999').getTime();
          if (!isNaN(toTime) && itemTime > toTime) return false;
        }
      }

      return true;
    });

    // Sorting
    const sortVal = this.sortFilter();
    const sorted = [...result];
    if (sortVal === 'az') {
      sorted.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
    } else if (sortVal === 'za') {
      sorted.sort((a, b) => (b.fullName || '').localeCompare(a.fullName || ''));
    } else if (sortVal === 'oldest') {
      sorted.sort((a, b) => this.getTimestamp(a) - this.getTimestamp(b));
    } else {
      // Default: recent (Newest to Oldest)
      sorted.sort((a, b) => this.getTimestamp(b) - this.getTimestamp(a));
    }

    return sorted;
  });

  setCategory(category: 'Pending' | 'Shortlist' | 'Maybe' | 'Assigned' | 'Approved' | 'Rejected') {
    this.currentCategory.set(category);
    this.syncToState();
  }

  pendingCount = computed(() => this.getFilteredCountForCategory('Pending'));
  shortlistCount = computed(() => this.getFilteredCountForCategory('Shortlist'));
  maybeCount = computed(() => this.getFilteredCountForCategory('Maybe'));
  assignedCount = computed(() => this.getFilteredCountForCategory('Assigned'));
  approvedCount = computed(() => this.getFilteredCountForCategory('Approved'));
  rejectedCount = computed(() => this.getFilteredCountForCategory('Rejected'));

  private getFilteredCountForCategory(category: string) {
    const query = this.searchQuery().toLowerCase().trim();
    const all = this.allRequests();
    
    return all.filter(r => {
      const isAssigned = !!r.assignedManager || !!r.assignedToManager;
      const managerStatus = r.managerApprovalStatus || 'pending';
      const status = r.status || 'initial';

      let inCategory = false;
      if (category === 'Shortlist') inCategory = status === 'shortlist' || managerStatus === 'shortlist';
      else if (category === 'Maybe') inCategory = status === 'maybe' || managerStatus === 'maybe';
      else if (category === 'Assigned') inCategory = isAssigned && managerStatus === 'pending';
      else if (category === 'Approved') inCategory = status === 'approved' || managerStatus === 'approved';
      else if (category === 'Rejected') inCategory = status === 'rejected' || managerStatus === 'rejected';
      else inCategory = !isAssigned && status !== 'shortlist' && status !== 'maybe' && status !== 'approved' && status !== 'rejected' && managerStatus !== 'shortlist' && managerStatus !== 'maybe' && managerStatus !== 'approved' && managerStatus !== 'rejected';

      if (!inCategory) return false;

      if (!query) return true;
      return r.fullName?.toLowerCase().includes(query) || 
             r.college?.toLowerCase().includes(query) || 
             r.department?.toLowerCase().includes(query) ||
             r.phone?.toLowerCase().includes(query) ||
             r.contact?.toLowerCase().includes(query) ||
             r.email?.toLowerCase().includes(query) ||
             (r.role && r.role.toLowerCase().includes(query)) ||
             (r.designation && r.designation.toLowerCase().includes(query)) ||
             (r.EmployeeId && r.EmployeeId.toLowerCase().includes(query));
    }).length;
  }

  hasSearchMatch(category: string): boolean {
    if (!this.searchQuery()) return false;
    return this.getFilteredCountForCategory(category) > 0;
  }

  openRejectModal(req: any) {
    this.rejectCandidate.set(req);
    const roleName = req.designation || req.role || 'Applicant';
    this.rejectForm.emailSubject = `Update regarding your application for ${roleName} at Softrate`;
    this.rejectForm.reason = '';
    this.generateRejectEmailBody();
    this.showRejectModal.set(true);
  }

  closeRejectModal() {
    this.showRejectModal.set(false);
    this.rejectCandidate.set(null);
  }

  generateRejectEmailBody() {
    const candidate = this.rejectCandidate();
    if (!candidate) return;

    const rawTemplate = this.companySettings()?.communication?.applicationRejectionTemplate || `
<p>Dear {formattedName},</p>
<p>Thank you for taking the time to apply for the <b>{role}</b> position with us and for your interest in our company.</p>
<p>After careful consideration and review of your application, we regret to inform you that we will not be moving forward with your candidacy for this role at this time.</p>
{reason}
<p>We truly appreciate the effort you put into your application and wish you the very best in your job search and future professional endeavors.</p>
<p>Best regards,<br><b>HR Team</b><br>Softrate Technologies</p>
    `.trim();

    const roleName = candidate.designation || candidate.role || 'Applicant';
    const reasonText = this.rejectForm.reason ? `<p>${this.rejectForm.reason}</p>` : '';

    this.rejectForm.emailBody = rawTemplate
      .replace(/{formattedName}/g, candidate.fullName || 'Candidate')
      .replace(/{role}/g, roleName)
      .replace(/{reason}/g, reasonText)
      .replace(/{signature}/g, '')
      .replace(/{logo}/g, '');
  }

  submitRejectModal() {
    const candidate = this.rejectCandidate();
    if (!candidate || !candidate._id) return;

    this.isSendingReject.set(true);
    const payload = {
      reason: this.rejectForm.reason,
      emailSubject: this.rejectForm.emailSubject,
      emailBody: this.rejectForm.emailBody
    };

    this.apiService.rejectEmployee(candidate._id, payload).subscribe({
      next: (res: any) => {
        this.isSendingReject.set(false);
        this.showRejectModal.set(false);
        this.rejectCandidate.set(null);
        this.alertService.show(res?.message || 'Application rejected successfully');
        this.fetchRequests();
      },
      error: (err: any) => {
        this.isSendingReject.set(false);
        console.error('Failed to reject request', err);
        this.alertService.show('Failed to reject application: ' + (err.error?.message || err.message));
      }
    });
  }

  async rejectRequest(id: string) {
    const req = this.allRequests().find((r: any) => r._id === id);
    if (req) {
      this.openRejectModal(req);
    }
  }
}
