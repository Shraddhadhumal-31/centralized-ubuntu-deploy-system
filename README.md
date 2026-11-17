# Centralized Ubuntu Deployment System for Computer Laboratory

> **B.Tech Final Year Capstone Project**  
> **Department of Computer Science & Engineering**  
> **D. Y. Patil College of Engineering & Technology, Kolhapur**  
> **Academic Year: 2026–2027 | Project Group: G-35**  

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%2018-61DAFB.svg?style=flat&logo=react)](https://react.dev)
[![Ubuntu](https://img.shields.io/badge/Server-Ubuntu%2024.04%20LTS-E95420.svg?style=flat&logo=ubuntu)](https://ubuntu.com)
[![FOG Project](https://img.shields.io/badge/Cloning%20Engine-FOG%20Project%201.5.10-blue.svg)](https://fogproject.org)
[![License](https://img.shields.io/badge/License-Academic-green.svg)]()

---

## 📌 1. Project Abstract & Overview

Managing software environments across dozens of computer laboratory workstations is a time-consuming and labor-intensive task for educational institutions. Traditional approaches rely on installing operating systems and laboratory packages manually using individual bootable USB drives on each PC, leading to inconsistent configurations, hours of downtime, and high administrative overhead.

The **Centralized Ubuntu Deployment System** solves this challenge by providing an automated, network-based cloning and computer laboratory management platform. Utilizing **PXE (Preboot Execution Environment)** network booting, **FOG Project 1.5.10**, and a modern **React + FastAPI management dashboard**, the system allows laboratory administrators to:
- Capture standardized **Golden Master OS Images** from a reference PC.
- Deploy customized Ubuntu operating systems simultaneously to client workstations over Gigabit LAN in minutes.
- Monitor cloning progress, transfer speeds, and workstation statuses in real time.
- Safeguard the golden master machine from accidental drive overwrites.

---

## 🏗️ 2. System Architecture

<div align="center">
  <img src="docs/architecture-diagram.jpg" alt="System Architecture Diagram" width="850"/>
  <p><em>Figure: Centralized Ubuntu Deployment System Architecture</em></p>
</div>

The system architecture consists of four primary tiers:
1. **Administrator & Web Dashboard**: The administrator accesses the intuitive React-based Web Dashboard to select target workstations and monitor live deployment progress.
2. **Central Deployment Server (Ubuntu Server 24.04 + FOG Server)**:
   - **Master Ubuntu Image**: Stores the customized OS image with pre-installed software and configurations captured from the Master PC.
   - **PXE Boot / Image Deployment Engine**: Manages DHCP, TFTP, and Partclone cloning tasks.
3. **Laboratory Local Network (LAN)**: High-speed Gigabit Ethernet switch facilitating multicast/unicast image transfer.
4. **Target Client Workstations (`PC-01`, `PC-02`, `PC-03` ... `PC-n`)**: Receive the cloned OS image over PXE network boot and stream live progress feedback back to the server.
   - **Solid arrows**: Deployment control and disk image data flow.
   - **Dashed arrows**: Real-time deployment status and monitoring feedback.

---

## 🛠️ 3. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu Server 24.04 LTS (Noble Numbat) | Core server infrastructure and deployment host |
| **Cloning & PXE Engine**| FOG Project 1.5.10 / Partclone | Network booting, disk partition imaging, and storage |
| **Backend API** | FastAPI (Python 3.10+) | High-performance asynchronous REST API & task orchestration |
| **Frontend UI** | React.js (Vite + CSS3) | Single-page administrative dashboard and live monitor |
| **Local Database** | SQLite (SQLAlchemy ORM) | Deployment audit history, client inventory, and host caching |
| **Networking** | PXE / iPXE / TFTP / DHCP | Driverless client network boot over standard Gigabit Ethernet |

---

## ✨ 4. Key Features

- **Intuitive Web Management**: Modern single-pane-of-glass dashboard replacing complex legacy menus.
- **Single & Batch Client Registration**: Quick onboarding of lab workstations via hostname and MAC address.
- **Master Reference Protection**: Built-in safety logic that automatically protects the master reference PC (`ubuntu-master`) from accidental deployment/formatting tasks.
- **Real-Time Deployment Monitoring**: Live visual progress bars showing transfer percentage, elapsed duration, and MB/sec throughput.
- **Complete Audit Trail**: Detailed historical logging of every image capture and deployment session with timestamps and outcome statuses.
- **Wake-on-LAN (WOL)**: Ability to trigger remote power-on signals to workstations across the lab network.
- **Offline Self-Contained Deployment**: Bundled Python offline wheels and build scripts, allowing full system operation in isolated laboratory networks without active internet connections.

---

## 📂 5. Repository Structure

```text
├── 01_inspect_server.sh              # Diagnostic and hardware inspection utility
├── 02_create_safeguard_backup.sh     # Server state and database backup automation
├── 02b_create_reusable_os_archive.sh # Golden master OS packaging script
├── 02c_restore_reusable_os_archive.sh# Portable OS restoration tool
├── 03_adapt_new_network.sh           # Automatic IP/subnet reconfiguration tool
├── 04_clean_fog_db_images.sh         # Database maintenance and record cleanup tool
├── MASTER_MANIFEST_TEMPLATE.txt      # Configuration specification template
├── RESTORE_CHEATSHEET.txt            # Quick disaster recovery cheat sheet
└── ubuntu-deploy-system/             # Core Web Management Application
    ├── backend/                      # FastAPI Python REST API & FOG client
    │   ├── app/
    │   │   ├── routers/              # Computers, Deployments, Images, Dashboard
    │   │   ├── config.py             # Environment configuration
    │   │   ├── database.py           # SQLite connection and migrations
    │   │   ├── fog_client.py         # Asynchronous HTTP FOG API connector
    │   │   ├── main.py               # Application entrypoint
    │   │   └── models.py             # Database schemas
    │   └── requirements.txt          # Python dependencies
    ├── frontend/                     # React Single-Page Application (Vite)
    │   ├── src/components/           # Dashboard, Computers, Images, Deployments
    │   └── package.json              # Frontend libraries
    ├── wheels/                       # Offline Python wheel packages
    ├── install.sh                    # Automated offline installer script
    ├── start.sh                      # Production service startup script
    ├── stop.sh                       # Service termination script
    ├── status.sh                     # Service health check script
    └── ubuntu-deploy.service         # Systemd daemon configuration
```

---

## 🚀 6. Quick Start & Execution

### 1. Installation
```bash
cd ubuntu-deploy-system
chmod +x install.sh start.sh stop.sh status.sh
./install.sh
```

### 2. Configuration
Configure credentials and FOG API tokens in `.env` (refer to `.env.example`):
```bash
nano .env
```

### 3. Running the Service
```bash
./start.sh
```
Access the management dashboard in your browser at:
```text
http://192.168.50.10:8000
```
Default administrator credentials: `admin` / `admin123`

---

## 🔄 7. Standard Operational Workflow

1. **Capture Phase:**
   - Configure software on the physical Master PC (`ubuntu-master`).
   - In Dashboard &rarr; **Images**, schedule a **Capture Task**.
   - Reboot Master PC &rarr; Press **F12** &rarr; Select **Network Boot (PXE)**.
   - Partclone compresses the disk partitions into the server repository.
2. **Registration Phase:**
   - In Dashboard &rarr; **Computers**, register target client machines by their MAC addresses.
3. **Deployment Phase:**
   - In Dashboard &rarr; **Deploy**, select target client workstations and the golden master image.
   - Confirm the deployment modal.
   - Boot client PCs via **Network Boot (PXE)**.
   - The OS image streams over the LAN, automatically installs, and reboots directly into the customized desktop.

---

## 👥 8. Project Credits & Acknowledgments

- **Department:** Computer Science & Engineering
- **Institution:** D. Y. Patil College of Engineering & Technology, Kolhapur
- **Project Group:** G-35
- **Academic Year:** 2026–2027
