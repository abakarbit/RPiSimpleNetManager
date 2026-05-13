from flask import Flask, render_template, request, jsonify
import subprocess
import re
import socket

app = Flask(__name__)

# ── Konfigurasi Interface ─────────────────────────────────────
# Nama koneksi LAN (kabel) — cek dengan: nmcli connection show
LAN_CONNECTION_NAME      = "Wired connection 1"

# Nama koneksi Hotspot Wi-Fi — cek dengan: nmcli connection show
HOTSPOT_CONNECTION_NAME  = "Hotspot"
HOTSPOT_IFACE            = "wlan0"

_IP_RE = re.compile(
    r'^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$'
)


def _validate_ip(ip: str) -> bool:
    return bool(_IP_RE.match(ip))


def _validate_cidr(cidr: str) -> bool:
    try:
        return 0 <= int(cidr) <= 32
    except (ValueError, TypeError):
        return False


def get_lan_status() -> dict:
    try:
        result = subprocess.run(
            ['nmcli', 'connection', 'show', LAN_CONNECTION_NAME],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return {"error": "Koneksi tidak ditemukan", "connected": False}

        output = result.stdout
        data: dict = {"connected": True}

        m = re.search(r'ipv4\.method:\s+(\S+)', output)
        data['method'] = m.group(1) if m else 'auto'

        m = re.search(r'IP4\.ADDRESS\[1\]:\s+(\S+)', output)
        if m:
            parts = m.group(1).split('/')
            data['ip_address'] = parts[0]
            data['prefix'] = parts[1] if len(parts) > 1 else '24'
        else:
            data['ip_address'] = 'N/A'
            data['prefix'] = '24'

        m = re.search(r'IP4\.GATEWAY:\s+(\S+)', output)
        data['gateway'] = m.group(1) if m else 'N/A'

        m = re.search(r'IP4\.DNS\[1\]:\s+(\S+)', output)
        data['dns'] = m.group(1) if m else 'N/A'

        m = re.search(r'GENERAL\.STATE:\s+(.+)', output)
        data['state'] = m.group(1).strip() if m else 'Unknown'

        return data
    except subprocess.TimeoutExpired:
        return {"error": "Timeout saat mengambil status jaringan", "connected": False}
    except Exception as e:
        return {"error": str(e), "connected": False}


def get_hotspot_info() -> dict:
    """Kembalikan status koneksi Hotspot (wlan0 AP)."""
    try:
        result = subprocess.run(
            ['nmcli', 'connection', 'show', HOTSPOT_CONNECTION_NAME],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return {"error": "Hotspot belum dikonfigurasi", "active": False}

        output = result.stdout
        data: dict = {"active": False}

        # Cek apakah hotspot sedang aktif
        state_m = re.search(r'GENERAL\.STATE:\s+(.+)', output)
        state   = state_m.group(1).strip() if state_m else ''
        data['active'] = 'activated' in state.lower()
        data['state']  = state if state else 'inactive'

        # IP hotspot (biasanya 10.42.0.1 atau yg dikonfigurasi)
        ip_m = re.search(r'IP4\.ADDRESS\[1\]:\s+(\S+)', output)
        if ip_m:
            parts = ip_m.group(1).split('/')
            data['ip_address'] = parts[0]
            data['prefix']     = parts[1] if len(parts) > 1 else '24'
        else:
            data['ip_address'] = 'N/A'
            data['prefix']     = '24'

        # SSID
        ssid_m = re.search(r'802-11-wireless\.ssid:\s+(.+)', output)
        data['ssid'] = ssid_m.group(1).strip() if ssid_m else HOTSPOT_CONNECTION_NAME

        # Mode (ap = Access Point)
        mode_m = re.search(r'802-11-wireless\.mode:\s+(\S+)', output)
        data['mode'] = mode_m.group(1) if mode_m else 'ap'

        return data
    except subprocess.TimeoutExpired:
        return {"error": "Timeout saat mengambil status hotspot", "active": False}
    except Exception as e:
        return {"error": str(e), "active": False}


def get_all_interfaces() -> list:
    try:
        result = subprocess.run(
            ['nmcli', '-t', '-f', 'NAME,TYPE,STATE,DEVICE', 'connection', 'show', '--active'],
            capture_output=True, text=True, timeout=10
        )
        interfaces = []
        for line in result.stdout.strip().splitlines():
            parts = line.split(':')
            if len(parts) >= 4:
                interfaces.append({
                    'name':   parts[0],
                    'type':   parts[1],
                    'state':  parts[2],
                    'device': parts[3],
                })
        return interfaces
    except Exception:
        return []


def get_system_info() -> dict:
    info: dict = {}
    try:
        info['hostname'] = socket.gethostname()
    except Exception:
        info['hostname'] = 'Unknown'
    try:
        with open('/proc/uptime', 'r') as f:
            secs = float(f.read().split()[0])
        d, h, m = int(secs // 86400), int((secs % 86400) // 3600), int((secs % 3600) // 60)
        info['uptime'] = f"{d}d {h}h {m}m"
    except Exception:
        info['uptime'] = 'Unknown'
    try:
        r = subprocess.run(['uname', '-r'], capture_output=True, text=True, timeout=5)
        info['kernel'] = r.stdout.strip()
    except Exception:
        info['kernel'] = 'Unknown'
    try:
        r = subprocess.run(['uname', '-m'], capture_output=True, text=True, timeout=5)
        info['arch'] = r.stdout.strip()
    except Exception:
        info['arch'] = 'Unknown'
    return info


# ── Routes ────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/network', methods=['GET'])
def api_get_network():
    return jsonify(get_lan_status())


@app.route('/api/hotspot', methods=['GET'])
def api_get_hotspot():
    return jsonify(get_hotspot_info())


@app.route('/api/interfaces', methods=['GET'])
def api_get_interfaces():
    return jsonify(get_all_interfaces())


@app.route('/api/system', methods=['GET'])
def api_get_system():
    return jsonify(get_system_info())


@app.route('/api/network', methods=['POST'])
def api_set_network():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status": "error", "message": "Request body tidak valid"}), 400

    mode = data.get('mode')
    if mode not in ('dhcp', 'static'):
        return jsonify({"status": "error", "message": "Mode tidak valid"}), 400

    try:
        if mode == 'dhcp':
            subprocess.run(
                ['nmcli', 'connection', 'modify', LAN_CONNECTION_NAME,
                 'ipv4.method', 'auto',
                 'ipv4.addresses', '',
                 'ipv4.gateway', '',
                 'ipv4.dns', ''],
                check=True, capture_output=True, timeout=15
            )
            subprocess.run(
                ['nmcli', 'connection', 'up', LAN_CONNECTION_NAME],
                check=True, capture_output=True, timeout=15
            )
            return jsonify({"status": "success", "message": "Mode DHCP berhasil diaktifkan."})

        # mode == 'static'
        ip      = str(data.get('ip', '')).strip()
        netmask = str(data.get('netmask', '24')).strip()
        gateway = str(data.get('gateway', '')).strip()
        dns     = str(data.get('dns', '8.8.8.8')).strip() or '8.8.8.8'

        if not _validate_ip(ip):
            return jsonify({"status": "error", "message": "Format IP Address tidak valid"}), 400
        if not _validate_cidr(netmask):
            return jsonify({"status": "error", "message": "Prefix CIDR harus antara 0–32"}), 400
        if not _validate_ip(gateway):
            return jsonify({"status": "error", "message": "Format Gateway tidak valid"}), 400
        if not _validate_ip(dns):
            return jsonify({"status": "error", "message": "Format DNS tidak valid"}), 400

        subprocess.run(
            ['nmcli', 'connection', 'modify', LAN_CONNECTION_NAME,
             'ipv4.method',    'manual',
             'ipv4.addresses', f"{ip}/{netmask}",
             'ipv4.gateway',   gateway,
             'ipv4.dns',       dns],
            check=True, capture_output=True, timeout=15
        )
        subprocess.run(
            ['nmcli', 'connection', 'up', LAN_CONNECTION_NAME],
            check=True, capture_output=True, timeout=15
        )
        return jsonify({"status": "success", "message": f"IP Statis {ip}/{netmask} berhasil diterapkan."})

    except subprocess.TimeoutExpired:
        return jsonify({"status": "error", "message": "Timeout saat mengubah konfigurasi"}), 500
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode() if isinstance(e.stderr, bytes) else str(e.stderr)
        return jsonify({"status": "error", "message": f"Gagal mengubah konfigurasi: {err}"}), 500
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    # Host 0.0.0.0 agar bisa diakses dari device lain via Hotspot
    app.run(host='0.0.0.0', port=5000, debug=False)