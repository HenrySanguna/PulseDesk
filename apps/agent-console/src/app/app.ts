import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from './features/auth/services/auth.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'pd-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly authStore = inject(AuthStore);
}
