import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Alert } from '../../shared/components/alert/alert';
import { AlertService } from '../../shared/services/alert';

@Component({
  selector: 'app-walkin-drives',
  standalone: true,
  imports: [CommonModule, FormsModule, Alert],
  templateUrl: './walkin-drives.component.html',
  styleUrls: ['./walkin-drives.component.css']
})
export class WalkinDrivesComponent implements OnInit {
  drives: any[] = [];
  activeDrives: any[] = [];
  historyDrives: any[] = [];
  isModalOpen = false;

  driveType: 'walkin' | 'seasonal' = 'walkin';
  title = '';
  startDate = '';
  startTime = '';
  endDate = '';
  endTime = '';
  whatsappGroupLink = '';
  selectedFile: File | null = null;
  isSubmitting = false;

  isLoading = true;

  constructor(private apiService: ApiService, private alertService: AlertService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.fetchDrives();
  }

  fetchDrives(): void {
    this.isLoading = true;
    this.apiService.getWalkinDrives().subscribe({
      next: (res) => {
        // Pre-calculate status to avoid change detection lag
        this.drives = res.map((d: any) => ({
          ...d,
          computedStatus: this.getDriveStatus(d)
        }));
        this.activeDrives = this.drives.filter(d => d.computedStatus !== 'Ended');
        this.historyDrives = this.drives.filter(d => d.computedStatus === 'Ended');
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error fetching drives', err);
        this.alertService.show('Error loading walkin drives', 'error');
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  getDriveStatus(drive: any): string {
    if (!drive.startDate || !drive.endDate || !drive.startTime || !drive.endTime) return 'Unknown';
    
    const now = new Date();
    
    const startDateStr = new Date(drive.startDate).toISOString().split('T')[0];
    const startDateTime = new Date(`${startDateStr}T${drive.startTime}:00`);
    
    const endDateStr = new Date(drive.endDate).toISOString().split('T')[0];
    const endDateTime = new Date(`${endDateStr}T${drive.endTime}:00`);

    if (now < startDateTime) {
      return 'Upcoming';
    } else if (now > endDateTime) {
      return 'Ended';
    } else {
      return 'Ongoing';
    }
  }

  openModal(): void {
    this.isModalOpen = true;
    this.resetForm();
  }

  closeModal(): void {
    this.isModalOpen = false;
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      this.selectedFile = file;
    } else {
      this.alertService.show('Please select a valid PDF file', 'error');
      event.target.value = '';
    }
  }

  submitDrive(): void {
    if (!this.startDate || !this.startTime || !this.endDate || !this.endTime) {
      this.alertService.show('Please specify start and end dates and times', 'error');
      return;
    }

    if (this.driveType === 'walkin') {
      if (!this.whatsappGroupLink || !this.selectedFile) {
        this.alertService.show('Please fill WhatsApp link and select JD PDF for walk-in drive', 'error');
        return;
      }
    } else if (this.driveType === 'seasonal') {
      if (!this.title.trim()) {
        this.alertService.show('Please provide a title for the seasonal internship (e.g. Winter Internship 2026)', 'error');
        return;
      }
    }

    this.isSubmitting = true;
    const formData = new FormData();
    formData.append('driveType', this.driveType);
    formData.append('title', this.title.trim());
    formData.append('startDate', this.startDate);
    formData.append('startTime', this.startTime);
    formData.append('endDate', this.endDate);
    formData.append('endTime', this.endTime);
    if (this.whatsappGroupLink) {
      formData.append('whatsappGroupLink', this.whatsappGroupLink);
    }
    if (this.selectedFile) {
      formData.append('jdPdf', this.selectedFile);
    }

    this.apiService.createWalkinDrive(formData).subscribe({
      next: (res) => {
        const driveLabel = this.driveType === 'seasonal' ? 'Seasonal Internship' : 'Walkin Drive';
        this.alertService.show(`${driveLabel} created successfully`, 'success');
        this.isSubmitting = false;
        this.closeModal();
        this.fetchDrives();
      },
      error: (err) => {
        console.error('Error creating drive', err);
        this.alertService.show(err?.error?.message || 'Failed to create drive', 'error');
        this.isSubmitting = false;
      }
    });
  }

  resetForm(): void {
    this.driveType = 'walkin';
    this.title = '';
    this.startDate = '';
    this.startTime = '';
    this.endDate = '';
    this.endTime = '';
    this.whatsappGroupLink = '';
    this.selectedFile = null;
  }

  getFullPdfUrl(url: string): string {
    return `${this.apiService.getBaseUrl()}${url}`;
  }
}
