"""ANIREMOVE backend: SAM2 (click se subject select) + BiRefNet (hair-level alpha matte)
Video ke liye: temporal smoothing + edge colour decontamination (no flicker, no white halo)."""
import os, json, uuid, shutil, subprocess, threading, time
import cv2, numpy as np, torch, requests
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from torchvision import transforms
from transformers import AutoModelForImageSegmentation
from sam2.sam2_video_predictor import SAM2VideoPredictor

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_ANON_KEY"]
ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")]
MAX_SECONDS = int(os.environ.get("MAX_SECONDS", "30"))
MAX_MB = int(os.environ.get("MAX_MB", "200"))
SIDE_CAP = int(os.environ.get("MAX_SIDE", "1920"))
DEV = "cuda" if torch.cuda.is_available() else "cpu"
WORK = "/tmp/jobs"
os.makedirs(WORK, exist_ok=True)

print("Loading models on", DEV, flush=True)
BIREF = AutoModelForImageSegmentation.from_pretrained(
    os.environ.get("MATTE_MODEL", "ZhengPeng7/BiRefNet_lite"), trust_remote_code=True
).to(DEV).eval()
if DEV == "cuda":
    BIREF.half()
SAM = SAM2VideoPredictor.from_pretrained("facebook/sam2.1-hiera-small", device=DEV)
TF = transforms.Compose([transforms.ToTensor(),
                         transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
print("Models ready", flush=True)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])
JOBS, GATE = {}, threading.Semaphore(1)


# ---------- helpers ----------
def auth(authorization):
    if not authorization:
        raise HTTPException(401, "Please login first")
    r = requests.get(f"{SUPABASE_URL}/auth/v1/user", timeout=10,
                     headers={"Authorization": authorization, "apikey": SUPABASE_KEY})
    if r.status_code != 200:
        raise HTTPException(401, "Session expired, please login again")
    return r.json()["id"]


def sh(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr[-400:])
    return p.stdout


def probe(path):
    j = json.loads(sh(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                       "stream=r_frame_rate:format=duration", "-of", "json", path]))
    a, b = j["streams"][0]["r_frame_rate"].split("/")
    return float(a) / max(float(b), 1), float(j["format"].get("duration", 0) or 0)


def ell(k):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))


@torch.no_grad()
def matte(rgb):
    h, w = rgb.shape[:2]
    x = TF(cv2.resize(rgb, (1024, 1024), interpolation=cv2.INTER_AREA)).unsqueeze(0).to(DEV)
    if DEV == "cuda":
        x = x.half()
    p = BIREF(x)[-1].sigmoid().float().cpu()[0, 0].numpy()
    return cv2.resize(p, (w, h), interpolation=cv2.INTER_CUBIC).clip(0, 1)


def sam_masks(frames_dir, pts, fi, W, H):
    masks = {}
    coords = np.array([[p[0] * W, p[1] * H] for p in pts], dtype=np.float32)
    labels = np.array([int(p[2]) for p in pts], dtype=np.int32)
    with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16, enabled=DEV == "cuda"):
        st = SAM.init_state(video_path=frames_dir, offload_video_to_cpu=True,
                            offload_state_to_cpu=DEV == "cuda")
        SAM.add_new_points_or_box(st, frame_idx=fi, obj_id=1, points=coords, labels=labels)
        for rev in (False, True):
            for idx, _, lg in SAM.propagate_in_video(st, start_frame_idx=fi, reverse=rev):
                masks[idx] = (lg[0, 0] > 0).float().cpu().numpy()
        SAM.reset_state(st)
    return masks


def refine_alpha(a, m):
    """matte + SAM mask -> sirf chosen subject, andar solid, kinare soft (baal safe)."""
    H, W = a.shape
    k = max(9, int(max(W, H) * 0.025)) | 1
    if m is not None:
        mu = m.astype(np.uint8)
        guide = cv2.GaussianBlur(cv2.dilate(mu, ell(k)).astype(np.float32), (0, 0), k / 4)
        core = cv2.erode(mu, ell(k)).astype(np.float32)
        a = np.maximum(a * guide, core)
    return np.clip((a - 0.10) / 0.80, 0, 1)  # halo/haze kill


def decontaminate(img, a):
    """kinare ke pixels ka rang andar ke subject se lo -> white/old-bg patch nahi rahega."""
    core = cv2.erode((a > 0.95).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
    num = cv2.GaussianBlur(img * core[..., None], (0, 0), 6)
    den = cv2.GaussianBlur(core, (0, 0), 6)[..., None]
    fill = num / np.maximum(den, 1e-3)
    t = np.clip((0.95 - a) / 0.95, 0, 1)[..., None] * (den > 0.02)
    return img * (1 - t) + fill * t


def make_bg(mode, rgb, color, bg_path):
    H, W = rgb.shape[:2]
    if mode == "blur":
        return cv2.GaussianBlur(rgb, (0, 0), max(W, H) / 60).astype(np.float32) / 255
    if mode == "color":
        c = color.lstrip("#")
        return np.full((H, W, 3), [int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)
    if mode == "image" and bg_path:
        im = cv2.cvtColor(cv2.imread(bg_path), cv2.COLOR_BGR2RGB)
        s = max(W / im.shape[1], H / im.shape[0])
        im = cv2.resize(im, (int(im.shape[1] * s) + 1, int(im.shape[0] * s) + 1))
        y, x = (im.shape[0] - H) // 2, (im.shape[1] - W) // 2
        return im[y:y + H, x:x + W].astype(np.float32) / 255
    return None


# ---------- job ----------
def run(job_id, src, kind, pts, t, mode, color, bg_path, res):
    J = JOBS[job_id]
    d = f"{WORK}/{job_id}"
    try:
        with GATE:
            J.update(status="running", stage="analyze", pct=2)
            fr = d + "/frames"
            os.makedirs(fr, exist_ok=True)
            S = min(res, SIDE_CAP)
            if kind == "video":
                fps, dur = probe(src)
                if dur > MAX_SECONDS:
                    raise RuntimeError(f"Video {MAX_SECONDS} sec se chhoti honi chahiye")
                fps = min(fps, 30)
                vf = (f"fps={fps},scale=w='if(gt(iw\\,ih)\\,min(iw\\,{S})\\,-2)':"
                      f"h='if(gt(iw\\,ih)\\,-2\\,min(ih\\,{S}))'")
            else:
                fps = 1
                vf = (f"scale=w='if(gt(iw\\,ih)\\,min(iw\\,{S})\\,-2)':"
                      f"h='if(gt(iw\\,ih)\\,-2\\,min(ih\\,{S}))'")
            sh(["ffmpeg", "-y", "-i", src, "-vf", vf, "-q:v", "2", "-frames:v", "100000", fr + "/%05d.jpg"])
            files = sorted(os.listdir(fr))
            n = len(files)
            first = cv2.imread(f"{fr}/{files[0]}")
            H, W = first.shape[:2]
            J.update(stage="detect", pct=8)

            masks = {}
            if pts:
                fi = min(n - 1, max(0, round(t * fps)))
                masks = sam_masks(fr, pts, fi, W, H)

            # output writer
            transparent = mode == "transparent"
            if kind == "image":
                out = f"{d}/result.png"
            else:
                tmp = f"{d}/v." + ("webm" if transparent else "mp4")
                out = f"{d}/result." + ("webm" if transparent else "mp4")
                enc = (["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "20",
                        "-auto-alt-ref", "0"] if transparent else
                       ["-c:v", "libx264", "-crf", "14", "-preset", "medium", "-pix_fmt", "yuv420p"])
                w = subprocess.Popen(["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt",
                                      "rgba" if transparent else "rgb24", "-s", f"{W}x{H}",
                                      "-r", str(fps), "-i", "-"] + enc + [tmp],
                                     stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

            J.update(stage="remove", pct=10)
            prev_a = prev_g = bg = None
            for i, f in enumerate(files):
                rgb = cv2.cvtColor(cv2.imread(f"{fr}/{f}"), cv2.COLOR_BGR2RGB)
                a = refine_alpha(matte(rgb), masks.get(i) if pts else None)
                g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
                if prev_a is not None:  # anti-flicker: static area me pichhla alpha mix
                    dif = cv2.GaussianBlur(np.abs(g - prev_g), (0, 0), 2)
                    wgt = 0.5 * np.exp(-(dif / 0.05) ** 2)
                    a = a * (1 - wgt) + prev_a * wgt
                prev_a, prev_g = a, g
                img = decontaminate(rgb.astype(np.float32) / 255, a)
                if bg is None and not transparent:
                    bg = make_bg(mode, rgb, color, bg_path)
                if transparent:
                    frame = np.dstack([img, a])
                else:
                    frame = img * a[..., None] + bg * (1 - a[..., None])
                frame = (frame * 255 + 0.5).astype(np.uint8)
                if kind == "image":
                    cv2.imwrite(out, cv2.cvtColor(frame, cv2.COLOR_RGBA2BGRA if transparent else cv2.COLOR_RGB2BGR))
                else:
                    w.stdin.write(frame.tobytes())
                J["pct"] = 10 + int(85 * (i + 1) / n)

            J.update(stage="final", pct=96)
            if kind == "video":
                w.stdin.close()
                w.wait()
                ac = "libopus" if transparent else "aac"
                sh(["ffmpeg", "-y", "-i", tmp, "-i", src, "-map", "0:v", "-map", "1:a?",
                    "-c:v", "copy", "-c:a", ac, "-shortest", out])
            J.update(status="done", pct=100, out=out, ext=out.rsplit(".", 1)[1])
    except Exception as e:
        J.update(status="error", error=str(e)[:300])
    finally:
        if DEV == "cuda":
            torch.cuda.empty_cache()
        shutil.rmtree(d + "/frames", ignore_errors=True)


def janitor():
    while True:
        time.sleep(600)
        for k, v in list(JOBS.items()):
            if time.time() - v["ts"] > 3600:
                shutil.rmtree(f"{WORK}/{k}", ignore_errors=True)
                JOBS.pop(k, None)


threading.Thread(target=janitor, daemon=True).start()


# ---------- routes ----------
@app.get("/")
def root():
    return {"ok": True, "device": DEV}


@app.post("/api/process")
def process(file: UploadFile = File(...), kind: str = Form("video"), points: str = Form("[]"),
            t: float = Form(0), bg: str = Form("transparent"), color: str = Form("#00ff00"),
            res: int = Form(1080), bg_image: UploadFile = File(None), authorization: str = Header(None)):
    uid = auth(authorization)
    if kind not in ("image", "video") or bg not in ("transparent", "blur", "color", "image"):
        raise HTTPException(400, "Invalid options")
    try:
        pts = json.loads(points)
    except Exception:
        raise HTTPException(400, "Invalid points")
    if kind == "video" and not pts:
        raise HTTPException(400, "Video par subject par click karke select karo")
    job_id = uuid.uuid4().hex
    d = f"{WORK}/{job_id}"
    os.makedirs(d)
    src = f"{d}/src" + os.path.splitext(file.filename or "")[1][:6]
    with open(src, "wb") as o:
        shutil.copyfileobj(file.file, o)
    if os.path.getsize(src) > MAX_MB * 1024 * 1024:
        shutil.rmtree(d, ignore_errors=True)
        raise HTTPException(413, f"File {MAX_MB}MB se chhoti honi chahiye")
    bg_path = None
    if bg == "image" and bg_image is not None:
        bg_path = f"{d}/bg"
        with open(bg_path, "wb") as o:
            shutil.copyfileobj(bg_image.file, o)
    JOBS[job_id] = dict(uid=uid, status="queued", stage="analyze", pct=0, ts=time.time())
    threading.Thread(target=run, daemon=True,
                     args=(job_id, src, kind, pts, t, bg, color, bg_path, res)).start()
    return {"job_id": job_id}


def get_job(job_id, authorization):
    uid = auth(authorization)
    J = JOBS.get(job_id)
    if not J or J["uid"] != uid:
        raise HTTPException(404, "Job not found (expired?)")
    return J


@app.get("/api/jobs/{job_id}")
def status(job_id: str, authorization: str = Header(None)):
    J = get_job(job_id, authorization)
    return {k: J.get(k) for k in ("status", "stage", "pct", "error", "ext")}


@app.get("/api/jobs/{job_id}/result")
def result(job_id: str, authorization: str = Header(None)):
    J = get_job(job_id, authorization)
    if J["status"] != "done":
        raise HTTPException(409, "Not ready")
    return FileResponse(J["out"])
