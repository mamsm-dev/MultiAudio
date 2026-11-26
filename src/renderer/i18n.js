'use strict';
window.I18N = {
  fa: {
    showAll: 'نمایش همه خروجی‌ها', refresh: 'بازخوانی', start: 'شروع پخش همزمان', stop: 'توقف',
    dark: 'تیره', light: 'روشن', other: 'English', volume: 'صدا', delay: 'تأخیر', ms: 'ms',
    empty: 'دستگاه بلوتوثی پیدا نشد. دستگاه را وصل کنید و «بازخوانی» را بزنید.',
    pick: 'دست‌کم دو دستگاه انتخاب کنید.', ready: 'آماده پخش', playing: 'در حال پخش همزمان',
    defaultOut: 'خروجی پیش‌فرض ویندوز',
    winNote: 'در ویندوز، صدای خروجی پیش‌فرض روی بقیه دستگاه‌های انتخاب‌شده تکرار می‌شود. خروجی پیش‌فرض همیشه پخش می‌کند. برای هماهنگ شدن صداها، تأخیر دستگاه‌های جلوتر را زیاد کنید.',
    NEED_TWO: 'دست‌کم دو دستگاه متصل لازم است.',
    PACTL_MISSING: 'دستور pactl پیدا نشد. بسته pulseaudio-utils (در آرچ: libpulse) را نصب کنید.',
    NO_AUDIO: 'صدای سیستم قابل دریافت نیست.', NO_TARGET: 'دستگاهی غیر از خروجی پیش‌فرض انتخاب کنید.',
    CHANGED: 'دستگاه‌ها تغییر کردند؛ پخش متوقف شد.', failed: 'خطا',
  },
  en: {
    showAll: 'Show all outputs', refresh: 'Refresh', start: 'Start playing on all', stop: 'Stop',
    dark: 'Dark', light: 'Light', other: 'فارسی', volume: 'Volume', delay: 'Delay', ms: 'ms',
    empty: 'No Bluetooth device found. Connect one, then press Refresh.',
    pick: 'Select at least two devices.', ready: 'Ready', playing: 'Playing on all selected devices',
    defaultOut: 'Windows default output',
    winNote: 'On Windows, the default output is mirrored to the other selected devices. The default output always plays. To line devices up, add delay to the ones that are ahead.',
    NEED_TWO: 'At least two connected devices are needed.',
    PACTL_MISSING: 'pactl was not found. Install pulseaudio-utils (Arch: libpulse).',
    NO_AUDIO: 'System audio could not be captured.', NO_TARGET: 'Select a device other than the default output.',
    CHANGED: 'Devices changed, so playback stopped.', failed: 'Error',
  },
};
