import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../core/api.service';
import { DataService } from '../core/data.service';
import { UiService } from '../core/ui.service';
import { ToastService } from '../core/toast.service';
import { AuthService } from '../core/auth.service';
import { CreatableWork, Person, Phase, Priority } from '../core/models';
import { PRIORITIES, SIZES, TASK_FILE_MAX, TASK_FILE_MAX_MB, TaskSize, dueLabel, fileSize, isExternalFileDrag, taskFileError, todayIso } from '../core/format';
import { parseQuickTask } from '../core/quick-parse';
import { takeBulletLine } from '../core/steps-text';

import { AutofocusDirective, AvatarComponent, IconComponent } from '../shared/ui';
import { PersonPickerComponent, stepAssigneeGroups } from '../shared/person-picker.component';

interface DraftStep { title: string; assignee_id: number | null; due_date: string | null; notify: boolean }

// Nova tarefa em uma tela só: pensada para registrar uma reunião ou alinhamento rápido.
// Dentro de um projeto a tarefa nasce nele; fora, um seletor único escolhe o projeto (ou nenhum: individual).
@Component({
  selector: 'app-quick-add',
  standalone: true,
  imports: [AutofocusDirective, FormsModule, IconComponent, AvatarComponent, PersonPickerComponent],
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
            <app-person-picker [people]="contactCandidates()" ariaLabel="Adicionar pessoa com quem foi alinhado" (picked)="toggleContact($event ?? 0)" />
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
            <div class="row" style="justify-content: space-between; align-items: center">
              <span class="label">Etapas</span>
              <label class="check-label" title="Ligado: a próxima etapa só conclui depois da anterior. Desligado: as etapas andam ao mesmo tempo.">
                <input type="checkbox" class="switch" role="switch" [(ngModel)]="stepsOrdered" /> Seguir prioridade
              </label>
            </div>
            <div class="qa-steps">
            @for (s of steps(); track $index; let i = $index) {
              <div class="subtask step-row" [class.step-dragging]="stepDragFrom() === i" [class.step-over]="stepOver() === i"
                   (dragover)="stepHover($event, i)" (drop)="stepDrop($event, i)">
                <button type="button" class="step-grip" draggable="true" (dragstart)="stepDrag($event, i)" (dragend)="stepDragEnd()" aria-label="Arrastar etapa" title="Arrastar para reordenar"><span></span><span></span><span></span><span></span><span></span><span></span></button>
                <span class="step-num">{{ i + 1 }}</span>
                <textarea class="step-title" rows="1" [ngModel]="s.title" (ngModelChange)="editStep(i, { title: $event })" (input)="sizeStep($event)" (keydown.enter)="stepEnter($event)" [attr.aria-label]="'Etapa ' + (i + 1)"></textarea>
                  <app-person-picker class="step-who" mode="single" variant="inline" [groups]="stepGroups()" [value]="s.assignee_id ?? null"
                                     [specials]="[{ value: null, label: 'Sem responsável' }]" placeholder="Responsável"
                                     ariaLabel="Responsável da etapa" (picked)="editStep(i, { assignee_id: $event })" />
                  @if (s.assignee_id && s.assignee_id !== me()) {
                    <label class="check-label step-notify" [title]="stepsOrdered ? 'Avisar a pessoa quando for a vez dela' : 'Avisar a pessoa sobre esta etapa'"><input type="checkbox" class="switch" role="switch" [ngModel]="s.notify" (ngModelChange)="editStep(i, { notify: $event })" /> avisar</label>
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
            <div class="muted small">{{ stepsOrdered ? 'As etapas andam em ordem: a próxima só conclui depois da anterior.' : 'As etapas andam ao mesmo tempo: cada uma pode ser concluída sem esperar a anterior.' }}</div>
          </div>
          <div class="field span2">
            <span class="label">Anexos</span>
            <div class="qa-files" [class.file-over]="fileOver()"
                 (dragenter)="fileEnter($event)" (dragover)="fileHover($event)" (dragleave)="fileLeave($event)" (drop)="fileDrop($event)">
              @for (f of pendingFiles(); track $index) {
                <span class="qa-file-chip">
                  <app-icon name="paperclip" [size]="13" />
                  <span class="qa-file-name" [title]="f.name">{{ f.name }}</span>
                  <span class="muted small">{{ fileSize(f.size) }}</span>
                  <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="removePending($index)" [attr.aria-label]="'Remover ' + f.name"><app-icon name="x" [size]="12" /></button>
                </span>
              }
              @if (pendingFiles().length < fileMax) {
                <label class="btn btn-ghost btn-sm qa-file-add">
                  <app-icon name="paperclip" [size]="14" />
                  Anexar arquivos
                  <input type="file" multiple hidden (change)="pickFiles($event)" />
                </label>
              }
            </div>
            <span class="hint">Qualquer tipo de arquivo. Até {{ fileMax }} arquivos, {{ fileMaxMb }} MB cada. Arraste para a área acima.</span>
          </div>
        </div>
        <div class="modal-foot">
          <label class="check-label left"><input type="checkbox" class="switch" role="switch" [(ngModel)]="planToday" /> Planejar para hoje</label>
          <button class="btn btn-ghost" (click)="close()">Cancelar</button>
          <button class="btn btn-primary" [disabled]="!parsed().title || saving()" (click)="save()" title="Ctrl+Enter">{{ saving() ? 'Salvando…' : 'Salvar' }}</button>
        </div>
      </div>
    </div>
  `,
})
export class QuickAddComponent implements OnInit, OnDestroy {
  ui = inject(UiService);
  data = inject(DataService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  priorities = PRIORITIES;
  sizes = SIZES;
  fileOver = signal(false);
  fileMax = TASK_FILE_MAX;
  fileMaxMb = TASK_FILE_MAX_MB;
  fileSize = fileSize;
  size: TaskSize | null = null;
  text = '';
  text$ = signal('');
  description = '';
  newStep = '';
  planToday = false;
  linesToStepsOn = false;
  stepsOrdered = true;
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
  pendingFiles = signal<File[]>([]);
  private created = false;

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
  stepGroups = computed(() => {
    const u = this.auth.user();
    const me = u ? { id: u.id, name: u.name, username: u.username, initials: u.initials, color: u.color, department: u.department } : null;
    return stepAssigneeGroups(this.people(), this.me(), me);
  });
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
    const w = this.current();
    // Sem projeto, as etapas podem ir para qualquer pessoa da empresa.
    if (!w) { this.api.directory().subscribe(p => this.people.set(p)); return; }
    this.api.projectPeople(w.project_id, w.id).subscribe(p => this.people.set(p));
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
  stepDragFrom = signal<number | null>(null);
  stepOver = signal<number | null>(null);

  stepDrag(ev: DragEvent, i: number) {
    ev.stopPropagation();
    ev.dataTransfer?.setData('application/x-taskhub-step', String(i));
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
    this.stepDragFrom.set(i);
  }
  stepDragEnd() { this.stepDragFrom.set(null); this.stepOver.set(null); }
  stepHover(ev: DragEvent, i: number) {
    const types = ev.dataTransfer?.types;
    if (!types || !Array.from(types).includes('application/x-taskhub-step')) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.stepOver.set(i);
  }
  stepDrop(ev: DragEvent, to: number) {
    const types = ev.dataTransfer?.types;
    if (!types || !Array.from(types).includes('application/x-taskhub-step')) return;
    ev.preventDefault();
    ev.stopPropagation();
    const from = Number(ev.dataTransfer?.getData('application/x-taskhub-step'));
    this.stepDragEnd();
    if (!Number.isInteger(from) || from === to) return;
    this.steps.update(l => {
      const next = [...l];
      const [item] = next.splice(from, 1);
      if (!item) return l;
      next.splice(to, 0, item);
      return next;
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

  ngOnDestroy() {
    if (!this.created) this.ui.clearTaskDraft();
  }

  close() {
    this.ui.quickAdd.set(null);
  }

  pickFiles(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const picked = [...(input.files || [])];
    input.value = '';
    this.takeFiles(picked);
  }

  fileEnter(ev: DragEvent) {
    if (!isExternalFileDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.fileOver.set(true);
  }
  fileHover(ev: DragEvent) {
    if (!isExternalFileDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
  }
  fileLeave(ev: DragEvent) {
    if (!isExternalFileDrag(ev)) return;
    const next = ev.relatedTarget as Node | null;
    if (next && (ev.currentTarget as Node).contains(next)) return;
    this.fileOver.set(false);
  }
  fileDrop(ev: DragEvent) {
    if (!isExternalFileDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.fileOver.set(false);
    this.takeFiles([...(ev.dataTransfer?.files || [])]);
  }

  private takeFiles(picked: File[]) {
    if (!picked.length) return;
    const next = [...this.pendingFiles()];
    for (const f of picked) {
      const err = taskFileError(f, next.length);
      if (err) { this.toast.error(err); continue; }
      next.push(f);
    }
    this.pendingFiles.set(next);
  }
  removePending(i: number) { this.pendingFiles.update(l => l.filter((_, j) => j !== i)); }

  private finishCreate(id: number, extra: string) {
    this.created = true;
    this.ui.clearTaskDraft();
    this.saving.set(false);
    this.toast.show(`Tarefa criada${extra}.`);
    this.ui.taskChanged$.next(id);
    this.data.reloadProjects();
    this.close();
  }

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
      steps_ordered: this.stepsOrdered,
      plan_today: this.planToday,
      plan_period: this.defaults.plan_period,
      space: w ? w.space : 'pessoal',
    };
    this.saving.set(true);
    this.api.createTask(body).subscribe({
      next: t => {
        const extra = t.due_date ? ` · prazo ${dueLabel(t.due_date).toLowerCase()}` : '';
        const files = this.pendingFiles();
        if (!files.length) { this.finishCreate(t.id, extra); return; }
        this.api.uploadTaskFiles(t.id, files).subscribe({
          next: () => this.finishCreate(t.id, extra),
          error: err => {
            this.created = true;
            this.ui.clearTaskDraft();
            this.saving.set(false);
            this.toast.error(errorMessage(err, 'A tarefa foi criada, mas os anexos não foram enviados.'));
            this.ui.taskChanged$.next(t.id);
            this.data.reloadProjects();
            this.close();
          },
        });
      },
      error: err => { this.saving.set(false); this.toast.error(errorMessage(err)); },
    });
  }
}
