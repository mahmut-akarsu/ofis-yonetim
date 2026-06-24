import type { LucideIcon } from 'lucide-react'
import {
  HardDrive,
  Monitor,
  Cpu,
  Info,
  User,
  Wifi,
  Clock,
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
    id: 'hostname',
    title: 'Bilgisayar Adı',
    description: 'PC adını gösterir',
    icon: Monitor,
    command: 'hostname',
  },
  {
    id: 'disk',
    title: 'Disk Durumu',
    description: 'Disklerin doluluk oranını kontrol eder',
    icon: HardDrive,
    command:
      'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N="KullanilanGB";E={[math]::Round($_.Used/1GB,1)}}, @{N="BosGB";E={[math]::Round($_.Free/1GB,1)}} | Format-Table -AutoSize | Out-String',
  },
  {
    id: 'processes',
    title: 'Çalışan Programlar',
    description: 'En çok kaynak kullanan 10 program',
    icon: Cpu,
    command:
      'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, CPU, @{N="BellekMB";E={[math]::Round($_.WS/1MB,0)}} | Format-Table -AutoSize | Out-String',
  },
  {
    id: 'os-version',
    title: 'Windows Sürümü',
    description: 'İşletim sistemi bilgisini gösterir',
    icon: Info,
    command:
      'Get-ComputerInfo | Select-Object WindowsProductName, OsVersion, OsArchitecture | Format-List | Out-String',
  },
  {
    id: 'logged-user',
    title: 'Aktif Kullanıcı',
    description: 'Şu an oturum açmış kullanıcıyı gösterir',
    icon: User,
    command:
      'Get-CimInstance Win32_ComputerSystem | Select-Object UserName | Format-List | Out-String',
  },
  {
    id: 'uptime',
    title: 'Açık Kalma Süresi',
    description: 'PC ne kadar süredir açık',
    icon: Clock,
    command:
      '(Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime | Select-Object @{N="AcikSure";E={"{0} gun, {1} saat, {2} dakika" -f $_.Days, $_.Hours, $_.Minutes}} | Format-List | Out-String',
  },
  {
    id: 'network',
    title: 'Ağ Bağlantısı',
    description: 'IP adresi ve ağ durumu',
    icon: Wifi,
    command:
      'Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" } | Select-Object InterfaceAlias, IPAddress | Format-Table -AutoSize | Out-String',
  },
]
