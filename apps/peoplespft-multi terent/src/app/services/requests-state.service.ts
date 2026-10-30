import { Injectable } from '@angular/core';

export interface RequestsStateModel {
  allRequests: any[];
  managers: any[];
  roles: string[];
  companySettings: any;
  currentCategory: any;
  searchQuery: string;
  sortFilter: string;
  isFilterPanelOpen: boolean;
  roleFilter: string | string[];
  experienceFilter: string | string[];
  yearFilter: string | string[];
  degreeFilter: string | string[];
  assessmentFilter: string | string[];
  managerFilter: string | string[];
  noticePeriodFilter: string | string[];
  currentCtcFilter: string | string[];
  expectedCtcFilter: string | string[];
  fromDate: string;
  toDate: string;
  hasLoaded: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class EmployeeRequestsStateService {
  allRequests: any[] = [];
  managers: any[] = [];
  roles: string[] = [];
  companySettings: any = null;
  currentCategory: 'Pending' | 'Shortlist' | 'Maybe' | 'Assigned' | 'Approved' | 'Rejected' = 'Pending';
  searchQuery: string = '';
  sortFilter: string = 'recent';
  isFilterPanelOpen: boolean = false;
  roleFilter: string | string[] = [];
  experienceFilter: string | string[] = [];
  yearFilter: string | string[] = [];
  degreeFilter: string | string[] = [];
  assessmentFilter: string | string[] = [];
  managerFilter: string | string[] = [];
  noticePeriodFilter: string | string[] = [];
  currentCtcFilter: string | string[] = [];
  expectedCtcFilter: string | string[] = [];
  fromDate: string = '';
  toDate: string = '';
  hasLoaded: boolean = false;

  saveState(state: Partial<RequestsStateModel>) {
    Object.assign(this, state);
  }

  updateCandidate(candidateId: string, updates: Partial<any>) {
    this.allRequests = this.allRequests.map(r => r._id === candidateId ? { ...r, ...updates } : r);
  }
}

@Injectable({
  providedIn: 'root'
})
export class InternRequestsStateService {
  allRequests: any[] = [];
  managers: any[] = [];
  roles: string[] = [];
  companySettings: any = null;
  currentCategory: 'Internship' | 'Job' | 'Walkin' | 'Shortlist' | 'Maybe' | 'Assigned' | 'Approved' | 'Rejected' = 'Internship';
  searchQuery: string = '';
  sortFilter: string = 'recent';
  isFilterPanelOpen: boolean = false;
  roleFilter: string | string[] = [];
  experienceFilter: string | string[] = [];
  yearFilter: string | string[] = [];
  degreeFilter: string | string[] = [];
  assessmentFilter: string | string[] = [];
  managerFilter: string | string[] = [];
  noticePeriodFilter: string | string[] = [];
  currentCtcFilter: string | string[] = [];
  expectedCtcFilter: string | string[] = [];
  fromDate: string = '';
  toDate: string = '';
  hasLoaded: boolean = false;

  saveState(state: Partial<RequestsStateModel>) {
    Object.assign(this, state);
  }

  updateCandidate(candidateId: string, updates: Partial<any>) {
    this.allRequests = this.allRequests.map(r => r._id === candidateId ? { ...r, ...updates } : r);
  }
}
