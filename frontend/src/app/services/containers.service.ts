import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { StorageContainer, StorageContainerPayload } from '../models/storage-container.model';

@Injectable({ providedIn: 'root' })
export class ContainersService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  private mapContainer(c: StorageContainer): StorageContainer {
    return {
      ...c,
      qtdVideos: c.qtdVideos ?? c.qtd_videos ?? 0,
    };
  }

  listar(incluirConta = false): Observable<StorageContainer[]> {
    let params = new HttpParams();
    if (incluirConta) params = params.set('conta', '1');
    return this.http
      .get<StorageContainer[]>(this.api('/containers'), { params })
      .pipe(map((list) => list.map((c) => this.mapContainer(c))));
  }

  criar(payload: StorageContainerPayload): Observable<StorageContainer> {
    return this.http
      .post<StorageContainer>(this.api('/containers'), payload)
      .pipe(map((c) => this.mapContainer(c)));
  }

  atualizar(id: number, payload: Partial<StorageContainerPayload>): Observable<StorageContainer> {
    return this.http
      .put<StorageContainer>(this.api(`/containers/${id}`), payload)
      .pipe(map((c) => this.mapContainer(c)));
  }

  remover(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/containers/${id}`));
  }
}
