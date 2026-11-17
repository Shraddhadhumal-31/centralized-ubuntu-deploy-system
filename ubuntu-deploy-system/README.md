# Centralized Ubuntu Deployment System for Computer Laboratory

A centralized web-based management dashboard to deploy and monitor Ubuntu operating system images across computer laboratory workstations using the FOG Project API.

---

## 1. Overview

The Ubuntu Deploy System provides lab administrators with an intuitive interface to manage, image, and monitor lab client machines. It integrates directly with an existing FOG Server, eliminating the need to navigate complex FOG menus for standard deployment workflows.

## 2. Architecture

- **Frontend**: React (Vite, TypeScript, Tailwind CSS) single-page application.
- **Backend**: FastAPI (Python 3.10+) REST API serving backend endpoints and compiled static frontend assets.
- **Database**: SQLite (SQLAlchemy) for local deployment logs, audit history, and cache.
- **Integration**: REST communication with the FOG Server API over HTTP/HTTPS.

## 3. Prerequisites

- **Server OS**: Ubuntu Server 20.04 LTS or 22.04 LTS (or compatible Linux distribution)
- **Python**: Python 3.10+ with `python3-venv` and `python3-pip`
- **Node.js**: Node.js 18+ and `npm` (required for build phase)
- **FOG Server**: An existing running FOG Project server (v1.5.x or newer) with network connectivity to lab machines

## 4. Installation

Extract the release archive and execute the installer script:

```bash
# Extract the project
unzip ubuntu-deploy-system.zip
cd ubuntu-deploy-system

# Make scripts executable
chmod +x install.sh start.sh stop.sh status.sh

# Run installer
./install.sh
```

The installer configures the Python virtual environment, installs backend and frontend packages, builds the React frontend, and creates `.env` from `.env.example`.

## 5. Configuration

Before launching the system, configure credentials in `.env`:

1. **Enable FOG API**: In the FOG Web UI, navigate to **FOG Configuration > API System**, enable **API Enabled = Yes**, and save.
2. **System API Token**: Copy the token displayed under API System and set `FOG_API_TOKEN` in `.env`.
3. **User API Token**: Go to **User Management**, select your administrative user, navigate to **API Settings**, generate a token, and set `FOG_USER_TOKEN` in `.env`.
4. **Security & Credentials**: Update `ADMIN_PASSWORD` (dashboard login) and set `JWT_SECRET` to a long, random secret key.
5. **Base URL**: Ensure `FOG_BASE_URL` points to your FOG server (e.g., `http://192.168.50.10/fog`).

Edit the file:
```bash
nano .env
```

## 6. Usage

Manage the background application service via provided shell scripts:

- **Start**: `./start.sh`
- **Check Status**: `./status.sh`
- **Stop**: `./stop.sh`

Once running, access the web dashboard at:
```
http://<server-ip>:8000
```
Default username is `admin` (or as set in `.env`).

## 7. Features

- **Dashboard**: Real-time overview of active deployments, registered hosts, and lab inventory health.
- **Computer Management**: View, filter, and inspect client workstations synced from FOG.
- **Image Deployment**: Deploy images to individual machines or target lab groups.
- **Status Monitoring**: Track active deployment tasks, statuses, and live progress.
- **Wake-on-LAN (WOL)**: Send wake packets directly to target hosts to power them on for deployment.
- **Deployment History**: Complete log of past deployments with target, image, timestamp, and result.

## 8. How Deployment Works

1. **Target & Image Selection**: Administrator selects destination hosts/groups and an OS image in the dashboard.
2. **Confirmation**: A modal prompts for explicit confirmation, preventing accidental deployments.
3. **Task Creation**: FastAPI issues task scheduling requests to the FOG Server REST API.
4. **PXE Boot & Execution**: Workstations boot via PXE network boot (or rebooted via WOL). FOG captures and streams the image.
5. **Status Updates**: The system polls FOG task states and displays live progress in the web interface.

## 9. Safety Measures

- **Protected Master Host**: The master reference host (`MASTER_HOSTNAME`, default `ubuntu-master`) is protected and blocked from deploy operations to prevent accidental overwriting.
- **Explicit Confirmation**: All image deployments require explicit multi-step user confirmation.
- **Non-Destructive Setup**: Installation scripts never schedule or trigger automatic deployments.

## 10. Systemd Service (Optional)

To run Ubuntu Deploy System automatically on system boot:

1. Copy service template:
   ```bash
   sudo cp ubuntu-deploy.service /etc/systemd/system/ubuntu-deploy.service
   ```
2. Edit `/etc/systemd/system/ubuntu-deploy.service` with your actual username and install path:
   ```bash
   sudo nano /etc/systemd/system/ubuntu-deploy.service
   ```
3. Enable and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable ubuntu-deploy
   sudo systemctl start ubuntu-deploy
   ```

## 11. Limitations

- **FOG Server Compatibility**: Developed for FOG Project v1.5.x API specifications; response schemas may vary slightly across FOG custom builds.
- **Progress Reporting**: Live progress bars depend entirely on task percentage data supplied by the FOG API.
- **Wake-on-LAN**: WOL relies on hardware BIOS/UEFI settings and network switch broadcast support.
- **Status Tracking**: State accuracy depends on FOG task queue updates during imaging cycles.

## 12. Troubleshooting

- **FOG API Connection Failed**: Verify FOG API is enabled in **FOG Configuration > API System** and check network connectivity between the deploy system and FOG server.
- **Authentication Error (401/403)**: Confirm both `FOG_API_TOKEN` (system token) and `FOG_USER_TOKEN` (user token) are correctly entered in `.env` without extra whitespace.
- **Dashboard Unreachable**: Check if port `8000` is permitted through the firewall:
  ```bash
  sudo ufw allow 8000/tcp
  ```
- **Inspect Application Logs**:
  ```bash
  tail -f app.log
  ```
