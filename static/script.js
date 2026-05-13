'use strict';

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    fetchHotspot();
    fetchStatus();
    loadSystemInfo();
    loadInterfaces();
});

// ── Tab Navigation ────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
}

// ── Mode Toggle ───────────────────────────────────────────────
let currentMode = 'dhcp';

function setMode(mode) {
    currentMode = mode;
    document.getElementById('btn-dhcp').classList.toggle('active', mode === 'dhcp');
    document.getElementById('btn-static').classList.toggle('active', mode === 'static');
    document.getElementById('static-fields').classList.toggle('hidden', mode === 'dhcp');
    document.getElementById('dhcp-info').classList.toggle('hidden', mode === 'static');
}

// ── Helpers ───────────────────────────────────────────────────
function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function validateIP(ip) {
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
    return ip.split('.').every(n => +n >= 0 && +n <= 255);
}

// ── Fetch Hotspot Status ──────────────────────────────────────
async function fetchHotspot() {
    try {
        const res  = await fetch('/api/hotspot');
        const data = await res.json();
        renderHotspot(data);
    } catch {
        document.getElementById('hotspotCardBody').innerHTML =
            '<div class="loading-state" style="color:var(--error)">Gagal memuat status hotspot</div>';
    }
}

function renderHotspot(data) {
    const badge = document.getElementById('hotspotBadge');
    const body  = document.getElementById('hotspotCardBody');

    if (data.error) {
        badge.className    = 'badge badge-manual';
        badge.innerHTML    = '<i class="fas fa-circle-xmark"></i> Tidak Aktif';
        body.innerHTML     = `
            <div style="text-align:center;padding:16px;color:var(--text-muted)">
                <i class="fas fa-wifi" style="font-size:1.8rem;display:block;margin-bottom:8px;opacity:.3"></i>
                <p>${esc(data.error)}</p>
                <small>Ikuti langkah setup di README untuk mengaktifkan hotspot.</small>
            </div>`;
        return;
    }

    if (data.active) {
        badge.className = 'badge badge-ok';
        badge.innerHTML = '<i class="fas fa-circle-check"></i> Aktif';
    } else {
        badge.className = 'badge badge-manual';
        badge.innerHTML = '<i class="fas fa-circle-xmark"></i> Tidak Aktif';
    }

    body.innerHTML = `
        <div class="status-table">
            <div class="status-row">
                <span class="status-key"><i class="fas fa-broadcast-tower"></i> SSID</span>
                <span class="status-val">${esc(data.ssid)}</span>
            </div>
            <div class="status-row">
                <span class="status-key"><i class="fas fa-globe"></i> IP Hotspot</span>
                <span class="status-val">${esc(data.ip_address)}/${esc(data.prefix)}</span>
            </div>
            <div class="status-row">
                <span class="status-key"><i class="fas fa-signal"></i> Mode</span>
                <span class="status-val">${esc(data.mode).toUpperCase()}</span>
            </div>
            <div class="status-row">
                <span class="status-key"><i class="fas fa-circle-info"></i> Status</span>
                <span class="status-val">${esc(data.state)}</span>
            </div>
        </div>
        <div class="info-banner" style="margin-top:14px;margin-bottom:0">
            <i class="fas fa-circle-info"></i>
            <div>
                <strong>Cara Akses Web Interface</strong>
                <p>Sambungkan perangkat Anda ke Wi-Fi <strong>${esc(data.ssid)}</strong>, lalu buka browser ke <strong>http://${esc(data.ip_address)}:5000</strong></p>
            </div>
        </div>`;
}

// ── Fetch Network Status ──────────────────────────────────────
async function fetchStatus() {
    try {
        const res  = await fetch('/api/network');
        const data = await res.json();
        renderStatus(data);
    } catch {
        renderStatusError();
    }
}

function refreshStatus() {
    const icon = document.getElementById('refreshIcon');
    icon.classList.add('fa-spin');
    fetchStatus().finally(() => setTimeout(() => icon.classList.remove('fa-spin'), 800));
}

function renderStatus(data) {
    const dot  = document.getElementById('globalStatusDot');
    const txt  = document.getElementById('globalStatusText');
    const body = document.getElementById('statusCardBody');
    const grid = document.getElementById('infoGrid');

    if (data.error) {
        dot.className = 'status-dot disconnected';
        txt.textContent = 'Tidak Terhubung';
        body.innerHTML = `
            <div style="text-align:center;padding:20px;color:var(--error)">
                <i class="fas fa-circle-exclamation" style="font-size:2rem;display:block;margin-bottom:10px"></i>
                <p>${esc(data.error)}</p>
                <small style="color:var(--text-muted)">Periksa koneksi LAN &amp; konfigurasi NetworkManager</small>
            </div>`;
        grid.innerHTML = '';
        return;
    }

    const hasIP = data.ip_address && data.ip_address !== 'N/A';
    dot.className = `status-dot ${hasIP ? 'connected' : 'disconnected'}`;
    txt.textContent = hasIP ? data.ip_address : 'Tidak ada IP';

    const badge = data.method === 'manual'
        ? `<span class="badge badge-manual"><i class="fas fa-map-pin"></i> Static</span>`
        : `<span class="badge badge-auto"><i class="fas fa-magic"></i> DHCP</span>`;

    body.innerHTML = `
        <div class="status-table">
            <div class="status-row">
                <span class="status-key"><i class="fas fa-tag"></i> Mode IP</span>
                <span class="status-val">${badge}</span>
            </div>
            <div class="status-row">
                <span class="status-key"><i class="fas fa-globe"></i> IP Address</span>
                <span class="status-val">${esc(data.ip_address)}</span>
            </div>
            <div class="status-row">
                <span class="status-key"><i class="fas fa-door-open"></i> Gateway</span>
                <span class="status-val">${esc(data.gateway)}</span>
            </div>
            <div class="status-row">
                <span class="status-key"><i class="fas fa-server"></i> DNS</span>
                <span class="status-val">${esc(data.dns)}</span>
            </div>
        </div>`;

    grid.innerHTML = `
        <div class="info-card">
            <div class="info-card-icon"><i class="fas fa-globe"></i></div>
            <div class="info-card-label">IP Address</div>
            <div class="info-card-value">${esc(data.ip_address)}</div>
        </div>
        <div class="info-card">
            <div class="info-card-icon"><i class="fas fa-door-open"></i></div>
            <div class="info-card-label">Gateway</div>
            <div class="info-card-value">${esc(data.gateway)}</div>
        </div>
        <div class="info-card">
            <div class="info-card-icon"><i class="fas fa-sitemap"></i></div>
            <div class="info-card-label">Prefix</div>
            <div class="info-card-value">/${esc(data.prefix || '—')}</div>
        </div>
        <div class="info-card">
            <div class="info-card-icon"><i class="fas fa-server"></i></div>
            <div class="info-card-label">DNS Server</div>
            <div class="info-card-value">${esc(data.dns)}</div>
        </div>`;

    // Pre-fill config form
    if (data.method === 'manual') {
        setMode('static');
        document.getElementById('ip').value      = data.ip_address !== 'N/A' ? data.ip_address : '';
        document.getElementById('netmask').value = data.prefix || '24';
        document.getElementById('gateway').value = data.gateway !== 'N/A' ? data.gateway : '';
        document.getElementById('dns').value     = data.dns !== 'N/A' ? data.dns : '';
    } else {
        setMode('dhcp');
    }
}

function renderStatusError() {
    document.getElementById('globalStatusDot').className = 'status-dot disconnected';
    document.getElementById('globalStatusText').textContent = 'Error';
    document.getElementById('statusCardBody').innerHTML =
        '<div class="loading-state" style="color:var(--error)">Gagal terhubung ke server</div>';
}

// ── Form Submit ───────────────────────────────────────────────
async function handleSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');

    const payload = { mode: currentMode };

    if (currentMode === 'static') {
        const ip      = document.getElementById('ip').value.trim();
        const netmask = document.getElementById('netmask').value.trim();
        const gateway = document.getElementById('gateway').value.trim();
        const dns     = document.getElementById('dns').value.trim() || '8.8.8.8';

        // Client-side validation
        const checks = [
            [!validateIP(ip),                   'ip',      'Format IP Address tidak valid'],
            [!netmask || +netmask < 0 || +netmask > 32, 'netmask', 'Prefix CIDR harus antara 0–32'],
            [!validateIP(gateway),              'gateway', 'Format Gateway tidak valid'],
            [dns && !validateIP(dns),           'dns',     'Format DNS tidak valid'],
        ];
        for (const [fail, id, msg] of checks) {
            if (fail) {
                document.getElementById(id).classList.add('is-error');
                showToast(msg, 'error');
                return;
            }
            document.getElementById(id).classList.remove('is-error');
        }

        payload.ip = ip; payload.netmask = netmask;
        payload.gateway = gateway; payload.dns = dns;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menerapkan…';

    try {
        const res    = await fetch('/api/network', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const result = await res.json();

        if (result.status === 'success') {
            showToast(result.message, 'success');
            setTimeout(fetchStatus, 2500);
        } else {
            showToast(result.message, 'error');
        }
    } catch {
        showToast('Gagal menghubungi server', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Simpan &amp; Terapkan';
    }
}

// ── System Info ───────────────────────────────────────────────
async function loadSystemInfo() {
    try {
        const res  = await fetch('/api/system');
        const data = await res.json();
        document.getElementById('systemInfoBody').innerHTML = `
            <div class="sys-info-list">
                <div class="sys-info-row">
                    <span class="sys-info-label"><i class="fas fa-tag"></i> Hostname</span>
                    <span class="sys-info-value">${esc(data.hostname)}</span>
                </div>
                <div class="sys-info-row">
                    <span class="sys-info-label"><i class="fas fa-clock"></i> Uptime</span>
                    <span class="sys-info-value">${esc(data.uptime)}</span>
                </div>
                <div class="sys-info-row">
                    <span class="sys-info-label"><i class="fas fa-code-branch"></i> Kernel</span>
                    <span class="sys-info-value">${esc(data.kernel)}</span>
                </div>
                <div class="sys-info-row">
                    <span class="sys-info-label"><i class="fas fa-microchip"></i> Arsitektur</span>
                    <span class="sys-info-value">${esc(data.arch)}</span>
                </div>
            </div>`;
    } catch {
        document.getElementById('systemInfoBody').innerHTML =
            '<p style="color:var(--error);padding:10px">Gagal memuat info sistem</p>';
    }
}

// ── Interfaces ────────────────────────────────────────────────
async function loadInterfaces() {
    try {
        const res  = await fetch('/api/interfaces');
        const list = await res.json();
        const body = document.getElementById('interfacesBody');

        if (!list.length) {
            body.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px">Tidak ada antarmuka aktif</p>';
            return;
        }
        body.innerHTML = `<div class="iface-list">${
            list.map(i => `
                <div class="iface-item">
                    <div>
                        <div class="iface-name">${esc(i.name)}</div>
                        <div class="iface-detail">${esc(i.type)} · ${esc(i.state)}</div>
                    </div>
                    <div class="iface-device">${esc(i.device)}</div>
                </div>`).join('')
        }</div>`;
    } catch {
        document.getElementById('interfacesBody').innerHTML =
            '<p style="color:var(--error);padding:10px">Gagal memuat antarmuka</p>';
    }
}

// ── Toast ─────────────────────────────────────────────────────
let _toastTimer = null;

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    document.getElementById('toastIcon').className =
        `fas fa-${type === 'success' ? 'circle-check' : 'circle-xmark'}`;
    document.getElementById('toastMsg').textContent = message;
    toast.className = `toast t-${type} show`;

    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3500);
}
