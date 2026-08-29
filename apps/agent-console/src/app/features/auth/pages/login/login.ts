import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PdButton, PdInputText } from '@pulsedesk/ui';
import { AuthStore } from '../../services/auth.store';

@Component({
  selector: 'pd-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PdButton, PdInputText],
  templateUrl: './login.html',
})
export class Login {
  private readonly router = inject(Router);
  protected readonly store = inject(AuthStore);

  protected readonly email = signal('');
  protected readonly password = signal('');

  constructor() {
    // Already-authenticated agents landing on /login (e.g. back button) go
    // straight to the queue instead of seeing the form again.
    effect(() => {
      if (this.store.agent()) {
        this.router.navigateByUrl('/tickets');
      }
    });
  }

  protected submit(): void {
    if (!this.email() || !this.password()) {
      return;
    }
    this.store.login({ email: this.email(), password: this.password() });
  }
}
