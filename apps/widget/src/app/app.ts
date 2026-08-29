import { ChangeDetectionStrategy, Component } from '@angular/core';
import { WidgetChat } from './chat/pages/widget-chat/widget-chat';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WidgetChat],
  selector: 'pd-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
