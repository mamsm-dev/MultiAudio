# MultiAudio

پخش همزمان صدا روی چند دستگاه بلوتوثی. Play audio through several Bluetooth devices at once.

## دانلود
خروجی‌ها در تب **Actions** (بخش Artifacts) ساخته می‌شوند. با پوش کردن تگی مثل `v1.0.0` یک Release هم ساخته می‌شود.

| سیستم | فایل | نصب |
|---|---|---|
| Debian / Ubuntu | `.deb` | `sudo apt install ./MultiAudio-*.deb` |
| Fedora | `.rpm` | `sudo dnf install ./MultiAudio-*.rpm` |
| Arch | `.pkg.tar.zst` | `sudo pacman -U MultiAudio-*.pkg.tar.zst` |
| سایر توزیع‌ها | `.AppImage` | `chmod +x` و اجرا |
| Windows | `.exe` یا `.msi` | اجرای فایل |

برنامه هنگام باز شدن، آخرین Release را بررسی می‌کند. برای انتشار نسخه جدید: عدد `version` در `package.json` را بالا ببرید و تگ هم‌نام آن را پوش کنید.

## نحوه کار
- **لینوکس:** با `pactl` یک خروجی ترکیبی (`module-combine-sink`) می‌سازد. روی PulseAudio و PipeWire. بسته `pactl` لازم است (برای AppImage خودتان نصب کنید).
- **تأخیر:** برای هر دستگاه ۰ تا ۵ ثانیه، با امکان غیرفعال کردن. در لینوکس به `pw-loopback` (PipeWire) نیاز دارد.
- **ویندوز:** صدای خروجی پیش‌فرض را دریافت و روی دستگاه‌های دیگر تکرار می‌کند؛ برای هماهنگی، تأخیر هر دستگاه قابل تنظیم است.

تأخیر بلوتوث بین دستگاه‌ها فرق دارد و ممکن است صداها کاملاً همزمان نباشند. فایل‌های ویندوز امضای دیجیتال ندارند.

## توسعه
```bash
npm install
npm start
npm test
```
