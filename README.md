# Ofis Yönetim

Ofisteki Windows bilgisayarları Tailscale üzerinden tek merkezden yönetmek için yerel uygulama. PC listesi, hızlı işlemler, dosya gönderme ve özel PowerShell komutları.

**Gereksinim:** Node.js 20+, Windows 10/11, Tailscale.

## Kurulum ve çalıştırma

```bash
cd ofis-yonetim
npm install
npm run start
```

- Arayüz: `http://localhost:1420`
- API: `http://127.0.0.1:9876`
- Kapatmak için terminalde `Ctrl+C`

> **Önemli:** `TrustedHosts` güncellemesi için terminali **Yönetici olarak** açıp `npm run start` çalıştırın. PC eklediğinizde Tailscale IP otomatik eklenir.

## Yönetim PC (bir kez)

**Yönetici PowerShell** ile:

```powershell
Start-Service WinRM
Set-Service WinRM -StartupType Automatic
```

Uygulamada **Kimlik Bilgileri** → `ofisadmin` ve `GucluSifre123!` (**bir kez**).

## Yeni PC ekleme

### 1. Hedef PC — tek tık kurulum (her bilgisayarda bir kez)

`scripts` klasöründeki **`hedef-pc-kurulum.bat`** dosyasına çift tıklayın (yönetici izni isteyecektir).

Manuel kurulum isterseniz:

```powershell
Enable-PSRemoting -Force
Start-Service WinRM
Set-Service WinRM -StartupType Automatic

New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System `
  -Name LocalAccountTokenFilterPolicy -Value 1 -PropertyType DWord -Force

New-LocalUser -Name "ofisadmin" -Password (ConvertTo-SecureString "GucluSifre123!" -AsPlainText -Force)
Add-LocalGroupMember -Group "Administrators" -Member "ofisadmin"
Add-LocalGroupMember -Group "Uzaktan Yönetim Kullanıcıları" -Member "ofisadmin"

hostname   # bilgisayar adını not edin
```

Ağ **Genel** ise ağı **Özel** yapın veya güvenlik duvarında 5985 portunu açın.

### 2. Uygulamada PC kaydı

Sol panel → **+**:

| Alan | Örnek |
|------|--------|
| Ad | `PC-8` |
| Bilgisayar adı | `DESKTOP-CNT8` |
| Tailscale IP | `100.x.x.x` |

Kaydettiğinizde **TrustedHosts otomatik güncellenir** — PowerShell ile IP eklemeniz gerekmez.

## Günlük kullanım

1. PC'leri seçin
2. Hızlı işlem / dosya gönder / özel komut
3. Sonuçlar sağ panelde

## Sorun giderme

| Hata | Çözüm |
|------|--------|
| TrustedHosts güncellenemedi | `npm run start`'ı **yönetici** terminalde çalıştırın |
| Erişim engellendi | Hedef PC'de `LocalAccountTokenFilterPolicy=1`, `ofisadmin` yöneticilerde |
| Yerel API'ye bağlanılamadı | `npm run start` çalışıyor mu? |

Log: `%USERPROFILE%\.ofis-yonetim\logs\api.log`

## Dosyalar

| Dosya | İçerik |
|-------|--------|
| `managed_pcs.json` | PC listesi |
| `winrm_credentials.json` | WinRM kimlik bilgisi |

## Lisans

MIT
