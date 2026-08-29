import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PdButton } from '@pulsedesk/ui';
import { DashboardStore } from '../../services/dashboard.store';

@Component({
  selector: 'pd-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, PdButton],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly router = inject(Router);
  protected readonly store = inject(DashboardStore);

  constructor() {
    this.store.connect();
  }

  protected goToQueue(): void {
    this.router.navigate(['/tickets']);
  }
}
