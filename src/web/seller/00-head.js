// Az eladói varázsló. Független az átvételi oldal USB-s folyamatától (receiver/app.js).
// A webes tesztek külön riportja a végén, beleegyezés után megy el. A reader a USB-riportot korábban küldi.
// Felépítés: minden képernyő egy lépés (SCREENS). A megtett út (state.path, state.idx) a sessionStorage-ban és a
// böngésző előzményeiben is megvan, ezért a Vissza gomb és a böngésző Vissza gombja is ugyanazt csinálja.
(function () {
  'use strict';

  var P = window.SellerParse;
  var app = document.getElementById('app');
  var hash = (location.hash || '').replace('#', '').trim().toUpperCase();
  var DEMO = /^DEMO(-|$)/.test(hash);
  var DEMO_ID = /^DEMO-/.test(hash) ? hash.slice(5).toLowerCase() : '';
  var CODE_PATTERN = /^(?:[0-9]{9}|[0-9A-Z]{12})$/;
  var inviteHash = hash.match(/^([0-9]{9}|[0-9A-Z]{12})(?:\.([0-9A-F]{32}))?$/);
  var CODE = inviteHash ? inviteHash[1] : '';
  var LINK_SID = inviteHash && inviteHash[2] ? inviteHash[2] : '';
  var usbDelivery = window.USB_READER_DATA || {};
  if (CODE_PATTERN.test(usbDelivery.code || '')) CODE = usbDelivery.code;
  var MAX_FILE = 50 * 1024 * 1024;
  var LOCAL_USB_KEY = 'ipad-audit-local-usb';
  var localUsbBlock = window.USB_READER_BLOCK || '';
  try {
    if (localUsbBlock) sessionStorage.setItem(LOCAL_USB_KEY, localUsbBlock);
    else localUsbBlock = sessionStorage.getItem(LOCAL_USB_KEY) || '';
  } catch (e) { /* a helyi adatok mentés nélkül is használhatók */ }
  window.USB_READER_BLOCK = undefined;
  window.USB_READER_DATA = undefined;

  // Melyik gépen nyitották meg az oldalt: az eladandó iOS eszközön, vagy egy számítógépen?
  var DEVICE = P.detectOs(navigator.userAgent, navigator.maxTouchPoints || 0);
  var ON_COMPUTER = !DEVICE;
  var FORCE_OS = ''; // csak a próbaüzem állítja
  function computerOs() {
    if (FORCE_OS) return FORCE_OS;
    var ua = navigator.userAgent;
    if (/Windows/.test(ua)) return 'windows';
    if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
    if (/Linux|X11/.test(ua)) return 'linux';
    return '';
  }
  // A letölthető kiolvasó programok fájlnevei. A USB_TOOL_URL (config.js) a letöltési mappa címe, / jellel a végén.
  var TOOL_FILES = {
    windows: [['ipad-audit-reader-windows-x86_64.exe', 'Windows, egyetlen fájl'],
      ['ipad-audit-reader-windows-x86_64-folder.zip', 'Windows, mappa (ha a vírusirtó jelez)']],
    mac: [['ipad-audit-reader-macos-arm64.tar.gz', 'Mac Apple chippel (M1 és újabb)'],
      ['ipad-audit-reader-macos-x86_64.tar.gz', 'Mac Intel processzorral']],
    linux: [['ipad-audit-reader-linux-x86_64.tar.gz', 'Linux']]
  };
  // A letöltési mappa: a GitHub release legfrissebb kiadása. A config.js-ben a USB_TOOL_URL felülírhatja.
  var TOOL_BASE = window.USB_TOOL_URL || 'https://github.com/krisz0722/ipad-audit/releases/latest/download/';
  function pageAddress() {
    return location.origin + location.pathname + (DEMO ? '#DEMO' : (CODE ? '#' + CODE + (state.auditSid ? '.' + state.auditSid : '') : ''));
  }

  // Csak olvas, nem ír, nem csatlakozik a hálózatra. A profiles kimenetéből csak a két igen/nem sor jön át,
  // mert a teljes kimenet a felügyeleti szerver címét is tartalmazhatja.
  var MAC_COMMAND =
    "sw_vers -productVersion; " +
    "system_profiler -xml SPHardwareDataType | grep -A1 -E '<key>(machine_name|machine_model|chip_type|cpu_type|physical_memory|serial_number|activation_lock_status)</key>'; " +
    "system_profiler -xml SPPowerDataType | grep -A1 -E '<key>(sppower_battery_cycle_count|sppower_battery_health|sppower_battery_health_maximum_capacity)</key>'; " +
    "profiles status -type enrollment | grep -E 'Enrolled via DEP|MDM enrollment'; " +
    "df -k /System/Volumes/Data | tail -1";

  var state = {
    step: 'welcome', path: ['welcome'], idx: 0,
    osFamily: '', detectedOs: '',
    kind: '', route: '',
    vals: { model: '', storage: '', os: '', memory: '', chip: '', serial: '', cycles: '', capacity: '' },
    parsed: {},
    extra: { condition: '', fileDate: '', activationLock: '', dep: null, mdm: null, modelId: '' },
    shareSerial: true, apple: '', sid: '', sending: false, sent: false, noLog: false, demoSections: null,
    hw: {}, hwSkipped: false
  };
  state.auditSid = LINK_SID;
  state.auditSeq = 0;
  state.auditQueue = [];
  state.auditActive = false;
  state.auditConsent = false;
  state.auditSource = LINK_SID ? 'reader' : '';
  state.auditEmailRequested = false;

  var SCREENS = {};

