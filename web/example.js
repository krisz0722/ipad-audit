// Kitalált példa riport adatai. A nyitóoldal és a docs/example-report.md is ebből készül, ugyanazzal a függvénnyel
// (buildSections), mint az éles riport, ezért a példa nem térhet el attól, amit az eladó a végén kap.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SellerExample = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return {
    data: {
      kind: 'ios',
      model: 'iPad Air 2 (példa)', modelId: 'iPad5,4', chip: '', memory: '', storage: '64 GB', os: '15.8',
      fingerprint: '', serialTail: '0001', serialRaw: 'PELDA0000001',
      cycles: 245, capacity: 85, batteryDefer: false, condition: '', fileDate: '',
      apple: 'yes', activationLock: 'Disabled', dep: null, mdm: null,
      hw: {
        touch: { status: 'ok', detail: 'mind a 96 mező érzékelt, két ujjal is' },
        motion: { status: 'ok', detail: 'mért mozgás: 14 és 12 m/s² tartomány, 87 °/s forgás' },
        audio: { status: 'ok', detail: 'bal csatorna 4 / 4, jobb csatorna 4 / 4 hang hallatszott' },
        camera_rear: { status: 'ok', detail: 'élő kép érkezik' },
        camera_front: { status: 'ok', detail: 'élő kép érkezik' },
        display: { status: 'ok', detail: 'az eladó nem látott hibát' },
        buttons: { status: 'ok', detail: 'bekapcsoló/Home és hangerőgombok működnek' }
      },
      sources: {
        model: 'USB-ből', chip: '', memory: '', storage: 'USB-ből', os: 'USB-ből', serial: 'USB-ből',
        cycles: 'USB-ből', capacity: 'USB-ből', condition: '', activationLock: 'USB-ből', mdm: ''
      }
    }
  };
});
