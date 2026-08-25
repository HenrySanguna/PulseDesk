import { Component } from '@angular/core';
import { NxWelcome } from './nx-welcome';

@Component({
  imports: [NxWelcome],
  selector: 'pd-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected title = 'widget';
}
