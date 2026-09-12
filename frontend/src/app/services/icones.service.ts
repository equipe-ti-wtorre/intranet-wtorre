import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface IconeCustomUploadResponse {
  icone: string;
  url: string;
}

@Injectable({ providedIn: 'root' })
export class IconesService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  uploadIconeCustom(file: File): Observable<IconeCustomUploadResponse> {
    const form = new FormData();
    form.append('svg', file);
    return this.http.post<IconeCustomUploadResponse>(this.api('/icones/custom/upload'), form);
  }
}
