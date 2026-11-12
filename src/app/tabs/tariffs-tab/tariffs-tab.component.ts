import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { DataService } from '../../data.service';
import { TAB_STYLES } from '../tab-styles';

@Component({
  selector: 'app-tariffs-tab',
  standalone: true,
  imports: [FormsModule, MatInputModule],
  template: ` <div class="tab">
    <h3>Тарифи на ресурси (грн за одиницю)</h3>
    @for (r of ds.resources(); track r.id) {
      <div class="row">
        <span class="lbl">{{ r.name }}, грн/{{ r.unit }}</span>
        <mat-form-field
          ><input
            matInput
            type="number"
            [ngModel]="r.tariff"
            (change)="ds.setTariff(r.id, +$any($event.target).value)"
        /></mat-form-field>
      </div>
    }
  </div>`,
  styles: [TAB_STYLES],
})
export class TariffsTabComponent {
  ds = inject(DataService);
}
