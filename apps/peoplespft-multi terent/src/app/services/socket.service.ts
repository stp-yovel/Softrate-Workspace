import { Injectable, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;
  private apiService = inject(ApiService);
  private failedAttempts = 0;

  constructor() {
    const socketUrl = this.apiService.getBaseUrl();
    this.socket = io(socketUrl, {
      reconnection: true,
      reconnectionAttempts: 2, // Stop retrying after 2 attempts
      reconnectionDelay: 2000,
      timeout: 5000,
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      this.failedAttempts = 0;
    });

    this.socket.on('connect_error', (error) => {
      this.failedAttempts++;
      if (this.failedAttempts >= 2) {
        this.socket.disconnect(); // Permanently disconnect to prevent repeated network spam
      }
    });

    this.socket.io.on('reconnect_failed', () => {
      this.socket.disconnect();
    });
  }

  on(eventName: string): Observable<any> {
    return new Observable((subscriber) => {
      this.socket.on(eventName, (data) => {
        subscriber.next(data);
      });
    });
  }

  emit(eventName: string, data: any) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(eventName, data);
    }
  }

  joinRoom(roomId: string) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('join-room', roomId);
    }
  }
}

