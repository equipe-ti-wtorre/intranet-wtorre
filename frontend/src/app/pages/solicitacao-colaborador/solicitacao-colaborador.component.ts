import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { AlertasService } from '../../services/alertas.service';
import { AuthService } from '../../services/auth.service';
import { SolicitacaoColaboradorService } from '../../services/solicitacao-colaborador.service';
import {
  SolicitacaoEquipamento,
  SolicitacaoTipo,
} from '../../models/solicitacao-colaborador.model';

type CampoArquivo = 'foto' | 'boas_vindas' | 'credencial_veiculo';

@Component({
  selector: 'app-solicitacao-colaborador',
  standalone: true,
  imports: [PublicChromeComponent, FooterComponent, FormsModule],
  templateUrl: './solicitacao-colaborador.component.html',
  styleUrl: './solicitacao-colaborador.component.scss',
})
export class SolicitacaoColaboradorComponent implements OnInit {
  private readonly service = inject(SolicitacaoColaboradorService);
  private readonly auth = inject(AuthService);
  private readonly alertas = inject(AlertasService);

  readonly empresas = [
    'Nubank Parque',
    'WTorre',
    'Base Coworking',
    'WT Entretenimento',
  ];

  readonly carregando = signal(false);
  readonly enviando = signal(false);
  readonly progresso = signal(0);

  readonly solicitante = signal('');
  readonly solicitanteEmail = signal('');
  readonly tipo = signal<SolicitacaoTipo>('novo');
  readonly nome = signal('');
  readonly sobrenome = signal('');
  readonly emailNovo = signal('');
  readonly dataNascimento = signal('');
  readonly cpf = signal('');
  readonly rg = signal('');
  readonly departamento = signal('');
  readonly cargo = signal('');
  readonly supervisor = signal('');
  readonly centroCusto = signal('');
  readonly empresa = signal('');
  readonly localTrabalho = signal('');
  readonly precisaRamal = signal(true);
  readonly precisaCelular = signal(false);
  readonly equipamento = signal<SolicitacaoEquipamento>('notebook');
  readonly credencialEstacionamento = signal(false);
  readonly dataInicio = signal('');

  readonly fotoFile = signal<File | null>(null);
  readonly boasVindasFile = signal<File | null>(null);
  readonly credencialVeiculoFile = signal<File | null>(null);

  readonly fotoDragover = signal(false);
  readonly boasDragover = signal(false);
  readonly credDragover = signal(false);

  readonly mostrarCredencialVeiculo = computed(() => this.credencialEstacionamento());

  ngOnInit(): void {
    this.preencherSolicitante();
    this.carregando.set(true);
    this.service.listarCampos().subscribe({
      next: () => this.carregando.set(false),
      error: () => this.carregando.set(false),
    });
  }

  private preencherSolicitante(): void {
    const u = this.auth.usuario();
    if (u) {
      this.solicitante.set(u.nome_completo || u.nome || '');
      this.solicitanteEmail.set(u.email || '');
    }
  }

  onCredencialEstacionamentoChange(val: boolean): void {
    this.credencialEstacionamento.set(val);
    if (!val) this.credencialVeiculoFile.set(null);
  }

  onDragOver(event: DragEvent, campo: CampoArquivo): void {
    event.preventDefault();
    this.setDragover(campo, true);
  }

  onDragLeave(campo: CampoArquivo): void {
    this.setDragover(campo, false);
  }

  onDrop(event: DragEvent, campo: CampoArquivo): void {
    event.preventDefault();
    this.setDragover(campo, false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setArquivo(campo, file);
  }

  onFileInput(event: Event, campo: CampoArquivo): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setArquivo(campo, file);
    input.value = '';
  }

  private setDragover(campo: CampoArquivo, val: boolean): void {
    if (campo === 'foto') this.fotoDragover.set(val);
    else if (campo === 'boas_vindas') this.boasDragover.set(val);
    else this.credDragover.set(val);
  }

  private setArquivo(campo: CampoArquivo, file: File): void {
    if (campo === 'foto') this.fotoFile.set(file);
    else if (campo === 'boas_vindas') this.boasVindasFile.set(file);
    else this.credencialVeiculoFile.set(file);
  }

  limpar(): void {
    this.tipo.set('novo');
    this.nome.set('');
    this.sobrenome.set('');
    this.emailNovo.set('');
    this.dataNascimento.set('');
    this.cpf.set('');
    this.rg.set('');
    this.departamento.set('');
    this.cargo.set('');
    this.supervisor.set('');
    this.centroCusto.set('');
    this.empresa.set('');
    this.localTrabalho.set('');
    this.precisaRamal.set(true);
    this.precisaCelular.set(false);
    this.equipamento.set('notebook');
    this.credencialEstacionamento.set(false);
    this.dataInicio.set('');
    this.fotoFile.set(null);
    this.boasVindasFile.set(null);
    this.credencialVeiculoFile.set(null);
    this.preencherSolicitante();
  }

  private validarCliente(): string | null {
    if (!this.solicitante().trim()) return 'Informe o solicitante.';
    if (!this.solicitanteEmail().trim()) return 'Informe o e-mail do solicitante.';
    if (!this.nome().trim()) return 'Informe o nome.';
    if (!this.sobrenome().trim()) return 'Informe o sobrenome.';
    if (!this.dataNascimento()) return 'Informe a data de nascimento.';
    if (!this.cpf().trim()) return 'Informe o CPF.';
    if (!this.rg().trim()) return 'Informe o RG.';
    if (!this.departamento().trim()) return 'Informe o departamento.';
    if (!this.cargo().trim()) return 'Informe o cargo.';
    if (!this.supervisor().trim()) return 'Informe o supervisor.';
    if (!this.centroCusto().trim()) return 'Informe o centro de custo.';
    if (!this.empresa()) return 'Selecione a empresa.';
    if (!this.localTrabalho().trim()) return 'Informe o local de trabalho.';
    if (!this.fotoFile()) return 'Envie a foto do colaborador.';
    if (!this.dataInicio()) return 'Informe a data de início.';
    if (this.credencialEstacionamento() && !this.credencialVeiculoFile()) {
      return 'Credencial do veículo é obrigatória quando estacionamento = Sim.';
    }
    return null;
  }

  enviar(): void {
    const erro = this.validarCliente();
    if (erro) {
      this.alertas.erro(erro);
      return;
    }

    const fd = new FormData();
    fd.append('solicitante', this.solicitante().trim());
    fd.append('solicitante_email', this.solicitanteEmail().trim());
    fd.append('tipo', this.tipo());
    fd.append('nome', this.nome().trim());
    fd.append('sobrenome', this.sobrenome().trim());
    if (this.emailNovo().trim()) fd.append('email_novo', this.emailNovo().trim());
    fd.append('data_nascimento', this.dataNascimento());
    fd.append('cpf', this.cpf().trim());
    fd.append('rg', this.rg().trim());
    fd.append('departamento', this.departamento().trim());
    fd.append('cargo', this.cargo().trim());
    fd.append('supervisor', this.supervisor().trim());
    fd.append('centro_custo', this.centroCusto().trim());
    fd.append('empresa', this.empresa());
    fd.append('local_trabalho', this.localTrabalho().trim());
    fd.append('precisa_ramal', this.precisaRamal() ? '1' : '0');
    fd.append('precisa_celular', this.precisaCelular() ? '1' : '0');
    fd.append('equipamento', this.equipamento());
    fd.append('credencial_estacionamento', this.credencialEstacionamento() ? '1' : '0');
    fd.append('data_inicio', this.dataInicio());

    const foto = this.fotoFile();
    const boas = this.boasVindasFile();
    const cred = this.credencialVeiculoFile();
    if (foto) fd.append('foto', foto);
    if (boas) fd.append('boas_vindas', boas);
    if (cred) fd.append('credencial_veiculo', cred);

    this.enviando.set(true);
    this.progresso.set(0);

    this.service.criar(fd).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progresso.set(Math.round((100 * event.loaded) / event.total));
        }
        if (event.type === HttpEventType.Response) {
          this.enviando.set(false);
          this.progresso.set(100);
          const body = event.body;
          const grupos = body?.envio?.grupos?.length
            ? body.envio.grupos.map((g) => g.grupo_nome).join(', ')
            : null;
          const msg = grupos
            ? `Solicitação enviada. Grupos notificados: ${grupos}.`
            : body?.envio?.aviso || 'Solicitação registrada com sucesso.';
          this.alertas.sucesso(msg);
          this.limpar();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Erro ao enviar solicitação.');
      },
    });
  }
}
