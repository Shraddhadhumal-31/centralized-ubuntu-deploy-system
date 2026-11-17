import httpx
import logging
import re
from typing import Optional, List, Dict, Any
from .config import get_settings

logger = logging.getLogger(__name__)


def parse_image_size(raw_size: Any) -> str:
    """
    Parses FOG Project imageSize strings into formatted GB strings.
    FOG typically outputs image size as '<used_bytes>:<capacity_bytes>:'
    e.g. '1127219200.000000:20744781824.000000:'
    """
    if not raw_size:
        return "—"
    
    s = str(raw_size).strip()
    if not s or s in ["—", "-", "0", "0:0:"]:
        return "—"

    # Check for FOG dual size format used:capacity:
    if ":" in s:
        parts = [p.strip() for p in s.split(":") if p.strip()]
        if len(parts) >= 2:
            try:
                used_bytes = float(parts[0])
                cap_bytes = float(parts[1])
                used_gb = used_bytes / (1024 ** 3)
                cap_gb = cap_bytes / (1024 ** 3)
                if used_gb > 0:
                    return f"{used_gb:.2f} GB (disk: {cap_gb:.2f} GB)"
                elif cap_gb > 0:
                    return f"0.00 GB (disk: {cap_gb:.2f} GB)"
            except Exception:
                pass
        elif len(parts) == 1:
            try:
                b = float(parts[0])
                if b > 0:
                    return f"{b / (1024 ** 3):.2f} GB"
            except Exception:
                pass

    # Check for plain integer/float bytes
    try:
        val = float(s)
        if val > 0:
            return f"{val / (1024 ** 3):.2f} GB"
        return "—"
    except ValueError:
        pass

    # Check if already formatted (e.g. 20GB, 20 GB)
    m = re.match(r"^([\d\.]+)\s*(GB|MB|TB|KB)?$", s, re.IGNORECASE)
    if m:
        num = float(m.group(1))
        unit = (m.group(2) or "GB").upper()
        if unit == "TB":
            return f"{num * 1024:.2f} GB"
        elif unit == "MB":
            return f"{num / 1024:.2f} GB"
        elif unit == "KB":
            return f"{num / (1024**2):.2f} GB"
        return f"{num:.2f} GB"

    return s


class FOGClient:
    """
    Client for the FOG Project JSON API.
    Handles communication with FOG 1.5.x REST API with robust error handling.
    """

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.FOG_BASE_URL.rstrip("/")
        self.headers = {
            "fog-api-token": settings.FOG_API_TOKEN,
            "fog-user-token": settings.FOG_USER_TOKEN,
        }
        self.timeout = 15.0

    def _url(self, endpoint: str) -> str:
        return f"{self.base_url}/{endpoint.lstrip('/')}"

    def _safe_parse_json(self, r: httpx.Response) -> Any:
        text = r.text.strip()
        if not text:
            return {}
        try:
            return r.json()
        except Exception:
            return {"raw": text}

    def _extract_error(self, r: httpx.Response) -> str:
        text = r.text.strip()
        try:
            data = r.json()
            if isinstance(data, dict):
                msg = data.get("error") or data.get("message") or data.get("detail")
                if msg:
                    return str(msg)
        except Exception:
            pass
        return text if text else f"HTTP {r.status_code}"

    async def _get(self, endpoint: str) -> Any:
        async with httpx.AsyncClient(verify=False, timeout=self.timeout) as client:
            r = await client.get(self._url(endpoint), headers=self.headers)
            if r.is_error:
                err_msg = self._extract_error(r)
                logger.error(f"FOG GET {endpoint} failed ({r.status_code}): {err_msg}")
                raise RuntimeError(f"FOG API error ({r.status_code}): {err_msg}")
            return self._safe_parse_json(r)

    async def _post(self, endpoint: str, data: dict = None) -> Any:
        async with httpx.AsyncClient(verify=False, timeout=self.timeout) as client:
            r = await client.post(
                self._url(endpoint),
                headers={**self.headers, "Content-Type": "application/json"},
                json=data or {},
            )
            if r.is_error:
                err_msg = self._extract_error(r)
                logger.error(f"FOG POST {endpoint} failed ({r.status_code}): {err_msg}")
                raise RuntimeError(f"FOG API error ({r.status_code}): {err_msg}")
            return self._safe_parse_json(r)

    async def _put(self, endpoint: str, data: dict = None) -> Any:
        async with httpx.AsyncClient(verify=False, timeout=self.timeout) as client:
            r = await client.put(
                self._url(endpoint),
                headers={**self.headers, "Content-Type": "application/json"},
                json=data or {},
            )
            if r.is_error:
                err_msg = self._extract_error(r)
                logger.error(f"FOG PUT {endpoint} failed ({r.status_code}): {err_msg}")
                raise RuntimeError(f"FOG API error ({r.status_code}): {err_msg}")
            return self._safe_parse_json(r)

    async def _delete(self, endpoint: str) -> Any:
        async with httpx.AsyncClient(verify=False, timeout=self.timeout) as client:
            r = await client.delete(self._url(endpoint), headers=self.headers)
            if r.is_error:
                err_msg = self._extract_error(r)
                logger.error(f"FOG DELETE {endpoint} failed ({r.status_code}): {err_msg}")
                raise RuntimeError(f"FOG API error ({r.status_code}): {err_msg}")
            return self._safe_parse_json(r)

    # ── Hosts ──

    async def get_hosts(self) -> list:
        try:
            data = await self._get("/host")
            raw = data.get("hosts", [])
            if isinstance(raw, dict):
                return list(raw.values())
            return raw if isinstance(raw, list) else []
        except Exception as e:
            logger.error(f"Failed to fetch hosts from FOG: {e}")
            raise

    async def get_host(self, host_id: int) -> Optional[dict]:
        try:
            data = await self._get(f"/host/{host_id}")
            if isinstance(data, dict):
                if "host" in data and isinstance(data["host"], dict):
                    return data["host"]
                if "hosts" in data:
                    hosts = data["hosts"]
                    if isinstance(hosts, list) and hosts:
                        return hosts[0]
                    if isinstance(hosts, dict):
                        return list(hosts.values())[0] if hosts else None
                if "id" in data:
                    return data
            all_hosts = await self.get_hosts()
            for h in all_hosts:
                if str(h.get("id")) == str(host_id):
                    return h
            return None
        except Exception as e:
            logger.error(f"Failed to fetch host {host_id}: {e}")
            all_hosts = await self.get_hosts()
            for h in all_hosts:
                if str(h.get("id")) == str(host_id):
                    return h
            return None

    async def create_host(self, name: str, mac: str, image_id: int = 0) -> dict:
        """Register a new host in FOG with name and MAC address."""
        clean_mac = mac.strip().upper()
        payload = {
            "name": name.strip(),
            "macs": [clean_mac],
            "description": "Registered via Ubuntu Deploy System",
        }
        if image_id and int(image_id) > 0:
            payload["imageID"] = int(image_id)

        res = await self._post("/host/create", data=payload)

        # Ensure we have host ID
        host_id = None
        if isinstance(res, dict):
            host_id = res.get("id") or res.get("host", {}).get("id")

        if not host_id:
            all_hosts = await self.get_hosts()
            for h in all_hosts:
                if h.get("name", "").lower() == name.strip().lower():
                    host_id = h.get("id")
                    break

        if host_id and isinstance(res, dict):
            res["id"] = host_id

        return res

    async def assign_image_to_host(self, host_id: int, image_id: int) -> dict:
        """Assign an image definition to a host."""
        return await self._put(f"/host/{host_id}/edit", data={"imageID": int(image_id)})

    async def delete_host(self, host_id: int) -> dict:
        """Delete a registered host from FOG."""
        try:
            return await self._delete(f"/host/{host_id}/delete")
        except Exception:
            return await self._delete(f"/host/{host_id}")

    # ── Images ──

    async def get_images(self) -> list:
        try:
            data = await self._get("/image")
            raw = data.get("images", [])
            if isinstance(raw, dict):
                return list(raw.values())
            return raw if isinstance(raw, list) else []
        except Exception as e:
            logger.error(f"Failed to fetch images from FOG: {e}")
            raise

    async def get_image(self, image_id: int) -> Optional[dict]:
        try:
            data = await self._get(f"/image/{image_id}")
            if isinstance(data, dict):
                if "image" in data and isinstance(data["image"], dict):
                    return data["image"]
                if "images" in data:
                    images = data["images"]
                    if isinstance(images, list) and images:
                        return images[0]
                    if isinstance(images, dict):
                        return list(images.values())[0] if images else None
                if "id" in data:
                    return data
            all_imgs = await self.get_images()
            for img in all_imgs:
                if str(img.get("id")) == str(image_id):
                    return img
            return None
        except Exception as e:
            logger.error(f"Failed to fetch image {image_id}: {e}")
            all_imgs = await self.get_images()
            for img in all_imgs:
                if str(img.get("id")) == str(image_id):
                    return img
            return None

    async def update_image(self, image_id: int, data: dict) -> dict:
        """Update an existing image definition in FOG."""
        return await self._put(f"/image/{image_id}/edit", data=data)

    async def create_image(
        self,
        name: str,
        path: str = "",
        image_type_id: int = 1,
        os_id: int = 50,
        image_partition_type_id: int = 1,
        description: str = "",
    ) -> dict:
        """
        Create a new image definition in FOG.
        CRITICAL: imagePartitionTypeID=1 ('Everything' / 'all') is mandatory
        to prevent FOS Partclone error: 'No img part type passed'.
        """
        clean_name = name.strip()
        safe_path = path.strip() if path else re.sub(r"[^a-zA-Z0-9_\-]", "_", clean_name)

        # Check if already exists in FOG
        try:
            all_imgs = await self.get_images()
            for img in all_imgs:
                if (
                    img.get("name", "").lower() == clean_name.lower()
                    or img.get("path", "").lower() == safe_path.lower()
                ):
                    logger.info(f"Image '{clean_name}' already exists in FOG (ID: {img.get('id')}). Reusing.")
                    # Ensure partition type is set on existing image as well
                    try:
                        await self.update_image(
                            int(img.get("id")),
                            {"imagePartitionTypeID": 1, "partitionType": 1, "imageTypeID": 1, "osID": 50},
                        )
                    except Exception:
                        pass
                    return img
        except Exception:
            pass

        payload = {
            "name": clean_name,
            "path": safe_path,
            "imageTypeID": image_type_id,
            "imagePartitionTypeID": image_partition_type_id,  # CRITICAL: 1 = Everything / all
            "partitionType": image_partition_type_id,
            "osID": os_id,
            "storagegroupID": 1,
            "description": description or f"Registered via Ubuntu Deploy System",
            "isEnabled": 1,
        }
        res = await self._post("/image/create", data=payload)

        # Resolve newly created image ID
        img_id = None
        if isinstance(res, dict):
            img_id = res.get("id") or res.get("image", {}).get("id")

        if not img_id:
            all_imgs = await self.get_images()
            for img in all_imgs:
                if img.get("name", "").lower() == clean_name.lower():
                    img_id = img.get("id")
                    break

        if img_id and isinstance(res, dict):
            res["id"] = img_id
        elif img_id and not isinstance(res, dict):
            res = {"id": img_id, "name": clean_name}

        return res

    async def delete_image(self, image_id: int) -> dict:
        try:
            return await self._delete(f"/image/{image_id}/delete")
        except Exception:
            return await self._delete(f"/image/{image_id}")

    # ── Tasks (Deploy & Capture) ──

    async def get_active_tasks(self) -> list:
        try:
            data = await self._get("/task/current")
            raw = data.get("tasks", [])
            if isinstance(raw, dict):
                return list(raw.values())
            return raw if isinstance(raw, list) else []
        except Exception as e:
            logger.error(f"Failed to fetch active tasks: {e}")
            return []

    async def create_deploy_task(self, host_id: int, image_id: Optional[int] = None) -> dict:
        """Create a Deploy task (taskTypeID 1 = Deploy). Cancels stale active task first."""
        try:
            await self.cancel_task(host_id)
        except Exception:
            pass

        if image_id and int(image_id) > 0:
            try:
                await self.assign_image_to_host(host_id, int(image_id))
            except Exception:
                pass

        payload = {"taskTypeID": 1}
        if image_id:
            payload["imageID"] = int(image_id)
        return await self._post(f"/host/{host_id}/task", data=payload)

    async def create_capture_task(self, host_id: int, image_id: Optional[int] = None) -> dict:
        """
        Create a Capture task (taskTypeID 2 = Capture).
        Ensures image definition has imagePartitionTypeID=1 prior to task creation
        so that FOS receives imgPartitionType=all.
        """
        try:
            await self.cancel_task(host_id)
        except Exception:
            pass

        if image_id and int(image_id) > 0:
            try:
                # Crucial: update image partition configuration before capture
                await self.update_image(
                    int(image_id),
                    {
                        "imagePartitionTypeID": 1,
                        "partitionType": 1,
                        "imageTypeID": 1,
                        "osID": 50,
                    },
                )
            except Exception as e:
                logger.warning(f"Could not update imagePartitionTypeID before capture: {e}")

            try:
                await self.assign_image_to_host(host_id, int(image_id))
            except Exception:
                pass

        payload = {"taskTypeID": 2}
        if image_id:
            payload["imageID"] = int(image_id)
        return await self._post(f"/host/{host_id}/task", data=payload)

    async def cancel_task(self, host_id: int) -> dict:
        try:
            return await self._delete(f"/host/{host_id}/cancel")
        except Exception:
            return {}

    async def get_task(self, task_id: int) -> Optional[dict]:
        try:
            data = await self._get(f"/task/{task_id}")
            tasks = data.get("tasks", [])
            if isinstance(tasks, list) and tasks:
                return tasks[0]
            if isinstance(tasks, dict):
                vals = list(tasks.values())
                return vals[0] if vals else tasks
            return None
        except Exception:
            return None

    # ── System ──

    async def check_connection(self) -> bool:
        try:
            await self._get("/host")
            return True
        except Exception:
            return False


fog_client = FOGClient()
