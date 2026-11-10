import { Component, ElementRef, OnChanges, OnDestroy, ViewChild, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { DataService } from '../core/data.service';
import { UiService } from '../core/ui.service';
import { ToastService } from '../core/toast.service';
import { AuthService } from '../core/auth.service';
import { Person, Phase, Status, Subtask, TaskDetail, TaskFile, TimelineEntry } from '../core/models';
import { PRIORITIES, SIZES, TASK_FILE_MAX, TASK_FILE_MAX_MB, activityValue, dueLabel, fileSize, isExternalFileDrag, isTaskImage, stamp, taskFileError, termsFor, todayIso } from '../core/format';
import { AvatarComponent, IconComponent, RichTextComponent, AutofocusDirective } from '../shared/ui';
import { PersonGroup, PersonPickerComponent, stepAssigneeGroups } from '../shared/person-picker.component';
import { takeBulletLine } from '../core/steps-text';
import { confirmOpen } from '../core/confirm-open';
import { firstValueFrom } from 'rxjs';

interface StepSnap {
  id: number;
  title: string;
  assignee_id: number | null;
  due_date: string | null;
  notify: boolean;
  done: boolean;
}

interface TaskSnap {
  title: string;
  description: string;
  assignee_id: number | null;
  start_date: string | null;
  due_date: string | null;
  priority: TaskDetail['priority'];
  size: TaskDetail['size'];
  section_id: number | null;
  phase_id: number | null;
  is_private: boolean;
  project_id: number | null;
  subtasks: StepSnap[];
}

const ACTIVITY_TEXT: Record<string, string> = {
  created: 'criou a tarefa',
  status_changed: 'mudou o status para',
  assignee_changed: 'mudou o responsável para',
  due_changed: 'mudou o prazo para',
  priority_changed: 'mudou a prioridade para',
  title_changed: 'renomeou para',
  project_changed: 'moveu para o projeto',
  phase_changed: 'mudou a fase para',
  step_done: 'concluiu a etapa',
};

@Component({
  selector: 'app-task-drawer',
  standalone: true,
  imports: [AutofocusDirective, FormsModule, RouterLink, AvatarComponent, IconComponent, RichTextComponent, PersonPickerComponent],
  template: `
    <div class="task-modal-scrim" (click)="close()">
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="Detalhes da tarefa" (click)="$event.stopPropagation()">
      <div class="drawer-head">
        @if (task(); as t) {
          @if (t.project) {
            @if (seesProject()) {
              <a class="proj-tag" [routerLink]="t.section ? ['/ti/taskhub/projetos', t.project.id, 'trabalhos', t.section.id] : ['/ti/taskhub/projetos', t.project.id]" (click)="close()"><i [style.background]="t.project.color"></i>{{ t.project.name }}@if (t.section) { · {{ t.section.name }} }</a>
            } @else {
              <span class="proj-tag" title="Você participa desta tarefa, não do projeto inteiro"><i [style.background]="t.project.color"></i>{{ t.project.name }}</span>
            }
          } @else { <span class="muted small">Sem projeto</span> }
          @if (t.space === 'pessoal') { <span class="space-chip">Individual · só você vê</span> }
        }
        <span class="grow"></span>
        @if (task()) {
          @if (editable()) {
            <button class="btn btn-sm btn-ghost btn-icon dh-del" (click)="remove()" title="Excluir" aria-label="Excluir tarefa"><app-icon name="trash" [size]="14" /></button>
          }
        }
        <button class="btn btn-sm btn-ghost btn-icon dh-close" (click)="close()" aria-label="Fechar"><app-icon name="x" [size]="14" /></button>
      </div>

      <div class="drawer-body">
        @if (loading()) { <div class="muted">Carregando…</div> }
        @if (error()) { <div class="error-text">{{ error() }}</div> }
        @if (task(); as t) {
          <textarea #titleEl class="drawer-title" rows="1" [readOnly]="!editable()" [ngModel]="draftTitle"
                    (ngModelChange)="onTitle($event)" (keydown.enter)="$event.preventDefault(); titleEl.blur()" aria-label="Título"></textarea>

          @if (projectClosed()) {
            <div class="note-info">Projeto concluído. Reabra o projeto para alterar as tarefas.</div>
          } @else if (taskClosed()) {
            <div class="note-info">Tarefa concluída. Reabra para alterar.</div>
          } @else if (t.access === 'view') {
            <div class="note-info">Você acompanha esta tarefa (só leitura).</div>
          } @else if (t.access === 'work') {
            <div class="note-info">Tarefa criada por {{ t.created_by?.name }}. Você atualiza o status, a estimativa, o bloqueio e as etapas, e pode comentar. O restante quem altera é o gestor.</div>
          } @else if (!seesProject() && t.project) {
            <div class="note-info">
              @if (t.assignee?.id === me || t.created_by?.id === me) { Você está nesta tarefa, não no projeto inteiro: o resto do projeto continua visível só para os participantes. }
              @else { Você participa desta tarefa por uma etapa (destacada abaixo). Pode comentar e concluir a sua parte. }
            </div>
          }
          @if (t.status.category === 'blocked' && t.blocked_reason) {
            <div class="blocked-note"><b>Bloqueada:</b> {{ t.blocked_reason }}</div>
          }
          @if (myTurn(); as s) {
            <div class="step-turn">
              <div class="grow">
                <div class="step-turn-k">Sua vez</div>
                <div class="step-turn-t">{{ s.title }}@if (s.due_date) { <span class="muted small"> · {{ dueText(s.due_date) }}</span> }</div>
              </div>
              @if (!locked()) {
                <button class="btn btn-primary btn-sm" (click)="openFinish(s)"><app-icon name="check" [size]="14" />Concluir minha etapa</button>
              }
            </div>
          }

          <div class="props">
            <div class="k">Status</div>
            <div class="v">
              @if (t.project) {
                <select class="inline" [disabled]="!working()" [ngModel]="statusPick() ?? t.status.id" (ngModelChange)="setStatus($event)" aria-label="Status">
                  @for (s of t.statuses; track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
                </select>
              } @else {
                <label class="check-label"><input type="checkbox" [disabled]="!showConclude()" [checked]="t.status.category === 'done'" (change)="toggleDone()" /> Concluída</label>
              }
            </div>

            <div class="k">Responsável</div>
            @if (t.space === 'pessoal') { <div class="v"><app-avatar [person]="t.assignee" /> Você</div> } @else {
            <div class="v">
              <app-person-picker class="grow" mode="single" variant="inline" [groups]="assigneeGroups()" [value]="t.assignee?.id ?? null"
                                 [specials]="[{ value: null, label: 'Sem responsável' }]" [placeholder]="t.assignee?.name || 'Sem responsável'"
                                 ariaLabel="Responsável" [disabled]="!editable()" (picked)="setAssignee($event)" />
            </div>
            }
            @if (assigneeAway(); as away) {
              <div class="k"></div><div class="v small" style="color:var(--warn)">{{ away }}</div>
            }

            <div class="k" title="Quem participou ou pediu. Só registro: ninguém é avisado nem ganha acesso.">Alinhado com</div>
            <div class="v" style="flex-wrap: wrap; gap: 6px">
              @for (c of t.contacts || []; track c.id) {
                <span class="pill"><app-avatar [person]="c" />{{ c.name }}
                  @if (editable()) { <button type="button" (click)="toggleContact(c.id)" [attr.aria-label]="'Remover ' + c.name"><app-icon name="x" [size]="12" /></button> }
                </span>
              }
              @if (editable()) {
                <app-person-picker variant="inline" [people]="contactCandidates()" [placeholder]="t.contacts?.length ? '+ pessoa' : 'Adicionar pessoa…'"
                                   ariaLabel="Adicionar pessoa com quem foi alinhado" (picked)="toggleContact($event ?? 0)" />
              } @else if (!t.contacts?.length) { <span class="muted">—</span> }
            </div>

            <div class="k">Data</div>
            <div class="v"><input type="date" class="inline" [disabled]="!editable()" [ngModel]="t.aligned_on" (change)="setAlignedOn($any($event.target).value || null)" aria-label="Data do alinhamento" /></div>

            <div class="k">Início</div>
            <div class="v"><input type="date" class="inline" [disabled]="!editable()" [ngModel]="t.start_date" (change)="setStart($any($event.target).value || null)" aria-label="Data de início" /></div>

            <div class="k">Prazo</div>
            <div class="v"><input type="date" class="inline" [disabled]="!editable()" [ngModel]="t.due_date" (change)="setDue($any($event.target).value || null)" aria-label="Prazo" /></div>

            <div class="props-sep"></div>
            <div class="k">Prioridade</div>
            <div class="v">
              <select class="inline" [disabled]="!editable()" [ngModel]="t.priority" (ngModelChange)="setPriority($event)" aria-label="Prioridade">
                @for (p of priorities; track p.value) { <option [ngValue]="p.value">{{ p.label }}</option> }
              </select>
            </div>

            <div class="k">Tempo</div>
            <div class="v">
              <div class="seg" role="group" aria-label="Tempo">
                @for (z of sizes; track z.v) {
                  <button type="button" [disabled]="!working()" [class.on]="t.size === z.v" (click)="setSize(t.size === z.v ? null : z.v)" [title]="z.hint">{{ z.t }}</button>
                }
              </div>
            </div>

            @if (t.project) {
              <div class="props-sep"></div>
              @if (t.sections.length) {
                <div class="k">{{ terms().One }}</div>
                <div class="v">
                  <select class="inline" [disabled]="!editable()" [ngModel]="t.section?.id ?? null" (ngModelChange)="setSection($event)" [attr.aria-label]="terms().One">
                    @for (s of t.sections; track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
                  </select>
                </div>
              }
              @if (t.phases?.length) {
                <div class="k">Fase</div>
                <div class="v">
                  <select class="inline" [disabled]="!editable()" [ngModel]="t.phase?.id ?? null" (ngModelChange)="setPhase($event)" aria-label="Fase">
                    @if (!t.phase) { <option [ngValue]="null">Sem fase</option> }
                    @for (f of t.phases; track f.id) { <option [ngValue]="f.id">{{ f.name }}</option> }
                  </select>
                </div>
              }
            }

            @if (editable() && seesProject()) {
              <div class="k">{{ isBoard() ? 'Equipe' : 'Projeto' }}</div>
              <div class="v">
                <select class="inline grow" [ngModel]="t.project?.id ?? null" (ngModelChange)="moveProject($event)" [attr.aria-label]="isBoard() ? 'Equipe' : 'Projeto'">
                  <option [ngValue]="null">Sem projeto</option>
                  @for (p of data.editableProjects(t.space); track p.id) { <option [ngValue]="p.id">{{ p.is_board ? 'Equipe · ' + p.name : p.name }}</option> }
                </select>
              </div>
              @if (t.project && t.space === 'profissional') {
                <div class="k">Privacidade</div>
                <div class="v"><label class="check-label"><input type="checkbox" class="switch" role="switch" [checked]="t.is_private" (change)="setPrivate(!t.is_private)" /> Só quem está na tarefa (esconde dos outros participantes)</label></div>
              }
            }

          </div>

          <div class="section-label step-head">
            <span class="grow">Descrição</span>
            @if (editable()) {
              <label class="check-label" style="text-transform: none; letter-spacing: 0; font-weight: 500" title="Com o interruptor ligado, cada Enter vira etapa. Desligado, só a linha que começa com -.">
                <input type="checkbox" class="switch" role="switch" [ngModel]="linesToStepsOn" (ngModelChange)="linesToStepsOn = $event" /> Linhas viram etapas
              </label>
            }
          </div>
          <textarea #descEl class="textarea" [readOnly]="!editable()" [placeholder]="linesToStepsOn ? 'Cada Enter cria uma etapa. Ou comece a linha com -.' : 'Anotações, contexto, links…'" [ngModel]="draftDescription"
                    (ngModelChange)="onDescription($event)" (keydown.enter)="descEnter($event, descEl)" aria-label="Descrição"></textarea>

          <div class="section-label step-head">
            <span>Etapas</span>
            @if (t.subtasks.length) {
              <span class="step-progress"><i [style.width.%]="(doneSubtasks() / t.subtasks.length) * 100"></i></span>
              <span class="muted small">{{ doneSubtasks() }}/{{ t.subtasks.length }}</span>
              <span class="muted small step-next">· {{ nextText() }}</span>
            }
            <span class="grow"></span>
            @if (editable()) {
              <label class="check-label step-order-switch" title="Ligado: a próxima etapa só conclui depois da anterior. Desligado: as etapas andam ao mesmo tempo.">
                <input type="checkbox" class="switch" role="switch" [checked]="t.steps_ordered !== false" (change)="setStepsOrdered($any($event.target).checked)" /> Seguir prioridade
              </label>
            }
          </div>
          @for (s of t.subtasks; track s.id; let i = $index; let last = $last) {
            <div class="subtask step-row" [class.done]="s.done" [class.mine]="s.assignee_id === me" [class.step-current]="s.id === currentId()"
                 [class.step-dragging]="stepDragFrom() === i" [class.step-over]="stepOver() === i"
                 (dragover)="stepHover($event, i)" (drop)="stepDrop($event, i)">
              @if (editable()) {
                <button type="button" class="step-grip" draggable="true" (dragstart)="stepDrag($event, i)" (dragend)="stepDragEnd()" aria-label="Arrastar etapa" title="Arrastar para reordenar"><span></span><span></span><span></span><span></span><span></span><span></span></button>
              }
              <button class="step-num" [class.on]="s.done" [disabled]="!canTick(s)" (click)="tick(s)"
                      [title]="tickTitle(s)" [attr.aria-label]="s.done ? 'Desmarcar etapa ' + (i + 1) : 'Concluir etapa ' + (i + 1)">
                @if (s.done) { <app-icon name="check" [size]="12" /> } @else { {{ i + 1 }} }
              </button>
              <textarea class="step-title" rows="1" [readOnly]="!editable()" [ngModel]="s.title"
                        (input)="sizeStep($event)" (blur)="renameSub(s.id, $any($event.target).value)" (keydown.enter)="stepEnter($event)" aria-label="Etapa"></textarea>
              <span class="step-badge" [class]="'step-badge step-badge--' + stepState(s)">{{ stepLabel(s) }}</span>
              @if (editable()) {
                <span class="step-order">
                  <button class="btn btn-ghost btn-sm btn-icon" [disabled]="i === 0" (click)="moveSub(i, -1)" aria-label="Subir etapa" title="Subir"><app-icon name="chevron" [size]="12" class="rot-up" /></button>
                  <button class="btn btn-ghost btn-sm btn-icon" [disabled]="last" (click)="moveSub(i, 1)" aria-label="Descer etapa" title="Descer"><app-icon name="chevron" [size]="12" class="rot-down" /></button>
                </span>
                @if (t.space === 'profissional') {
                <app-person-picker class="step-who" mode="single" variant="inline" [groups]="stepGroups()" [value]="s.assignee_id ?? null"
                                   [specials]="[{ value: null, label: 'Sem responsável' }]" [placeholder]="s.assignee_name || 'Responsável'"
                                   ariaLabel="Responsável da etapa" (picked)="setSub(s.id, { assignee_id: $event })" />
                @if (s.assignee_id && s.assignee_id !== me) {
                  <label class="check-label step-notify" [title]="t.steps_ordered !== false ? 'Avisar a pessoa quando for a vez dela' : 'Avisar a pessoa sobre esta etapa'"><input type="checkbox" class="switch" role="switch" [checked]="s.notify !== false" (change)="setSub(s.id, { notify: s.notify === false })" /> avisar</label>
                }
                }
                <input type="date" class="inline step-due" [ngModel]="s.due_date" (change)="setSub(s.id, { due_date: $any($event.target).value || null })" aria-label="Prazo da etapa" />
                <button class="btn btn-ghost btn-sm btn-icon x" (click)="deleteSub(s.id)" aria-label="Remover etapa"><app-icon name="x" [size]="13" /></button>
              } @else {
                @if (s.assignee_name) {
                  <span class="step-who-ro"><app-avatar [person]="{ name: s.assignee_name, initials: s.assignee_initials || '?', color: s.assignee_color || '#888' }" />{{ s.assignee_id === me ? 'Você' : s.assignee_name }}</span>
                }
                @if (s.due_date) { <span class="due">{{ dueText(s.due_date) }}</span> }
              }
            </div>
          }
          @if (editable()) {
            <div class="subtask step-row">
              <span class="step-num step-num--new"><app-icon name="plus" [size]="12" /></span>
              <input class="inline grow" placeholder="Adicionar etapa e Enter" [(ngModel)]="newSub" (keydown.enter)="addSub()" />
            </div>
            <div class="muted small" style="margin-top:4px">{{ t.steps_ordered !== false ? 'As etapas andam em ordem: a próxima só conclui depois da anterior, e cada pessoa é avisada quando chega a vez dela.' : 'As etapas andam ao mesmo tempo: cada uma pode ser concluída sem esperar a anterior.' }}</div>
          }

          <div class="th-files-zone" [class.file-over]="fileOver()"
               (dragenter)="fileEnter($event)" (dragover)="fileHover($event)" (dragleave)="fileLeave($event)" (drop)="fileDrop($event)">
          <div class="section-label step-head">
            <span>Anexos</span>
            @if (files().length) { <span class="muted small">{{ files().length }}</span> }
            <span class="grow"></span>
            @if (editable() && files().length < fileMax) {
              <label class="btn btn-ghost btn-sm qa-file-add">
                <app-icon name="paperclip" [size]="14" />
                Incluir
                <input type="file" multiple hidden [disabled]="uploadingFiles()" (change)="addFiles($event)" />
              </label>
            }
          </div>
          @if (filesLoading()) { <div class="muted small">Carregando anexos…</div> }
          @if (!filesLoading() && !files().length) {
            <div class="muted small">{{ editable() ? 'Nenhum anexo. Arraste um arquivo para cá.' : 'Nenhum anexo.' }}</div>
          }
          <div class="th-files">
            @for (f of files(); track f.id) {
              <div class="th-file">
                @if (previewOf(f.id); as src) {
                  <button type="button" class="th-file-thumb" (click)="openPreview(f)" [attr.aria-label]="'Ver ' + f.name">
                    <img [src]="src" [alt]="f.name" />
                  </button>
                } @else {
                  <span class="th-file-ico"><app-icon name="paperclip" [size]="14" /></span>
                }
                <div class="th-file-meta">
                  <button type="button" class="th-file-name" (click)="downloadFile(f)" [title]="'Baixar ' + f.name">{{ f.name }}</button>
                  <span class="muted small">{{ fileSize(f.size_bytes) }}@if (f.uploaded_by) { · {{ f.uploaded_by.name }} }</span>
                </div>
                <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="downloadFile(f)" [attr.aria-label]="'Baixar ' + f.name" title="Baixar"><app-icon name="download" [size]="14" /></button>
                @if (editable()) {
                  <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="removeFile(f)" [attr.aria-label]="'Remover ' + f.name" title="Remover"><app-icon name="trash" [size]="14" /></button>
                }
              </div>
            }
          </div>
          @if (editable()) {
            <div class="muted small" style="margin-top:4px">Qualquer tipo de arquivo. Até {{ fileMax }} arquivos, {{ fileMaxMb }} MB cada.</div>
          }
          </div>

          <div class="section-label">Atividade</div>
          <div class="timeline">
            @for (e of visibleTimeline(); track e.kind + e.id) {
              <div class="tl-card" [class.tl-card--comment]="e.kind === 'comment'">
                <app-avatar [person]="{ name: e.user_name || 'Sistema', initials: e.initials || '?', color: e.color || '#888' }" />
                <div class="tl-card__body">
                  <div class="tl-card__head">
                    <b>{{ e.user_name || 'Sistema' }}</b>
                    <span class="tl-card__when">{{ when(e.created_at) }}</span>
                  </div>
                  @if (e.kind === 'comment') {
                    <div class="tl-card__text"><app-rich-text [text]="e.body || ''" /></div>
                  } @else {
                    <div class="tl-card__text">{{ activityText(e) }}@if (e.to_value) { <b> {{ valueOf(e.to_value) }}</b> }</div>
                  }
                  @if (e.note) {
                    <div class="tl-note"><app-icon name="lock" [size]="12" /> {{ e.note }}</div>
                  } @else if (e.note_hidden) {
                    <div class="tl-note tl-note--hidden"><app-icon name="lock" [size]="12" /> Motivo restrito à gestão</div>
                  }
                </div>
              </div>
            }
            @if (hiddenCount() > 0 || shown() > 4) {
              <div class="tl-more">
                @if (hiddenCount() > 0) {
                  <button type="button" class="btn btn-ghost btn-sm" (click)="showMore()"><app-icon name="chevron" [size]="12" class="rot-down" />Expandir</button>
                }
                @if (shown() > 4) {
                  <button type="button" class="btn btn-ghost btn-sm" (click)="showLess()"><app-icon name="chevron" [size]="12" class="rot-up" />Recolher</button>
                }
              </div>
            }
          </div>
        }
      </div>
      @if (task(); as t) {
        <div class="drawer-foot composer">
          <textarea class="textarea" style="min-height:70px" placeholder="Escreva um comentário. Use &#64;usuario para avisar alguém."
                    [(ngModel)]="comment" (ngModelChange)="onCommentInput()" (keydown)="commentKey($event)" aria-label="Comentário"></textarea>
          @if (mentionList().length) {
            <div class="card" style="padding:4px">
              @for (p of mentionList(); track p.id) {
                <button class="pal-item" (click)="insertMention(p)"><app-avatar [person]="p" />{{ p.name }} <span class="side-note">&#64;{{ p.username }}</span></button>
              }
            </div>
          }
          <div class="row"><span class="muted small grow">Ctrl+Enter envia</span>
            <button class="btn btn-primary btn-sm" [disabled]="!comment.trim() || sending()" (click)="sendComment()">Comentar</button></div>
          <div class="drawer-actions">
              @if (showConclude()) {
                <button type="button" class="btn-action-primary btn-sm" (click)="toggleDone()">{{ taskClosed() ? 'Reabrir' : 'Concluir' }}</button>
              }
              @if (editable() && otherPhases().length) {
                <div class="act-phase">
                  <button type="button" class="btn-action-secondary btn-sm" (click)="phaseMenu.set(!phaseMenu())">Jogar para outra fase</button>
                  @if (phaseMenu()) {
                    <div class="act-phase-menu act-phase-menu--up">
                      @for (f of otherPhases(); track f.id) {
                        <button type="button" (click)="sendToPhase(f)"><i [style.background]="f.color"></i>{{ f.name }}</button>
                      }
                    </div>
                  }
                </div>
              }
              <span class="grow"></span>
              <div class="drawer-actions__right">
                <button type="button" class="btn btn-sm btn-ghost dh-day" (click)="planToday()" title="Adicionar ao Meu Dia de hoje"><app-icon name="sun" [size]="14" />Meu Dia</button>
                @if (editable() || working()) {
                  <button type="button" class="btn btn-sm btn-ghost" (click)="close()">Cancelar</button>
                  <button type="button" class="btn btn-sm btn-primary" [disabled]="!dirty() || savingEdit()" (click)="saveEdits()">{{ savingEdit() ? 'Salvando…' : 'Salvar' }}</button>
                }
              </div>
            </div>
        </div>
      }
    </aside>
    </div>

    @if (finishFor(); as s) {
      <div class="modal-scrim" (click)="finishFor.set(null)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">Concluir etapa: {{ s.title }}</div>
          <div class="modal-body">
            <div class="field"><label for="fin-note">O que foi feito (opcional)</label>
              <textarea id="fin-note" class="textarea" [(ngModel)]="finishNote" maxlength="1000" placeholder="Ex.: contrato revisado e enviado ao jurídico." appAutofocus></textarea>
              <span class="muted small">{{ finishHint() }}</span>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" (click)="finishFor.set(null)">Cancelar</button>
            <button class="btn btn-primary" [disabled]="finishing()" (click)="confirmFinish()">{{ finishing() ? 'Concluindo…' : 'Concluir' }}</button>
          </div>
        </div>
      </div>
    }

    @if (moveFor(); as s) {
      <div class="modal-scrim" (click)="cancelMove()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">Mover para {{ s.name }}</div>
          <div class="modal-body">
            <div class="field"><label for="mv-reason">Motivo da mudança</label>
              <textarea id="mv-reason" class="textarea" [(ngModel)]="moveReason" placeholder="Por que a tarefa está mudando de etapa?" maxlength="1000" appAutofocus></textarea>
              <span class="muted small">Visível para você, o responsável e a gestão do projeto.</span>
            </div>
            @if (s.category === 'blocked') {
              <div class="field"><label for="mv-block">O que está bloqueando</label>
                <textarea id="mv-block" class="textarea" [(ngModel)]="blockReason" placeholder="Ex.: aguardando acesso do fornecedor. Quem pode destravar: Compras." maxlength="1000"></textarea>
                <span class="muted small">Aparece no card e no painel do gestor, e avisa quem criou a tarefa.</span>
              </div>
            }
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" (click)="cancelMove()">Cancelar</button>
            <button class="btn btn-primary" [disabled]="moveReason.trim().length < 3" (click)="confirmMove()">Mover</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TaskDrawerComponent implements OnChanges, OnDestroy {
  taskId = input.required<number>();
  @ViewChild('titleEl') titleEl?: ElementRef<HTMLTextAreaElement>;

  ui = inject(UiService);
  data = inject(DataService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  task = signal<TaskDetail | null>(null);
  timeline = signal<TimelineEntry[]>([]);
  shown = signal(4);
  visibleTimeline = computed(() => this.timeline().slice(-this.shown()));
  hiddenCount = computed(() => Math.max(0, this.timeline().length - this.shown()));
  people = signal<Person[]>([]);
  loading = signal(false);
  error = signal('');
  sending = signal(false);
  moveFor = signal<Status | null>(null);
  statusPick = signal<number | null>(null);
  moveReason = '';
  mentionQuery = signal<string | null>(null);

  priorities = PRIORITIES;
  sizes = SIZES;
  fileOver = signal(false);
  fileMax = TASK_FILE_MAX;
  fileMaxMb = TASK_FILE_MAX_MB;
  fileSize = fileSize;
  files = signal<TaskFile[]>([]);
  filesLoading = signal(false);
  uploadingFiles = signal(false);
  private previews = signal<Record<number, string>>({});
  today = todayIso();
  draftTitle = '';
  draftDescription = '';
  private baseline = signal<TaskSnap | null>(null);
  private editTick = signal(0);
  private tempStep = -1;
  savingEdit = signal(false);
  dirty = computed(() => {
    this.editTick();
    const t = this.task();
    const b = this.baseline();
    return !!t && !!b && this.hasChanges(t, b);
  });
  linesToStepsOn = false;
  newSub = '';
  comment = '';
  blockReason = '';

  projectClosed = computed(() => !!this.task()?.section?.completed_at);
  taskClosed = computed(() => this.task()?.status.category === 'done');
  locked = computed(() => this.projectClosed() || this.taskClosed());
  private canWork = computed(() => ['edit', 'work'].includes(this.task()?.access || ''));
  editable = computed(() => this.task()?.access === 'edit' && !this.locked());
  // Colaborador ("work") atualiza status, tamanho, bloqueio e etapas, enquanto a tarefa e o projeto estão abertos.
  working = computed(() => this.canWork() && !this.locked());
  showConclude = computed(() => this.canWork() && !this.projectClosed());
  me = this.auth.user()?.id ?? 0;
  terms = computed(() => termsFor());
  seesProject = computed(() => { const p = this.task()?.project; return !p || this.data.projects().some(x => x.id === p.id); });
  myOpenSteps = computed(() => (this.task()?.subtasks || []).filter(s => s.assignee_id === this.me && !s.done));
  isBoard = computed(() => !!this.data.projects().find(x => x.id === this.task()?.project?.id)?.is_board);
  contactCandidates = computed(() => {
    const taken = (this.task()?.contacts || []).map(c => c.id);
    return this.data.people().filter(p => !taken.includes(p.id) && p.id !== this.me);
  });
  teamPeople = computed(() => this.people().filter(p => p.in_team !== false));
  otherPeople = computed(() => this.people().filter(p => p.in_team === false));
  assigneeGroups = computed<PersonGroup[]>(() => [
    { label: this.task()?.project ? 'Participantes do projeto' : 'Pessoas', people: this.teamPeople() },
    { label: 'Outras pessoas (veem só esta tarefa)', people: this.otherPeople() },
  ]);
  stepGroups = computed(() => {
    const u = this.auth.user();
    const me = u ? { id: u.id, name: u.name, username: u.username, initials: u.initials, color: u.color, department: u.department } : null;
    return stepAssigneeGroups(this.people(), this.me, me);
  });
  doneSubtasks = computed(() => this.task()?.subtasks.filter(s => s.done).length || 0);
  // Etapas em sequência: a da vez é a primeira não concluída.
  currentId = computed(() => this.task()?.subtasks.find(s => !s.done)?.id ?? null);
  myTurn = computed(() => {
    const s = this.task()?.subtasks.find(x => x.id === this.currentId());
    return s && s.assignee_id === this.me ? s : null;
  });
  nextText = computed(() => {
    const list = this.task()?.subtasks || [];
    const cur = list.find(s => s.id === this.currentId());
    if (!list.length) return '';
    if (!cur) return 'Todas concluídas';
    return `Na vez: ${cur.assignee_id === this.me ? 'você' : cur.assignee_name || 'sem responsável'}`;
  });
  phaseMenu = signal(false);
  otherPhases = computed(() => {
    const t = this.task();
    const cur = t?.phase?.id;
    return (t?.phases || []).filter(p => p.id !== cur);
  });
  finishFor = signal<Subtask | null>(null);
  finishing = signal(false);
  finishNote = '';
  finishHint = computed(() => {
    const s = this.finishFor(); const list = this.task()?.subtasks || [];
    if (!s) return '';
    const next = list.find(x => !x.done && x.id !== s.id);
    return next
      ? `A gestão do projeto é avisada, e ${next.assignee_name || 'a próxima etapa'} recebe o aviso de que é a vez dela.`
      : 'É a última etapa: a gestão do projeto é avisada para seguir com a próxima fase.';
  });
  assigneeAway = computed(() => {
    const id = this.task()?.assignee?.id;
    const p = this.people().find(x => x.id === id);
    return p?.away_until && p.away_until >= this.today ? `${p.name.split(' ')[0]} está ausente até ${p.away_until.split('-').reverse().join('/')}.` : '';
  });
  mentionList = computed(() => {
    const q = this.mentionQuery();
    if (q === null) return [];
    const k = q.toLowerCase();
    return this.data.people().filter(p => p.username?.startsWith(k) || p.name.toLowerCase().includes(k)).slice(0, 5);
  });

  ngOnChanges() { this.phaseMenu.set(false); this.load(); }

  load() {
    this.loading.set(true); this.error.set(''); this.linesToStepsOn = false; this.shown.set(4);
    this.api.task(this.taskId()).subscribe({
      next: t => {
        this.draftTitle = t.title;
        this.draftDescription = t.description || '';
        this.tempStep = -1;
        this.baseline.set(this.snap(t));
        this.task.set(t);
        this.loading.set(false);
        this.savingEdit.set(false);
        this.touch();
        setTimeout(() => this.autosize());
        if (!t.project) {
          this.api.directory().subscribe(p => this.people.set(p));
        } else {
          // Quem é de outro setor não lê o projeto; usa o diretório da empresa.
          this.api.projectPeople(t.project.id, t.section?.id).subscribe({
            next: p => this.people.set(p),
            error: () => this.api.directory().subscribe(p => this.people.set(p.map(x => ({ ...x, in_team: false })))),
          });
        }
      },
      error: e => { this.loading.set(false); this.savingEdit.set(false); this.error.set(errorMessage(e, 'Tarefa não encontrada ou sem acesso.')); },
    });
    this.api.timeline(this.taskId()).subscribe({ next: tl => this.timeline.set(tl), error: () => {} });
    this.loadFiles();
  }

  ngOnDestroy() { this.revokePreviews(); }

  previewOf(id: number) { return this.previews()[id] || ''; }

  private revokePreviews() {
    for (const url of Object.values(this.previews())) URL.revokeObjectURL(url);
    this.previews.set({});
  }

  private loadFiles() {
    this.filesLoading.set(true);
    this.api.taskFiles(this.taskId()).subscribe({
      next: list => {
        this.filesLoading.set(false);
        this.revokePreviews();
        this.files.set(list);
        for (const f of list) {
          if (!isTaskImage(f.mime)) continue;
          this.api.downloadTaskFile(this.taskId(), f.id).subscribe({
            next: blob => this.previews.update(m => ({ ...m, [f.id]: URL.createObjectURL(blob) })),
            error: () => {},
          });
        }
      },
      error: () => { this.filesLoading.set(false); this.files.set([]); },
    });
  }

  addFiles(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const picked = [...(input.files || [])];
    input.value = '';
    this.takeFiles(picked);
  }

  fileEnter(ev: DragEvent) {
    if (!isExternalFileDrag(ev) || !this.editable()) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.fileOver.set(true);
  }
  fileHover(ev: DragEvent) {
    if (!isExternalFileDrag(ev) || !this.editable()) return;
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
    if (!this.editable()) return;
    this.takeFiles([...(ev.dataTransfer?.files || [])]);
  }

  private takeFiles(picked: File[]) {
    if (!picked.length || this.uploadingFiles()) return;
    const keep: File[] = [];
    let count = this.files().length;
    for (const f of picked) {
      const err = taskFileError(f, count);
      if (err) { this.toast.error(err); continue; }
      keep.push(f);
      count += 1;
    }
    if (!keep.length) return;
    this.uploadingFiles.set(true);
    this.api.uploadTaskFiles(this.taskId(), keep).subscribe({
      next: () => { this.uploadingFiles.set(false); this.toast.show(keep.length === 1 ? 'Anexo incluído.' : 'Anexos incluídos.'); this.loadFiles(); },
      error: e => { this.uploadingFiles.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  downloadFile(f: TaskFile) {
    this.api.downloadTaskFile(this.taskId(), f.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: e => this.toast.error(errorMessage(e, 'Não foi possível baixar o arquivo.')),
    });
  }

  openPreview(f: TaskFile) {
    const src = this.previewOf(f.id);
    if (src) window.open(src, '_blank', 'noopener');
    else this.downloadFile(f);
  }

  removeFile(f: TaskFile) {
    this.api.deleteTaskFile(this.taskId(), f.id).subscribe({
      next: () => { this.toast.show('Anexo removido.'); this.loadFiles(); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  autosize() {
    const el = this.titleEl?.nativeElement;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
    document.querySelectorAll<HTMLTextAreaElement>('.drawer .step-title').forEach(t => this.sizeStep(t));
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

  patch(body: Record<string, unknown>, after?: () => void) {
    const t = this.task(); if (!t) return;
    this.api.updateTask(t.id, body).subscribe({
      next: updated => {
        const cur = this.task();
        if (!cur) return;
        const next: TaskDetail = {
          ...cur,
          status: updated.status,
          completed_at: updated.completed_at,
          blocked_reason: updated.blocked_reason,
        };
        if ('phase_id' in body) {
          next.phase = updated.phase ?? null;
          this.baseline.update(b => b ? { ...b, phase_id: updated.phase?.id ?? null } : b);
        }
        this.task.set(next);
        this.ui.taskChanged$.next(cur.id);
        this.api.timeline(cur.id).subscribe(tl => this.timeline.set(tl));
        after?.();
      },
      error: e => { this.toast.error(errorMessage(e)); this.statusPick.set(null); this.moveFor.set(null); },
    });
  }

  toggleDone() {
    const t = this.task(); if (!t || this.projectClosed()) return;
    this.phaseMenu.set(false);
    const closing = t.status.category !== 'done';
    if (closing && !confirmOpen('a tarefa', t.subtasks.filter(s => !s.done).map(s => s.title))) return;
    this.patch({ done: closing }, () => this.toast.show(closing ? 'Tarefa concluída. Permanece nesta fase.' : 'Tarefa reaberta.'));
  }
  sendToPhase(f: Phase) {
    this.phaseMenu.set(false);
    this.patch({ phase_id: f.id }, () => this.toast.show(`Tarefa enviada para ${f.name}.`));
  }

  setStatus(id: number) {
    const t = this.task();
    const s = t?.statuses.find(x => x.id === id);
    if (!t || !s || s.id === t.status.id) return;
    if (s.category === 'done' && !confirmOpen('a tarefa', t.subtasks.filter(x => !x.done).map(x => x.title))) return;
    this.moveReason = ''; this.blockReason = '';
    this.statusPick.set(id);
    this.moveFor.set(s);
  }

  cancelMove() { this.moveFor.set(null); this.statusPick.set(null); }

  confirmMove() {
    const s = this.moveFor(); if (!s || this.moveReason.trim().length < 3) return;
    const body: Record<string, unknown> = { status_id: s.id, move_reason: this.moveReason.trim() };
    if (s.category === 'blocked') body['blocked_reason'] = this.blockReason.trim() || null;
    this.moveFor.set(null);
    this.patch(body, () => this.statusPick.set(null));
  }

  moveProject(projectId: number | null) {
    const t = this.task(); if (!t || projectId === (t.project?.id ?? null)) return;
    if (!projectId) {
      this.localTask({ project: null, section: null, phase: null });
      return;
    }
    const project = this.data.editableProjects(t.space).find(p => p.id === projectId);
    if (!project) return;
    this.api.works(projectId).subscribe({
      next: r => {
        const list = r.works.filter(w => !w.completed_at && (r.can_create || w.my_role === 'manage'));
        if (list.length !== 1) {
          const T = termsFor();
          this.toast.show(list.length ? `Aí há mais de um ${T.one}. Abra o ${T.one} e mova a tarefa para lá.` : `Ainda não há nenhum ${T.one} aí.`);
          this.touch();
          return;
        }
        const w = list[0];
        this.localTask({
          project: { id: project.id, name: project.name, color: project.color, team_id: project.team_id, team_name: project.team_name },
          section: { id: w.id, name: w.name },
          sections: [{ id: w.id, project_id: projectId, name: w.name, position: w.position ?? 0 }],
          phases: r.phases,
          phase: w.phase_id ? { id: w.phase_id, name: w.phase_name || '', color: w.phase_color || '' } : null,
        });
        this.loadPeople(projectId, w.id);
      },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  close() { this.ui.closeTask(); }

  onTitle(value: string) {
    this.draftTitle = value;
    this.touch();
    this.autosize();
  }

  onDescription(value: string) {
    this.draftDescription = value;
    this.touch();
  }

  setAssignee(id: number | null) {
    const person = id == null ? null : (this.people().find(p => p.id === id) || this.data.people().find(p => p.id === id) || null);
    this.localTask({ assignee: person });
  }

  setStart(value: string | null) { this.localTask({ start_date: value }); }
  setDue(value: string | null) { this.localTask({ due_date: value }); }
  setPriority(value: TaskDetail['priority']) { this.localTask({ priority: value }); }
  setSize(value: TaskDetail['size']) { this.localTask({ size: value }); }
  setPrivate(value: boolean) { this.localTask({ is_private: value }); }

  setStepsOrdered(value: boolean) {
    const t = this.task(); if (!t || (t.steps_ordered !== false) === value) return;
    this.task.set({ ...t, steps_ordered: value });
    this.api.updateTask(t.id, { steps_ordered: value }).subscribe({
      error: e => {
        this.toast.error(errorMessage(e));
        this.task.update(cur => cur && cur.id === t.id ? { ...cur, steps_ordered: !value } : cur);
      },
    });
  }

  setSection(id: number | null) {
    const t = this.task(); if (!t) return;
    const section = t.sections.find(s => s.id === id);
    this.localTask({ section: section ? { id: section.id, name: section.name } : null });
    if (t.project) this.loadPeople(t.project.id, section?.id);
  }

  setPhase(id: number | null) {
    const t = this.task(); if (!t) return;
    const phase = (t.phases || []).find(f => f.id === id);
    this.localTask({ phase: phase ? { id: phase.id, name: phase.name, color: phase.color } : null });
  }

  toggleContact(id: number) {
    const t = this.task(); if (!t || !id) return;
    const cur = (t.contacts || []).map(c => c.id);
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    this.api.setTaskContacts(t.id, next).subscribe({
      next: r => this.task.update(cur => cur ? { ...cur, contacts: r.contacts, aligned_on: r.aligned_on } : cur),
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  setAlignedOn(date: string | null) {
    const t = this.task(); if (!t || date === (t.aligned_on ?? null)) return;
    this.api.setTaskAlignment(t.id, date).subscribe({
      next: r => this.task.update(cur => cur ? { ...cur, contacts: r.contacts, aligned_on: r.aligned_on } : cur),
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  descEnter(e: Event, el: HTMLTextAreaElement) {
    const k = e as KeyboardEvent;
    if (!this.editable() || k.ctrlKey || k.metaKey || k.shiftKey) return;
    const r = takeBulletLine(el.value, el.selectionStart, this.linesToStepsOn);
    if (!r) return;
    e.preventDefault();
    el.value = r.text;
    el.setSelectionRange(r.caret, r.caret);
    this.draftDescription = r.text;
    this.touch();
    this.addSteps([r.step]);
  }

  private addSteps(titles: string[]) {
    const t = this.task(); if (!t) return;
    const steps = titles.map((title, i) => this.makeStep(title, t.subtasks.length + i)).filter(s => s.title);
    if (!steps.length) return;
    this.task.set({ ...t, subtasks: [...t.subtasks, ...steps], subtasks_total: t.subtasks_total + steps.length });
    setTimeout(() => this.autosize());
  }

  addSub() {
    const t = this.task(); const title = this.newSub.trim();
    if (!t || !title) return;
    const step = this.makeStep(title, t.subtasks.length);
    this.task.set({ ...t, subtasks: [...t.subtasks, step], subtasks_total: t.subtasks_total + 1 });
    this.newSub = '';
  }

  toggleSub(id: number, done: boolean) {
    const t = this.task(); if (!t) return;
    this.task.set({ ...t, subtasks: t.subtasks.map(s => (s.id === id ? { ...s, done } : s)) });
    if (id < 0) return;
    this.api.updateSubtask(t.id, id, { done }).subscribe({
      next: () => {
        this.baseline.update(b => b ? { ...b, subtasks: b.subtasks.map(s => s.id === id ? { ...s, done } : s) } : b);
        this.ui.taskChanged$.next(t.id);
        this.api.timeline(t.id).subscribe(tl => this.timeline.set(tl));
      },
      error: e => {
        this.toast.error(errorMessage(e));
        this.task.update(cur => cur ? { ...cur, subtasks: cur.subtasks.map(s => s.id === id ? { ...s, done: !done } : s) } : cur);
      },
    });
  }

  private ordered() { return this.task()?.steps_ordered !== false; }
  stepState(s: Subtask) {
    if (s.done) return 'done';
    if (!this.ordered()) return 'turn';
    return s.id === this.currentId() ? 'turn' : 'wait';
  }
  stepLabel(s: Subtask) {
    if (s.done) return 'Concluída';
    if (!this.ordered()) return 'Em andamento';
    return s.id === this.currentId() ? 'Na vez' : 'Aguardando';
  }
  canTick(s: Subtask) {
    if (this.locked()) return false;
    if (s.done) return this.editable();
    if (this.ordered() && s.id !== this.currentId()) return false;
    if (this.editable()) return true;
    return s.assignee_id === this.me || this.task()?.access === 'work';
  }
  tickTitle(s: Subtask) {
    if (s.done) return this.editable() ? 'Desmarcar' : 'Concluída';
    if (this.ordered() && s.id !== this.currentId()) return 'Aguarde a etapa anterior';
    return this.editable() ? 'Marcar como feita' : 'Concluir minha etapa';
  }
  tick(s: Subtask) {
    if (!s.done && s.assignee_id === this.me) { this.openFinish(s); return; }
    this.toggleSub(s.id, !s.done);
  }

  openFinish(s: Subtask) { this.finishNote = ''; this.finishFor.set(s); }

  confirmFinish() {
    const t = this.task(); const s = this.finishFor(); if (!t || !s || this.finishing()) return;
    if (s.id < 0) {
      this.task.update(cur => cur ? { ...cur, subtasks: cur.subtasks.map(x => x.id === s.id ? { ...x, done: true } : x) } : cur);
      this.finishFor.set(null);
      this.toast.show('A etapa fica concluída quando você salvar a tarefa.');
      return;
    }
    const note = this.finishNote.trim();
    this.finishing.set(true);
    this.api.updateSubtask(t.id, s.id, note ? { done: true, note } : { done: true }).subscribe({
      next: () => {
        this.finishing.set(false); this.finishFor.set(null);
        this.task.update(cur => cur ? { ...cur, subtasks: cur.subtasks.map(x => x.id === s.id ? { ...x, done: true } : x) } : cur);
        this.baseline.update(b => b ? { ...b, subtasks: b.subtasks.map(x => x.id === s.id ? { ...x, done: true } : x) } : b);
        this.toast.show('Etapa concluída. A gestão do projeto foi avisada.');
        this.ui.taskChanged$.next(t.id);
        this.api.timeline(t.id).subscribe(tl => this.timeline.set(tl));
      },
      error: e => { this.finishing.set(false); this.toast.error(errorMessage(e)); },
    });
  }

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
    if (!this.stepDragEvent(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.stepOver.set(i);
  }
  stepDrop(ev: DragEvent, to: number) {
    if (!this.stepDragEvent(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const from = Number(ev.dataTransfer?.getData('application/x-taskhub-step'));
    this.stepDragEnd();
    if (!Number.isInteger(from) || from === to) return;
    this.reorderSub(from, to);
  }
  private stepDragEvent(ev: DragEvent) {
    const types = ev.dataTransfer?.types;
    return !!types && Array.from(types).includes('application/x-taskhub-step');
  }
  moveSub(i: number, dir: -1 | 1) { this.reorderSub(i, i + dir); }

  private reorderSub(from: number, to: number) {
    const t = this.task(); if (!t) return;
    const list = [...t.subtasks];
    const [item] = list.splice(from, 1);
    if (!item || to < 0 || to > list.length) return;
    list.splice(to, 0, item);
    this.task.set({ ...t, subtasks: list });
  }

  renameSub(id: number, title: string) {
    const t = this.task(); const s = t?.subtasks.find(x => x.id === id);
    const value = title.trim();
    if (!t || !s || !value || value === s.title) return;
    this.task.set({ ...t, subtasks: t.subtasks.map(x => x.id === id ? { ...x, title: value } : x) });
  }

  deleteSub(id: number) {
    const t = this.task(); if (!t) return;
    this.task.set({ ...t, subtasks: t.subtasks.filter(s => s.id !== id), subtasks_total: Math.max(0, t.subtasks_total - 1) });
  }

  onCommentInput() {
    const m = this.comment.match(/@([a-z0-9._-]*)$/i);
    this.mentionQuery.set(m ? m[1] : null);
  }

  insertMention(p: Person) {
    this.comment = this.comment.replace(/@([a-z0-9._-]*)$/i, `@${p.username} `);
    this.mentionQuery.set(null);
  }

  commentKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.sendComment(); }
  }

  sendComment() {
    const t = this.task(); const body = this.comment.trim();
    if (!t || !body) return;
    this.sending.set(true);
    this.api.comment(t.id, body).subscribe({
      next: c => { this.timeline.update(l => [...l, c]); this.comment = ''; this.sending.set(false); this.ui.taskChanged$.next(t.id); },
      error: e => { this.sending.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  planToday() {
    const t = this.task(); if (!t) return;
    this.api.planAdd(t.id, todayIso()).subscribe({
      next: () => { this.toast.show('Adicionada ao Meu Dia de hoje.'); this.ui.taskChanged$.next(t.id); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  remove() {
    const t = this.task(); if (!t) return;
    this.ui.closeTask();
    this.ui.hide(t.id);
    this.toast.undoable(`Tarefa "${t.title}" excluída.`,
      () => this.api.deleteTask(t.id).subscribe({
        next: () => { this.ui.taskChanged$.next(null); this.ui.unhide(t.id); },
        error: e => { this.ui.unhide(t.id); this.toast.error(errorMessage(e)); },
      }),
      () => this.ui.unhide(t.id));
  }

  setSub(id: number, body: Record<string, unknown>) {
    const t = this.task(); if (!t) return;
    this.task.set({
      ...t,
      subtasks: t.subtasks.map(s => {
        if (s.id !== id) return s;
        const next: Subtask = { ...s, ...body };
        if ('assignee_id' in body) {
          const assigneeId = (body['assignee_id'] as number | null) || null;
          const person = assigneeId ? (this.people().find(p => p.id === assigneeId) || this.data.people().find(p => p.id === assigneeId)) : null;
          next.assignee_id = assigneeId;
          next.assignee_name = person?.name ?? null;
          next.assignee_initials = person?.initials ?? null;
          next.assignee_color = person?.color ?? null;
        }
        return next;
      }),
    });
  }

  async saveEdits() {
    const t = this.task();
    const b = this.baseline();
    if (!t || !b || this.savingEdit() || !this.dirty()) return;
    const title = this.draftTitle.trim();
    if (!title) { this.toast.error('Escreva o título da tarefa.'); return; }
    if (t.subtasks.some(s => !s.title.trim())) { this.toast.error('Escreva o texto de cada etapa.'); return; }
    const start = t.start_date || null;
    const due = t.due_date || null;
    if (start && due && due < start) { this.toast.error('O prazo deve ser igual ou depois da data de início.'); return; }
    const body = this.fieldDiff(t, b, title);
    const removed = b.subtasks.map(s => s.id).filter(id => !t.subtasks.some(s => s.id === id));
    const updates = this.stepUpdates(t, b);
    const created = t.subtasks.filter(s => s.id < 0);
    this.savingEdit.set(true);
    let savedSome = false;
    try {
      if (Object.keys(body).length) {
        await firstValueFrom(this.api.updateTask(t.id, body));
        savedSome = true;
      }
      for (const id of removed) {
        await firstValueFrom(this.api.deleteSubtask(t.id, id));
        savedSome = true;
      }
      for (const step of updates) {
        await firstValueFrom(this.api.updateSubtask(t.id, step.id, step.body));
        savedSome = true;
      }
      const ids = new Map<number, number>();
      for (const step of created) {
        const row = await firstValueFrom(this.api.addSubtask(t.id, step.title.trim(), {
          assignee_id: step.assignee_id,
          due_date: step.due_date,
          notify: step.notify !== false,
          ...(step.done ? { done: true } : {}),
        }));
        ids.set(step.id, row.id);
        savedSome = true;
      }
      const order = t.subtasks.map(s => s.id < 0 ? ids.get(s.id)! : s.id);
      const previous = b.subtasks.map(s => s.id);
      const orderChanged = order.length !== previous.length || order.some((id, i) => id !== previous[i]);
      if (orderChanged && order.length) await firstValueFrom(this.api.reorderSubtasks(t.id, order));
      this.toast.show('Tarefa atualizada.');
      this.ui.taskChanged$.next(t.id);
      this.load();
    } catch (e) {
      this.toast.error(errorMessage(e));
      if (savedSome) this.load();
      else this.savingEdit.set(false);
    }
  }

  private touch() { this.editTick.update(n => n + 1); }

  private localTask(patch: Partial<TaskDetail>) {
    const t = this.task(); if (!t) return;
    this.task.set({ ...t, ...patch });
  }

  private loadPeople(projectId: number, sectionId?: number) {
    this.api.projectPeople(projectId, sectionId).subscribe({
      next: people => this.people.set(people),
      error: () => this.api.directory().subscribe(people => this.people.set(people.map(p => ({ ...p, in_team: false })))),
    });
  }

  private makeStep(title: string, position: number): Subtask {
    return { id: this.tempStep--, title: title.trim(), done: false, position, due_date: null, assignee_id: null, notify: true };
  }

  private snap(t: TaskDetail): TaskSnap {
    return {
      title: t.title,
      description: t.description || '',
      assignee_id: t.assignee?.id ?? null,
      start_date: t.start_date || null,
      due_date: t.due_date || null,
      priority: t.priority,
      size: t.size ?? null,
      section_id: t.section?.id ?? null,
      phase_id: t.phase?.id ?? null,
      is_private: !!t.is_private,
      project_id: t.project?.id ?? null,
      subtasks: t.subtasks.map(s => ({
        id: s.id,
        title: s.title,
        assignee_id: s.assignee_id ?? null,
        due_date: s.due_date || null,
        notify: s.notify !== false,
        done: !!s.done,
      })),
    };
  }

  private hasChanges(t: TaskDetail, b: TaskSnap) {
    if (this.draftTitle.trim() !== b.title) return true;
    if ((this.draftDescription || '') !== (b.description || '')) return true;
    if ((t.assignee?.id ?? null) !== b.assignee_id) return true;
    if ((t.start_date || null) !== (b.start_date || null)) return true;
    if ((t.due_date || null) !== (b.due_date || null)) return true;
    if (t.priority !== b.priority) return true;
    if ((t.size ?? null) !== (b.size ?? null)) return true;
    if ((t.section?.id ?? null) !== b.section_id) return true;
    if ((t.phase?.id ?? null) !== b.phase_id) return true;
    if (!!t.is_private !== b.is_private) return true;
    if ((t.project?.id ?? null) !== b.project_id) return true;
    if (t.subtasks.length !== b.subtasks.length) return true;
    return t.subtasks.some((s, i) => {
      const o = b.subtasks[i];
      return !o || s.id !== o.id || s.title !== o.title || (s.assignee_id ?? null) !== o.assignee_id
        || (s.due_date || null) !== (o.due_date || null) || (s.notify !== false) !== o.notify;
    });
  }

  private fieldDiff(t: TaskDetail, b: TaskSnap, title: string) {
    const body: Record<string, unknown> = {};
    if (title !== b.title) body['title'] = title;
    if ((this.draftDescription || '') !== (b.description || '')) body['description'] = this.draftDescription || '';
    if ((t.assignee?.id ?? null) !== b.assignee_id) body['assignee_id'] = t.assignee?.id ?? null;
    if ((t.start_date || null) !== (b.start_date || null)) body['start_date'] = t.start_date || null;
    if ((t.due_date || null) !== (b.due_date || null)) body['due_date'] = t.due_date || null;
    if (t.priority !== b.priority) body['priority'] = t.priority;
    if ((t.size ?? null) !== (b.size ?? null)) body['size'] = t.size ?? null;
    const projectId = t.project?.id ?? null;
    if (projectId !== b.project_id) {
      body['project_id'] = projectId;
      body['section_id'] = t.section?.id ?? null;
    } else if ((t.section?.id ?? null) !== b.section_id) {
      body['section_id'] = t.section?.id ?? null;
    }
    if (projectId === b.project_id && (t.phase?.id ?? null) !== b.phase_id) body['phase_id'] = t.phase?.id ?? null;
    if (!!t.is_private !== b.is_private) body['is_private'] = !!t.is_private;
    return body;
  }

  private stepUpdates(t: TaskDetail, b: TaskSnap) {
    const saved = new Map(b.subtasks.map(s => [s.id, s]));
    const updates: { id: number; body: Record<string, unknown> }[] = [];
    for (const step of t.subtasks) {
      if (step.id < 0) continue;
      const old = saved.get(step.id);
      if (!old) continue;
      const body: Record<string, unknown> = {};
      const title = step.title.trim();
      if (title !== old.title) body['title'] = title;
      if ((step.assignee_id ?? null) !== old.assignee_id) body['assignee_id'] = step.assignee_id;
      if ((step.due_date || null) !== (old.due_date || null)) body['due_date'] = step.due_date || null;
      if ((step.notify !== false) !== old.notify) body['notify'] = step.notify !== false;
      if (Object.keys(body).length) updates.push({ id: step.id, body });
    }
    return updates;
  }

  away(p: Person) { return p.away_until && p.away_until >= this.today ? ' (ausente)' : ''; }
  dueText(iso: string) { return dueLabel(iso); }
  showMore() { this.shown.update(n => n + 4); }
  showLess() { this.shown.set(4); }
  when(iso: string) { return stamp(iso); }
  valueOf(v: string | null) { return activityValue(v); }
  activityText(e: TimelineEntry) { return ACTIVITY_TEXT[e.type || ''] || 'atualizou a tarefa'; }
}
