"""Windows Apple Mobile Device Service és USB driver automatikus ellenőrzése és csendes telepítése."""
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request

APPLE_ITUNES_URL = "https://www.apple.com/itunes/download/win64"
SERVICE_NAME = "Apple Mobile Device Service"


def is_service_installed():
    """Ellenőrzi, hogy telepítve van-e az Apple Mobile Device Service Windowson."""
    if sys.platform != "win32":
        return True
    try:
        import winreg

        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            rf"SYSTEM\CurrentControlSet\Services\{SERVICE_NAME}",
        )
        winreg.CloseKey(key)
        return True
    except Exception:
        pass
    try:
        res = subprocess.run(
            ["sc.exe", "query", SERVICE_NAME],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return res.returncode == 0
    except Exception:
        return False


def start_service():
    """Megpróbálja elindítani a szolgáltatást, ha az le van állítva."""
    if sys.platform != "win32":
        return
    try:
        subprocess.run(
            ["sc.exe", "start", SERVICE_NAME],
            capture_output=True,
            timeout=5,
        )
    except Exception:
        pass


def install_apple_driver(notify):
    """Letölti az Apple telepítőjét, kicsomagolja a szükséges MSI csomagokat és csendesen feltelepíti."""
    notify("Az iPad USB-felismeréséhez szükséges Apple illesztőprogram hiányzik a gépről.")
    notify("A program most automatikusan letölti és telepíti a szükséges minimális hivatalos drivert.")
    notify("A letöltött telepítőfájlokat a beállítás után azonnal töröljük a lemezről.")
    temp_dir = tempfile.mkdtemp(prefix="ipad_audit_driver_")
    setup_exe = os.path.join(temp_dir, "iTunes64Setup.exe")
    try:
        req = urllib.request.Request(
            APPLE_ITUNES_URL,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        )
        with urllib.request.urlopen(req, timeout=120) as response, open(setup_exe, "wb") as out_file:
            shutil.copyfileobj(response, out_file)

        notify("Telepítő letöltve. Illesztőprogram kicsomagolása...")
        extracted = False
        try:
            res = subprocess.run(
                [setup_exe, "/extract", temp_dir],
                capture_output=True,
                timeout=60,
            )
            if res.returncode == 0:
                extracted = True
        except Exception:
            pass
        if not extracted:
            try:
                subprocess.run(
                    [
                        "tar.exe",
                        "-xf",
                        setup_exe,
                        "-C",
                        temp_dir,
                        "AppleApplicationSupport64.msi",
                        "AppleMobileDeviceSupport64.msi",
                    ],
                    capture_output=True,
                    timeout=60,
                )
            except Exception:
                pass

        app_support = os.path.join(temp_dir, "AppleApplicationSupport64.msi")
        device_support = os.path.join(temp_dir, "AppleMobileDeviceSupport64.msi")

        if not os.path.exists(device_support):
            raise RuntimeError("Nem sikerült kicsomagolni az Apple illesztőprogramot.")

        notify("Illesztőprogram csendes telepítése... (Ha a Windows engedélyt kér, válaszd az Igent)")
        cmd = (
            f'Start-Process msiexec.exe -ArgumentList "/i", "\"{app_support}\"", "/qn", "/norestart" -Verb RunAs -Wait; '
            f'Start-Process msiexec.exe -ArgumentList "/i", "\"{device_support}\"", "/qn", "/norestart" -Verb RunAs -Wait'
        )
        subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd],
            check=True,
            timeout=180,
        )
        start_service()
        notify("Az Apple illesztőprogram sikeresen telepítve, az átmeneti telepítőfájlok törölve.")
        return True
    except Exception as error:
        notify(f"Az illesztőprogram automatikus telepítése nem sikerült: {error}")
        return False
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def ensure_driver(notify):
    """Ellenőrzi a drivert, és szükség esetén automatikusan telepíti."""
    if sys.platform != "win32":
        return True
    if is_service_installed():
        start_service()
        return True
    return install_apple_driver(notify)
