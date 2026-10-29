from pathlib import Path

p = Path("android/app/build.gradle")
s = p.read_text()

signing = """
    signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
"""

if "signingConfigs {" not in s:
    s = s.replace("android {", "android {\n" + signing, 1)

marker = "release {"
idx = s.find(marker)
if idx < 0:
    raise SystemExit("Could not find release build type")

insert_at = idx + len(marker)
if "signingConfig signingConfigs.release" not in s:
    s = s[:insert_at] + "\n            signingConfig signingConfigs.release" + s[insert_at:]

p.write_text(s)
