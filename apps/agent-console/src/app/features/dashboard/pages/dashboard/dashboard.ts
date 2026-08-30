import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PdButton, PdChart, PdPulseTrace } from '@pulsedesk/ui';
import {
  buildAgentLoadChartData,
  buildStatusBreakdownChartData,
} from '../../services/dashboard-chart-data';
import { DashboardStore } from '../../services/dashboard.store';

@Component({
  selector: 'pd-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, PdButton, PdChart, PdPulseTrace],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly router = inject(Router);
  protected readonly store = inject(DashboardStore);

  /** Chart.js data for the ticket status breakdown (tasks.md 2.1). `null`
   * until the first snapshot arrives — the template only renders `pd-chart`
   * once a snapshot exists anyway (see `@if (store.snapshot(); as snapshot)`). */
  protected readonly statusChartData = computed(() => {
    const snapshot = this.store.snapshot();
    return snapshot ? buildStatusBreakdownChartData(snapshot) : null;
  });

  protected readonly agentLoadChartData = computed(() => {
    const agentLoad = this.store.agentLoad();
    return agentLoad ? buildAgentLoadChartData(agentLoad) : null;
  });

  constructor() {
    this.store.connect();
  }

  protected goToQueue(): void {
    this.router.navigate(['/tickets']);
  }
}
