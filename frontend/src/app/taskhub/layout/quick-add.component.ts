import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../core/api.service';
import { DataService } from '../core/data.service';
import { UiService } from '../core/ui.service';
import { ToastService } from '../core/toast.service';
import { AuthService } from '../core/auth.service';
import { CreatableWork, Person, Phase, Priority } from '../core/models';
import { PRIORITIES, SIZES, TaskSize, dueLabel, todayIso } from '../core/format';
import { parseQuickTask } from '../core/quick-parse';
import { takeBulletLine } from '../core/steps-text';

import { AutofocusDirective, AvatarComponent, IconComponent } from '../shared/ui';

interface DraftStep { title: string; assignee_id: number | null; due_date: string | null; notify: boolean }

// Nova tarefa em uma tela só: pensada para registrar uma reunião ou alinhamento rápido.
// Dentro de um projeto a tarefa nasce nele; fora, um seletor único escolhe o projeto (ou nenhum: individual).
@Component({
  selector: 'app-quick-add',
  standalone: true,
  imports: [AutofocusDirective, FormsModule, IconComponent, AvatarComponent],
  template: `
    <div class="modal-scrim" (click)="close()">
      <div class="modal wide qa-modal" (click)="$event.stopPropagation()" (keydown.control.enter)="save($event)" (keydown.meta.enter)="save($event)"
           role="dialog" aria-labelledby="qa-head-title">
        <div class="qa-head">
          <span class="qa-head-icon"><app-icon name="plus" [size]="16" /></span>
          <span id="qa-head-title" class="grow">Nova tarefa</span>
          @if (locked(); as w) {
            <span class="pill" [title]="'A tarefa será criada em ' + contextLabel(w)"><span class="dot" [style.background]="w.color"></span>{{ contextLabel(w) }}</span>
          }
          <button type="button" class="btn btn-ghost btn-icon" aria-label="Fechar" (click)="close()"><app-icon name="x" /></button>
        </div>
        <div class="qa-top">
          <div class="field">
            <label for="qa-t">Título</label>
            <input id="qa-t" class="input qa-title" appAutofocus [(ngModel)]="text" (ngModelChange)="text$.set($event)"
                   (keydown.enter)="titleEnter($event, desc)" placeholder="Reunião com financeiro sobre contrato @ana !alta sexta ~1h" />
          </div>
          <div class="qa-chips">
            @for (c of parsed().chips; track c) { <span class="pill">{{ c }}</span> }
            @if (!parsed().chips.length) { <span class="muted small">Dica: &#64;pessoa (alinhado com), #projeto, !prioridade, sexta, 15/10, ~2h · Ctrl+Enter cria</span> }
          </div>
        </div>
        <div class="qa-fields">
          @if (!locked()) {
            <div class="field span2">
              <label for="qa-w">Projeto</label>
              <select id="qa-w" class="select" [ngModel]="workId()" (ngModelChange)="pickWork($event)">
                <option [ngValue]="null">Sem projeto (individual)</option>
                @for (g of groups(); track g.label) {
                  <optgroup [label]="g.label">
                    @for (w of g.works; track w.id) { <option [ngValue]="w.id">{{ w.name }}</option> }
                  </optgroup>
                }
              </select>
            </div>
          }
          <div class="field">
            <span class="label">Alinhado com</span>
            <div class="row" style="flex-wrap: wrap; gap: 6px">
              @for (p of chosenContacts(); track p.id) {
                <span class="pill"><app-avatar [person]="p" />{{ p.name }}<button type="button" (click)="toggleContact(p.id)" [attr.aria-label]="'Remover ' + p.name"><app-icon name="x" [size]="12" /></button></span>
              }
            </div>
            <select #ct class="select" (change)="toggleContact(+ct.value); ct.value = ''" aria-label="Adicionar pessoa com quem foi alinhado">
              <option value="">Adicionar pessoa…</option>
              @for (p of contactCandidates(); track p.id) { <option [value]="p.id">{{ p.name }}{{ p.sector_name ? ' · ' + p.sector_name : '' }}</option> }
            </select>
            <span class="hint">Quem participou ou pediu. Só registro: ninguém é avisado.</span>
          </div>
          <div class="field">
            <label for="qa-al">Data</label>
            <input id="qa-al" type="date" class="input" [ngModel]="alignedOn()" (ngModelChange)="alignedOn.set($event || null)" />
          </div>
          <div class="field">
            <label for="qa-d">Prazo</label>
            <input id="qa-d" type="date" class="input" [ngModel]="due()" (ngModelChange)="due.set($event || null)" />
          </div>
          <div class="field">
            <label for="qa-r">Prioridade</label>
            <select id="qa-r" class="select" [ngModel]="priority()" (ngModelChange)="priority.set($event)">
              @for (p of priorities; track p.value) { <option [ngValue]="p.value">{{ p.label }}</option> }
            </select>
          </div>
          @if (workId() && phases().length) {
            <div class="field">
              <label for="qa-f">Fase</label>
              <select id="qa-f" class="select" [ngModel]="phaseId()" (ngModelChange)="phaseId.set($event)">
                @for (f of phases(); track f.id) { <option [ngValue]="f.id">{{ f.name }}{{ f.id === workPhase() ? ' · fase atual' : '' }}</option> }
              </select>
            </div>
          }
          <div class="field" [class.span2]="!(workId() && phases().length)">
            <span class="label">Tempo</span>
            <div class="seg qa-seg" role="group" aria-label="Tempo">
              @for (z of sizes; track z.v) {
                <button type="button" [class.on]="size === z.v" [attr.aria-pressed]="size === z.v" (click)="size = size === z.v ? null : z.v" [title]="z.hint">{{ z.t }}</button>
              }
            </div>
          </div>
          <div class="field span2">
            <div class="row" style="justify-content: space-between; align-items: center">
              <label for="qa-desc">Descrição</label>
              <label class="check-label" title="Com o interruptor ligado, cada Enter vira etapa. Desligado, só a linha que começa com -.">
                <input type="checkbox" class="switch" role="switch" [(ngModel)]="linesToStepsOn" /> Linhas viram etapas
              </label>
            </div>
            <textarea #desc id="qa-desc" class="textarea" style="min-height: 110px" [(ngModel)]="description"
                      (keydown.enter)="descEnter($event, desc)"
                      [placeholder]="linesToStepsOn ? 'Cada Enter cria uma etapa. Ou comece a linha com -.' : 'Anotações, contexto, links…'"></textarea>
          </div>
          <div class="field span2">
            <span class="label">Etapas</span>
            <div class="qa-steps">
            @for (s of steps(); track $index; let i = $index; let last = $last) {
              <div class="subtask step-row">
                <span class="step-num">{{ i + 1 }}</span>
                <textarea class="step-title" rows="1" [ngModel]="s.title" (ngModelChange)="editStep(i, { title: $event })" (input)="sizeStep($event)" (keydown.enter)="stepEnter($event)" [attr.aria-label]="'Etapa ' + (i + 1)"></textarea>
                <span class="step-order">
                  <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="i === 0" (click)="moveStep(i, -1)" aria-label="Subir etapa" title="Subir"><app-icon name="chevron" [size]="12" class="rot-up" /></button>
                  <button type="button" class="btn btn-ghost btn-sm btn-icon" [disabled]="last" (click)="moveStep(i, 1)" aria-label="Descer etapa" title="Descer"><app-icon name="chevron" [size]="12" class="rot-down" /></button>
                </span>
                @if (workId()) {
                  <select class="inline step-who" [ngModel]="s.assignee_id" (ngModelChange)="editStep(i, { assignee_id: $event })" aria-label="Responsável pela etapa">
                    <option [ngValue]="null">Responsável</option>
                    @for (p of people(); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }
                  </select>
                  @if (s.assignee_id && s.assignee_id !== me()) {
                    <label class="check-label step-notify" title="Avisar a pessoa quando for a vez dela"><input type="checkbox" class="switch" role="switch" [ngModel]="s.notify" (ngModelChange)="editStep(i, { notify: $event })" /> avisar</label>
                  }
                }
                <input type="date" class="inline step-due" [ngModel]="s.due_date" (ngModelChange)="editStep(i, { due_date: $event || null })" aria-label="Prazo da etapa" />
                <button type="button" class="btn btn-ghost btn-sm btn-icon x" (click)="removeStep(i)" [attr.aria-label]="'Remover etapa ' + (i + 1)"><app-icon name="x" [size]="13" /></button>
              </div>
            }
            <div class="subtask step-row">
              <span class="step-num step-num--new"><app-icon name="plus" [size]="12" /></span>
              <input class="inline grow" placeholder="Adicionar etapa e Enter" [(ngModel)]="newStep" (keydown.enter)="addStep($event)" aria-label="Nova etapa" />
            </div>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <label class="check-label left"><input type="checkbox" class="switch" role="switch" [(ngModel)]="planToday" /> Planejar para hoje</label>
          <button class="btn btn-ghost" (click)="close()">Cancelar</button>
          <button class="btn btn-primary" [disabled]="!parsed().title || saving()" (click)="save()" title="Ctrl+Enter">{{ saving() ? 'Criando…' : 'Criar tarefa' }}</button>
        </div>
      </div>
    </div>
  `,
})
export class QuickAddComponent implements OnInit {
  ui = inject(UiService);
  data = inject(DataService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  priorities = PRIORITIES;
  sizes = SIZES;
  size: TaskSize | null = null;
  text = '';
  text$ = signal('');
  description = '';
  newStep = '';
  planToday = false;
  linesToStepsOn = false;
  me = computed(() => this.auth.user()?.id ?? null);

  private defaults = this.ui.quickAdd() || {};
  // Fase escolhida pela coluna do Kanban; vale só na primeira carga.
  private askedPhase = this.defaults.phase_id ?? null;

  works = signal<CreatableWork[]>([]);
  workId = signal<number | null>(null);
  phases = signal<Phase[]>([]);
  phaseId = signal<number | null>(null);
  people = signal<Person[]>([]);
  contactIds = signal<number[]>([]);
  steps = signal<DraftStep[]>([]);
  alignedOn = signal<string | null>(todayIso());
  due = signal<string | null>(null);
  priority = signal<Priority>('media');
  saving = signal(false);

  // Aberto de dentro de um projeto: a tarefa nasce nele e o seletor some.
  locked = computed(() => {
    const id = this.defaults.section_id;
    return id ? this.works().find(w => w.id === id) || null : null;
  });
  private current = computed(() => this.works().find(w => w.id === this.workId()) || null);
  workPhase = computed(() => this.current()?.phase_id ?? this.phases()[0]?.id ?? null);
  groups = computed(() => {
    const map = new Map<string, CreatableWork[]>();
    for (const w of this.works()) {
      const label = w.team_name ? `Equipe ${w.team_name}` : w.project_name;
      map.set(label, [...(map.get(label) || []), w]);
    }
    return [...map.entries()].map(([label, works]) => ({ label, works }));
  });
  chosenContacts = computed(() => this.contactIds().map(id => this.data.people().find(p => p.id === id)!).filter(Boolean));
  contactCandidates = computed(() => this.data.people().filter(p => !this.contactIds().includes(p.id) && p.id !== this.me()));

  // O texto do título preenche campos; o que a pessoa escolher nos campos prevalece.
  parsed = computed(() => parseQuickTask(this.text$(), this.data.people(), this.data.projects()));

  contextLabel(w: CreatableWork) { return `${w.team_name || w.project_name} › ${w.name}`; }

  ngOnInit() {
    this.planToday = !!this.defaults.plan_today;
    this.api.creatableWorks().subscribe({
      next: list => {
        this.works.set(list);
        const sid = this.defaults.section_id ?? null;
        const pid = this.defaults.project_id ?? null;
        const start = sid && list.some(w => w.id === sid) ? sid
          : pid ? (list.filter(w => w.project_id === pid).length === 1 ? list.find(w => w.project_id === pid)!.id : null) : null;
        this.pickWork(start);
      },
      error: () => this.pickWork(null),
    });
  }

  pickWork(id: number | null) {
    this.workId.set(id);
    this.phases.set([]); this.phaseId.set(null);
    this.steps.update(l => l.map(s => (id ? s : { ...s, assignee_id: null })));
    const w = this.current();
    if (!w) { this.people.set([]); return; }
    this.api.projectPeople(w.project_id).subscribe(p => this.people.set(p));
    this.api.works(w.project_id).subscribe(r => {
      this.phases.set(r.phases || []);
      const asked = this.askedPhase; this.askedPhase = null;
      this.phaseId.set(asked && this.phases().some(f => f.id === asked) ? asked : this.workPhase());
    });
  }

  toggleContact(id: number) {
    if (id) this.contactIds.update(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]));
  }

  titleEnter(e: Event, desc: HTMLTextAreaElement) {
    const k = e as KeyboardEvent;
    if (k.ctrlKey || k.metaKey) return;
    e.preventDefault();
    desc.focus();
  }

  descEnter(e: Event, el: HTMLTextAreaElement) {
    const k = e as KeyboardEvent;
    if (k.ctrlKey || k.metaKey || k.shiftKey) return;
    const r = takeBulletLine(this.description, el.selectionStart, this.linesToStepsOn);
    if (!r) return;
    e.preventDefault();
    this.pushSteps([r.step]);
    this.description = r.text;
    el.value = r.text;
    el.setSelectionRange(r.caret, r.caret);
  }

  private pushSteps(titles: string[]) {
    this.steps.update(l => [...l, ...titles.map(title => ({ title, assignee_id: null, due_date: null, notify: true }))].slice(0, 100));
    setTimeout(() => document.querySelectorAll<HTMLTextAreaElement>('.qa-steps .step-title').forEach(t => this.sizeStep(t)));
  }
  addStep(e: Event) {
    e.preventDefault();
    const t = this.newStep.trim(); if (!t) return;
    this.pushSteps([t.slice(0, 500)]);
    this.newStep = '';
  }
  editStep(i: number, patch: Partial<DraftStep>) {
    this.steps.update(l => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  removeStep(i: number) { this.steps.update(l => l.filter((_, j) => j !== i)); }
  moveStep(i: number, dir: -1 | 1) {
    this.steps.update(l => {
      const j = i + dir; if (j < 0 || j >= l.length) return l;
      const copy = [...l]; [copy[i], copy[j]] = [copy[j], copy[i]]; return copy;
    });
  }

  sizeStep(el: Event | HTMLTextAreaElement) {
    const t = el instanceof HTMLTextAreaElement ? el : (el.target as HTMLTextAreaElement);
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
  }

  stepEnter(e: Event) {
    const k = e as KeyboardEvent;
    if (k.shiftKey) return;
    e.preventDefault();
    (e.target as HTMLTextAreaElement).blur();
  }

  close() { this.ui.quickAdd.set(null); }

  save(e?: Event) {
    e?.preventDefault();
    const p = this.parsed();
    if (!p.title || this.saving()) return;
    let w = this.current();
    if (!w && p.project) {
      const fromTag = this.works().filter(x => x.project_id === p.project!.id);
      if (fromTag.length === 1) w = fromTag[0];
    }
    const contacts = [...new Set([...this.contactIds(), ...p.contacts.map(c => c.id)])].filter(id => id !== this.me());
    const steps = this.steps().filter(s => s.title.trim()).map(s => ({
      title: s.title.trim(), assignee_id: w ? s.assignee_id : null, due_date: s.due_date, notify: s.notify,
    }));
    const body: Record<string, unknown> = {
      title: p.title,
      description: this.description.trim(),
      project_id: w?.project_id ?? null,
      section_id: w?.id ?? undefined,
      status_id: this.defaults.status_id ?? undefined,
      phase_id: w ? this.phaseId() ?? undefined : undefined,
      due_date: this.due() ?? p.due_date,
      priority: p.priority && this.priority() === 'media' ? p.priority : this.priority(),
      estimate_min: this.size ? undefined : p.estimate_min,
      size: this.size || null,
      contacts,
      aligned_on: this.alignedOn(),
      subtasks: steps,
      plan_today: this.planToday,
      plan_period: this.defaults.plan_period,
      space: w ? w.space : 'pessoal',
    };
    this.saving.set(true);
    this.api.createTask(body).subscribe({
      next: t => {
        this.saving.set(false);
        const extra = t.due_date ? ` · prazo ${dueLabel(t.due_date).toLowerCase()}` : '';
        this.toast.show(`Tarefa criada${extra}.`);
        this.ui.taskChanged$.next(t.id);
        this.data.reloadProjects();
        this.close();
      },
      error: err => { this.saving.set(false); this.toast.error(errorMessage(err)); },
    });
  }
}
