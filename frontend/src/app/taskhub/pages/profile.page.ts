import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { DataService } from '../core/data.service';
import { fileToAvatarJpeg } from '../core/avatar';
import { User } from '../core/models';
import { ToastService } from '../core/toast.service';
import { UiService } from '../core/ui.service';
import { AvatarComponent } from '../shared/ui';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, RouterLink, AvatarComponent],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Meu perfil</h1><div class="sub">{{ auth.user()?.username }} · {{ auth.user()?.email }}</div></div></div>

      <div class="settings-section">
        <div><h2>Foto</h2><p class="desc">Substitui as iniciais no seu avatar.</p></div>
        <div class="row" style="align-items:center;gap:16px">
          <app-avatar [person]="auth.user()" [preview]="true" />
          <div class="stack" style="gap:8px">
            <input #photoFile type="file" accept="image/jpeg,image/png" hidden (change)="onPhoto($event)" />
            <button type="button" class="btn btn-sm" (click)="photoFile.click()" [disabled]="photoBusy()">Escolher foto</button>
            @if (auth.user()?.avatar_url) {
              <button type="button" class="btn btn-sm" (click)="removePhoto()" [disabled]="photoBusy()">Remover foto</button>
            }
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div><h2>Dados</h2><p class="desc">Nome, cargo e ausência. A carga do Meu Dia e do painel usa 7 horas por dia para todo mundo.</p></div>
        <div class="stack">
          <div class="fields">
            <div class="field"><label for="n">Nome</label><input id="n" class="input" [(ngModel)]="name" /></div>
            <div class="field"><label for="j">Cargo</label><input id="j" class="input" [(ngModel)]="job" placeholder="Ex.: Analista de sistemas" /></div>
            <div class="field"><label for="a">Ausente até</label><input id="a" class="input" type="date" [(ngModel)]="away" />
              <span class="hint">Quem for atribuir algo a você verá o aviso.</span></div>
          </div>
          <div><button class="btn btn-primary btn-sm" (click)="save()">Salvar</button></div>
        </div>
      </div>

      <div class="settings-section">
        <div><h2>Aparência</h2><p class="desc">A paleta muda a marca, o menu e os botões. São só estas duas.</p></div>
        <div class="palette-cards">
          <button type="button" class="palette-card" [class.on]="ui.palette() === 'wtorre'" (click)="ui.setPalette('wtorre')">
            <span class="palette-swatch palette-swatch--wtorre"></span>WTorre
          </button>
          <button type="button" class="palette-card" [class.on]="ui.palette() === 'nubank-parque'" (click)="ui.setPalette('nubank-parque')">
            <span class="palette-swatch palette-swatch--nubank"></span>Nubank Parque
          </button>
        </div>
      </div>

      @if (demo) {
        <div class="settings-section">
          <div><h2>Demonstração</h2><p class="desc">Volta os dados de exemplo ao estado inicial.</p></div>
          <div><button class="btn btn-sm" (click)="resetDemo()">Restaurar dados de exemplo</button></div>
        </div>
      }

      <div class="settings-section">
        <div><h2>Segurança</h2><p class="desc">Se usou o TaskHub em um computador compartilhado, encerre as outras sessões.</p></div>
        <div class="row" style="flex-wrap:wrap">
          <a class="btn btn-sm" routerLink="/ti/taskhub/trocar-senha">Trocar senha</a>
          <button class="btn btn-sm" (click)="logoutAll()">Sair de todos os dispositivos</button>
          <button class="btn btn-sm btn-danger" (click)="auth.logout()">Sair</button>
        </div>
      </div>
    </div>
  `,
})
export class ProfilePage {
  auth = inject(AuthService);
  ui = inject(UiService);
  private api = inject(ApiService);
  private data = inject(DataService);
  private toast = inject(ToastService);
  photoBusy = signal(false);
  name = this.auth.user()?.name || '';
  job = this.auth.user()?.job_title || '';
  away: string | null = this.auth.user()?.away_until || null;

  save() {
    this.api.updateMe({ name: this.name, job_title: this.job, away_until: this.away || null }).subscribe({
      next: u => { this.auth.setUser(u); this.toast.show('Perfil salvo.'); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }
  demo = environment.demo;
  resetDemo() {
    try { localStorage.removeItem('taskhub_demo_db_v6'); localStorage.removeItem('taskhub_demo_db_v7'); } catch {}
    this.auth.clear();
    setTimeout(() => location.reload(), 50);
  }
  logoutAll() { this.auth.logoutAll().subscribe({ error: e => this.toast.error(errorMessage(e)) }); }

  private applyAvatar(u: User) {
    this.auth.setUser(u);
    this.data.people.update(list => list.map(p => p.id === u.id ? { ...p, avatar_url: u.avatar_url } : p));
  }

  onPhoto(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.photoBusy.set(true);
    fileToAvatarJpeg(file).then(image => {
      this.api.uploadMyAvatar(image).subscribe({
        next: u => { this.applyAvatar(u); this.photoBusy.set(false); this.toast.show('Foto atualizada.'); },
        error: e => { this.photoBusy.set(false); this.toast.error(errorMessage(e)); },
      });
    }).catch(err => { this.photoBusy.set(false); this.toast.error(err?.message || 'Não foi possível ler a foto.'); });
  }

  removePhoto() {
    this.photoBusy.set(true);
    this.api.deleteMyAvatar().subscribe({
      next: u => { this.applyAvatar(u); this.photoBusy.set(false); this.toast.show('Foto removida.'); },
      error: e => { this.photoBusy.set(false); this.toast.error(errorMessage(e)); },
    });
  }
}
