"""Builds the scrubbable hero frames. Usage: python -I tools/build_frames.py VIDEO OUTPUT_ASSETS_DIR"""
import site, sys, os
sys.path.append(site.getusersitepackages())
import cv2

video, out = sys.argv[1], sys.argv[2]
SETS = {"d": (96, 1280, 60), "m": (48, 960, 50)}

cap = cv2.VideoCapture(video)
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
frames = []
while True:
    ok, frame = cap.read()
    if not ok:
        break
    frames.append(frame)
total = len(frames)
print("decoded", total)

def resize(img, width):
    h, w = img.shape[:2]
    return cv2.resize(img, (width, round(h * width / w)), interpolation=cv2.INTER_AREA)

for name, (count, width, quality) in SETS.items():
    folder = os.path.join(out, "film", name)
    os.makedirs(folder, exist_ok=True)
    size = 0
    for i in range(count):
        src = frames[round(i * (total - 1) / (count - 1))]
        path = os.path.join(folder, f"{i:02d}.webp")
        cv2.imwrite(path, resize(src, width), [cv2.IMWRITE_WEBP_QUALITY, quality])
        size += os.path.getsize(path)
    print(name, count, "frames", width, "px", round(size / 1048576, 2), "MB")

h, w = frames[0].shape[:2]
share = frames[130]
target_h = round(w * 630 / 1200)
top = (h - target_h) // 2
cv2.imwrite(os.path.join(out, "share.jpg"), cv2.resize(share[top:top + target_h, :], (1200, 630), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 82])
cv2.imwrite(os.path.join(out, "film", "poster.webp"), resize(frames[174], 1120), [cv2.IMWRITE_WEBP_QUALITY, 70])
