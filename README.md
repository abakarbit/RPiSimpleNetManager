# RPi Network Manager — Setup Guide

Web interface untuk konfigurasi jaringan LAN Raspberry Pi, diakses melalui hotspot Wi-Fi bawaan Raspberry Pi.

---

## Arsitektur Jaringan

```
┌──────────────────┐        Wi-Fi (AP)        ┌──────────────────────────────────────┐
│  Laptop / HP     │ ◄──────────────────────► │         Raspberry Pi                 │
│  (browser)       │   SSID: RaspiConfig       │  wlan0  ←→  [Web App :5000]  ←→ eth0│
└──────────────────┘   IP: 192.168.4.x         └──────────────────────────────────────┘
                                                                               │
                                                                               │ Kabel LAN
                                                                               ▼
                                                                    ┌──────────────────┐
                                                                    │  Router / Switch  │
                                                                    │  (Internet/LAN)   │
                                                                    └──────────────────┘
```

**Alur kerja:**
1. Raspberry Pi membuat hotspot Wi-Fi (`wlan0` → mode Access Point)
2. User menyambungkan perangkat (laptop/HP) ke hotspot tersebut
3. User membuka browser → `http://192.168.4.1:5000`
4. Melalui web interface, user mengkonfigurasi interface LAN (`eth0`)
5. Raspberry Pi menerapkan perubahan ke NetworkManager

---

## Prasyarat

| Komponen | Versi |
|---|---|
| Raspberry Pi OS | Bookworm (64-bit) atau Bullseye |
| NetworkManager | ≥ 1.30 (sudah termasuk di Raspberry Pi OS terbaru) |
| Python | ≥ 3.9 |
| pip | ≥ 22 |

Pastikan **NetworkManager** aktif (bukan `dhcpcd`):
```bash
sudo systemctl status NetworkManager
# Jika belum aktif:
sudo systemctl enable --now NetworkManager
```

---

## Tahap 1 — Nonaktifkan dhcpcd (jika masih aktif)

Raspberry Pi OS lama menggunakan `dhcpcd`. NetworkManager dan dhcpcd tidak boleh berjalan bersamaan.

```bash
sudo systemctl disable --now dhcpcd
sudo systemctl enable --now NetworkManager
sudo reboot
```

---

## Tahap 2 — Konfigurasi Hotspot Wi-Fi (wlan0)

Kita buat koneksi Wi-Fi Access Point menggunakan NetworkManager. Mode `ipv4.method shared` secara otomatis mengaktifkan DHCP server bawaan NM dan IP forwarding.

```bash
# Buat koneksi hotspot
sudo nmcli connection add \
    type wifi \
    ifname wlan0 \
    con-name "Hotspot" \
    autoconnect yes \
    ssid "RaspiConfig"

# Set sebagai Access Point + IP statis + DHCP shared
sudo nmcli connection modify "Hotspot" \
    802-11-wireless.mode ap \
    802-11-wireless.band bg \
    ipv4.method shared \
    ipv4.addresses 192.168.4.1/24

# Set password Wi-Fi
sudo nmcli connection modify "Hotspot" \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "raspi1234"

# Aktifkan hotspot
sudo nmcli connection up "Hotspot"
```

**Verifikasi:**
```bash
nmcli connection show "Hotspot"
ip addr show wlan0
# Harus menampilkan: inet 192.168.4.1/24
```

> **Catatan SSID & Password:** Ganti `RaspiConfig` dan `raspi1234` sesuai kebutuhan.  
> Password minimal 8 karakter.

---

## Tahap 3 — Cek Nama Koneksi LAN

```bash
nmcli connection show
```

Catat nama koneksi untuk interface `eth0` (biasanya `"Wired connection 1"`).  
Jika berbeda, update baris berikut di `app.py`:

```python
LAN_CONNECTION_NAME     = "Wired connection 1"   # <-- sesuaikan
HOTSPOT_CONNECTION_NAME = "Hotspot"               # <-- sesuaikan
```

---

## Tahap 4 — Install Dependensi Python

```bash
cd /home/pi/raspi_simpel_network_manager

# Buat virtual environment (opsional tapi dianjurkan)
python3 -m venv venv
source venv/bin/activate

# Install Flask
pip install flask
```

---

## Tahap 5 — Jalankan Web Server (Manual)

```bash
# Pastikan dijalankan sebagai root atau user dengan akses nmcli
sudo python3 app.py
```

Atau dengan virtual environment:
```bash
sudo /home/pi/raspi_simpel_network_manager/venv/bin/python app.py
```

Buka browser dari perangkat yang terhubung ke hotspot:
```
http://192.168.4.1:5000
```

---

## Tahap 6 — Autostart sebagai Systemd Service

Agar web server otomatis berjalan saat Raspberry Pi dinyalakan:

### 6.1 Buat file service

```bash
sudo nano /etc/systemd/system/rpi-netmanager.service
```

Isi dengan:

```ini
[Unit]
Description=RPi Network Manager Web Interface
After=network.target NetworkManager.service
Wants=NetworkManager.service

[Service]
Type=simple
User=root
WorkingDirectory=/home/pi/raspi_simpel_network_manager
ExecStart=/home/pi/raspi_simpel_network_manager/venv/bin/python app.py
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

> Sesuaikan path `WorkingDirectory` dan `ExecStart` dengan lokasi instalasi Anda.

### 6.2 Aktifkan service

```bash
sudo systemctl daemon-reload
sudo systemctl enable rpi-netmanager.service
sudo systemctl start rpi-netmanager.service

# Cek status
sudo systemctl status rpi-netmanager.service
```

### 6.3 Lihat log

```bash
sudo journalctl -u rpi-netmanager.service -f
```

---

## Tahap 7 — Izin nmcli untuk User Non-root (Opsional)

Jika tidak ingin menjalankan sebagai root, berikan izin PolicyKit:

```bash
sudo nano /etc/polkit-1/localauthority/50-local.d/nmcli-allow.pkla
```

Isi:
```ini
[Allow nmcli for pi]
Identity=unix-user:pi
Action=org.freedesktop.NetworkManager.*
ResultAny=yes
ResultInactive=yes
ResultActive=yes
```

```bash
sudo systemctl restart polkit
```

---

## Referensi Perintah nmcli

```bash
# Lihat semua koneksi
nmcli connection show

# Lihat detail koneksi tertentu
nmcli connection show "Wired connection 1"

# Lihat status interface
nmcli device status

# Set LAN ke DHCP
sudo nmcli connection modify "Wired connection 1" ipv4.method auto
sudo nmcli connection up "Wired connection 1"

# Set LAN ke Static
sudo nmcli connection modify "Wired connection 1" \
    ipv4.method manual \
    ipv4.addresses 192.168.1.100/24 \
    ipv4.gateway  192.168.1.1 \
    ipv4.dns      8.8.8.8
sudo nmcli connection up "Wired connection 1"

# Restart hotspot
sudo nmcli connection down "Hotspot" && sudo nmcli connection up "Hotspot"
```

---

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Hotspot tidak muncul di daftar Wi-Fi | Jalankan `sudo nmcli connection up "Hotspot"` |
| Web interface tidak bisa diakses | Pastikan firewall tidak memblokir port 5000: `sudo ufw allow 5000` |
| `nmcli: command not found` | Install: `sudo apt install network-manager` |
| LAN tidak mendapat IP setelah DHCP | `sudo nmcli connection down "Wired connection 1" && sudo nmcli connection up "Wired connection 1"` |
| Service gagal start | Cek log: `sudo journalctl -u rpi-netmanager.service -n 50` |
| wlan0 tidak support AP mode | Cek dengan `iw list | grep -A 10 "Supported interface modes"` — harus ada `AP` |

---

## Struktur Proyek

```
raspi_simpel_network_manager/
├── app.py              # Backend Flask (API + routing)
├── templates/
│   └── index.html      # UI utama (3 tab: Ikhtisar, Konfigurasi, Sistem)
├── static/
│   ├── style.css       # Dark theme, responsive
│   └── script.js       # Logic frontend, validasi, fetch API
└── README.md           # Panduan ini
```
