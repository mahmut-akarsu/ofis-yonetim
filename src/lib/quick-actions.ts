import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Clock,
  Cpu,
  HardDrive,
  Info,
  MemoryStick,
  Monitor,
  Network,
  Printer,
  RefreshCw,
  RotateCw,
  Shield,
  Trash2,
  Users,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react'

export type QuickAction = {
  id: string
  title: string
  description: string
  icon: LucideIcon
  command: string
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'event-errors',
    title: 'Son Sistem Hataları',
    description: 'Son 24 saatteki kritik System log kayıtları',
    icon: AlertTriangle,
    command: `$e = Get-WinEvent -FilterHashtable @{ LogName='System'; Level=2; StartTime=(Get-Date).AddHours(-24) } -MaxEvents 12 -ErrorAction SilentlyContinue; if ($e) { $e | Select-Object TimeCreated, ProviderName, Id | Format-Table -AutoSize | Out-String } else { 'Son 24 saatte kritik sistem hatasi yok.' }`,
  },
  {
    id: 'low-disk',
    title: 'Düşük Disk Uyarısı',
    description: '%85 üzeri dolu sürücüleri listeler',
    icon: HardDrive,
    command: `$w = Get-PSDrive -PSProvider FileSystem | ForEach-Object { $t = $_.Used + $_.Free; if ($t -gt 0) { $p = [math]::Round(100 * $_.Used / $t, 1); if ($p -ge 85) { [PSCustomObject]@{ Surucu = $_.Name; DolulukPct = $p; BosGB = [math]::Round($_.Free / 1GB, 1) } } } }; if ($w) { $w | Format-Table -AutoSize | Out-String } else { 'Kritik doluluk yok (tum suruculer %85 altinda).' }`,
  },
  {
    id: 'pending-reboot',
    title: 'Yeniden Başlatma Gerekli mi?',
    description: 'Güncelleme veya kurulum sonrası reboot bekliyor mu',
    icon: RefreshCw,
    command: `$n = @(); if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') { $n += 'Windows Update' }; if (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending' -ErrorAction SilentlyContinue) { $n += 'Bileşen servisi' }; if (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue) { $n += 'Dosya yeniden adlandirma' }; if ($n) { \"YENIDEN BASLATMA GEREKLI: $($n -join ', ')\" } else { 'Yeniden baslatma gerekmiyor.' }`,
  },
  {
    id: 'critical-services',
    title: 'Kritik Servisler',
    description: 'WinRM, Tailscale, yazıcı, DNS ve güncelleme servisleri',
    icon: Wrench,
    command: `@('WinRM','Tailscale','Spooler','wuauserv','Dnscache','EventLog','LanmanWorkstation') | ForEach-Object { $s = Get-Service $_ -ErrorAction SilentlyContinue; [PSCustomObject]@{ Servis = $_; Durum = if ($s) { $s.Status } else { 'Yuklu degil' } } } | Format-Table -AutoSize | Out-String`,
  },
  {
    id: 'active-sessions',
    title: 'Aktif Oturumlar',
    description: 'Kim oturum açmış, uzak masaüstü var mı',
    icon: Users,
    command: `quser 2>&1 | Out-String`,
  },
  {
    id: 'defender-status',
    title: 'Windows Defender',
    description: 'Koruma açık mı, imza güncel mi',
    icon: Shield,
    command: `try { Get-MpComputerStatus | Select-Object @{N='Servis';E={$_.AMServiceEnabled}}, @{N='GercekZamanli';E={$_.RealTimeProtectionEnabled}}, @{N='ImzaGuncel';E={$_.AntivirusSignatureLastUpdated}}, @{N='SonHizliTarama';E={$_.QuickScanEndTime}} | Format-List | Out-String } catch { \"Defender bilgisi alinamadi: $($_.Exception.Message)\" }`,
  },
  {
    id: 'clean-temp',
    title: 'Temp Temizle',
    description: 'Kullanıcı temp klasörünü boşaltır, kazanılan MB gösterir',
    icon: Trash2,
    command: `$p = $env:TEMP; $before = (Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum; Get-ChildItem $p -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue; $after = (Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum; \"Temp temizlendi: $([math]::Round((($before - $after) / 1MB), 1)) MB bosaltildi.\"`,
  },
  {
    id: 'flush-dns',
    title: 'DNS Önbelleği Temizle',
    description: 'Ağ / site erişim sorunlarında hızlı düzeltme',
    icon: Zap,
    command: `ipconfig /flushdns | Out-String`,
  },
  {
    id: 'restart-spooler',
    title: 'Yazıcı Kuyruğu Yenile',
    description: 'Takılan yazdırma işlerini çözmek için Spooler restart',
    icon: Printer,
    command: `Restart-Service Spooler -Force -ErrorAction Stop; 'Yazici kuyrugu (Spooler) yeniden baslatildi.'`,
  },
  {
    id: 'memory-status',
    title: 'Bellek Durumu',
    description: 'Toplam / boş RAM ve kullanım yüzdesi',
    icon: MemoryStick,
    command: `$o = Get-CimInstance Win32_OperatingSystem; [PSCustomObject]@{ ToplamGB = [math]::Round($o.TotalVisibleMemorySize / 1MB, 1); BosGB = [math]::Round($o.FreePhysicalMemory / 1MB, 1); KullanimPct = [math]::Round(100 * (1 - $o.FreePhysicalMemory / $o.TotalVisibleMemorySize), 1) } | Format-List | Out-String`,
  },
  {
    id: 'disk',
    title: 'Tüm Diskler',
    description: 'Sürücülerin doluluk ve boş alan özeti',
    icon: HardDrive,
    command: `Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N='KullanilanGB';E={[math]::Round($_.Used/1GB,1)}}, @{N='BosGB';E={[math]::Round($_.Free/1GB,1)}}, @{N='DolulukPct';E={if($_.Used+$_.Free -gt 0){[math]::Round(100*$_.Used/($_.Used+$_.Free),1)}else{0}}} | Format-Table -AutoSize | Out-String`,
  },
  {
    id: 'tailscale-ip',
    title: 'Tailscale IP',
    description: 'Uzak PC\'nin mesh ağ adresi',
    icon: Network,
    command: `$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -match 'Tailscale|WireGuard' } | Select-Object -First 1).IPAddress; if ($ip) { \"Tailscale IP: $ip\" } else { 'Tailscale ag arabirimi bulunamadi.' }`,
  },
  {
    id: 'processes',
    title: 'Yoğun Programlar',
    description: 'CPU ve bellekte en üstteki 10 süreç',
    icon: Cpu,
    command: `Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10 Name, @{N='BellekMB';E={[math]::Round($_.WS/1MB,0)}}, CPU | Format-Table -AutoSize | Out-String`,
  },
  {
    id: 'hostname',
    title: 'Bilgisayar Adı',
    description: 'Windows hostname (kayıt için)',
    icon: Monitor,
    command: `hostname`,
  },
  {
    id: 'uptime',
    title: 'Açık Kalma Süresi',
    description: 'Son yeniden başlatmadan bu yana geçen süre',
    icon: Clock,
    command: `(Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime | ForEach-Object { \"Acik sure: $($_.Days) gun, $($_.Hours) saat, $($_.Minutes) dakika\" }`,
  },
  {
    id: 'network',
    title: 'Ağ Adresleri',
    description: 'IPv4 arayüzleri (localhost hariç)',
    icon: Wifi,
    command: `Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' } | Select-Object InterfaceAlias, IPAddress | Format-Table -AutoSize | Out-String`,
  },
  {
    id: 'os-version',
    title: 'Windows Sürümü',
    description: 'İşletim sistemi ve mimari bilgisi',
    icon: Info,
    command: `Get-ComputerInfo | Select-Object WindowsProductName, OsVersion, OsArchitecture | Format-List | Out-String`,
  },
  {
    id: 'clear-recycle',
    title: 'Çöp Kutusunu Boşalt',
    description: 'Geri dönüşüm kutusundaki dosyaları siler',
    icon: Trash2,
    command: `Clear-RecycleBin -Force -ErrorAction SilentlyContinue; 'Cop kutusu bosaltildi.'`,
  },
  {
    id: 'restart-pc',
    title: 'PC Yeniden Başlat',
    description: 'Hemen yeniden başlatır — kaydedilmemiş işler kapanır',
    icon: RotateCw,
    command: `Restart-Computer -Force`,
  },
]
