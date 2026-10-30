import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { Home01Icon, FileDownloadIcon, Calendar01Icon, Chat01Icon, LogoutIcon, CancelCircleIcon, NoteEditIcon, Video01Icon } from '@hugeicons/core-free-icons';
import { ApiService } from '../../../services/api.service';

@Component({
  selector: 'app-employee-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, HugeiconsIconComponent],
  template: `
  <aside class="action-sidebar">
    <!-- MANAGE LIST (Home) -->
    <button routerLink="/employees" [queryParams]="{tab: 'list'}" class="sidebar-action-item" [class.active]="activeTab === 'list'" title="Employee List">
      <div class="action-icon-circle">
        <hugeicons-icon [icon]="Home01Icon" size="20" [strokeWidth]="1.5" color="#475569"></hugeicons-icon>
      </div>
      <span class="action-label">Employee List</span>
    </button>

    <div class="sidebar-divider"></div>

    <!-- APPROVE LEAVE -->
    <button routerLink="/employees" [queryParams]="{tab: 'leaves'}" class="sidebar-action-item" [class.active]="activeTab === 'leaves'" title="Approve Leave">
      <div class="action-icon-circle">
        <hugeicons-icon [icon]="Calendar01Icon" size="20" [strokeWidth]="1.5" color="#10b981"></hugeicons-icon>
      </div>
      <span class="action-label">Approve Leave</span>
    </button>

    <div class="sidebar-divider"></div>

    <!-- PENDING REQUESTS -->
    <button routerLink="/employees" [queryParams]="{tab: 'requests'}" class="sidebar-action-item" [class.active]="activeTab === 'requests'" title="Pending Requests">
      <div class="action-icon-circle">
        <hugeicons-icon [icon]="Chat01Icon" size="20" [strokeWidth]="1.5" color="#f97316"></hugeicons-icon>
      </div>
      <span class="action-label">Pending Requests</span>
    </button>

    <div class="sidebar-divider"></div>

    <!-- SHORTLISTED CANDIDATES -->
    <button routerLink="/shortlisting" class="sidebar-action-item" [class.active]="activeTab === 'shortlist'" title="Shortlisted Candidates">
      <div class="action-icon-circle">
        <hugeicons-icon [icon]="Video01Icon" size="20" [strokeWidth]="1.5" color="#6366f1"></hugeicons-icon>
      </div>
      <span class="action-label">Shortlisted</span>
    </button>

    <div class="sidebar-divider"></div>

    <!-- ATTENDANCE RATIFICATION -->
    <button routerLink="/employees" [queryParams]="{tab: 'corrections'}" class="sidebar-action-item" [class.active]="activeTab === 'corrections'" title="Attendance Ratification">
      <div class="action-icon-circle">
        <hugeicons-icon [icon]="NoteEditIcon" size="20" [strokeWidth]="1.5" color="#3b82f6"></hugeicons-icon>
      </div>
      <span class="action-label">Attendance Ratification</span>
    </button>

    <div class="sidebar-divider"></div>

    <!-- OFFBOARDING -->
    <button routerLink="/employees" [queryParams]="{tab: 'offboarding'}" class="sidebar-action-item" [class.active]="activeTab === 'offboarding'" title="Offboarding">
      <div class="action-icon-circle">
        <hugeicons-icon [icon]="LogoutIcon" size="20" [strokeWidth]="1.5" color="#ef4444"></hugeicons-icon>
      </div>
      <span class="action-label">Offboarding</span>
    </button>

    <div class="sidebar-divider"></div>

    <!-- REJECTED APPLICATIONS -->
    <button routerLink="/employees" [queryParams]="{tab: 'rejected'}" class="sidebar-action-item" [class.active]="activeTab === 'rejected'" title="Rejected Applications">
      <div class="action-icon-circle">
        <hugeicons-icon [icon]="CancelCircleIcon" size="20" [strokeWidth]="1.5" color="#eab308"></hugeicons-icon>
      </div>
      <span class="action-label">Rejected Applications</span>
    </button>

    <div class="sidebar-divider"></div>

    <!-- EXPORT DATA -->
    <button (click)="exportEmployeeData()" class="sidebar-action-item" title="Export Data">
      <div class="action-icon-circle">
        <hugeicons-icon [icon]="FileDownloadIcon" size="20" [strokeWidth]="1.5" color="#8b5cf6"></hugeicons-icon>
      </div>
      <span class="action-label">Export Data</span>
    </button>
  </aside>
  `,
  styleUrls: ['../employee-list/employee-list.css']
})
export class EmployeeSidebar {
  @Input() activeTab: string = '';
  private apiService = inject(ApiService);

  readonly Home01Icon = Home01Icon;
  readonly FileDownloadIcon = FileDownloadIcon;
  readonly Calendar01Icon = Calendar01Icon;
  readonly Chat01Icon = Chat01Icon;
  readonly Video01Icon = Video01Icon;
  readonly LogoutIcon = LogoutIcon;
  readonly CancelCircleIcon = CancelCircleIcon;
  readonly NoteEditIcon = NoteEditIcon;

  exportEmployeeData() {
    const baseUrl = this.apiService.getBaseUrl();
    const userRole = localStorage.getItem('user_role');
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const managerId = userRole === 'manager' ? (userData._id || userData.employeeId) : '';

    let url = `${baseUrl}/api/employee/export/excel/all-employees?status=all`;
    if (managerId) {
      url += `&managerId=${managerId}`;
    }

    this.apiService.downloadFile(url).subscribe({
      next: (blob) => {
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = 'Employee_Data.xlsx';
        link.click();
      },
      error: (err) => console.error('Export failed', err)
    });
  }
}
