from fastapi import FastAPI, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Callable, Tuple, Optional
import random, time, os, base64, json, hmac, hashlib
from datetime import datetime, timedelta

import sympy as sp
from passlib.hash import bcrypt
import jwt

from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text

from .db import Base, engine, get_db

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="student")
    is_paid = Column(Boolean, default=False)
    attempts_used = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class Material(Base):
    __tablename__ = "materials"
    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String(30), index=True, nullable=False)
    chapter = Column(String(100), nullable=False)
    summary = Column(Text, default="")
    formulas = Column(Text, default="")
    examples = Column(Text, default="")

Base.metadata.create_all(bind=engine)

JWT_SECRET = os.environ.get("JWT_SECRET", "DEV_JWT_CHANGE_ME")
JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = 24 * 7

FREE_ATTEMPT_LIMIT = 3
REASONED_SECRET = os.environ.get("REASONED_SECRET", "DEV_QTOKEN_CHANGE_ME")

def make_jwt(user: User) -> str:
    payload = {
        "sub": user.username,
        "role": user.role,
        "is_paid": user.is_paid,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.split(" ", 1)[1].strip()
    data = decode_jwt(token)
    username = (data.get("sub") or "").strip().lower()
    u = db.query(User).filter(User.username == username).first()
    if not u:
        raise HTTPException(status_code=401, detail="User not found")
    return u

def b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")

def b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * ((4 - len(s) % 4) % 4))

def sign(payload: bytes) -> str:
    return b64e(hmac.new(REASONED_SECRET.encode("utf-8"), payload, hashlib.sha256).digest())

def make_token(data: dict) -> str:
    raw = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return f"{b64e(raw)}.{sign(raw)}"

def read_token(token: str) -> dict:
    try:
        p, sig = token.split(".", 1)
        raw = b64d(p)
        if not hmac.compare_digest(sign(raw), sig):
            raise ValueError("bad signature")
        return json.loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token")

class RegisterReq(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=6, max_length=72)

class LoginReq(BaseModel):
    username: str
    password: str = Field(min_length=1, max_length=72)

class GenSetReq(BaseModel):
    exam: str = Field(default="UTBK")
    track: str = Field(default="SAINTEK")
    subject: str = Field(default="MIX")
    level: float = Field(default=1.5, ge=1.0, le=3.0)
    n: int = Field(default=10, ge=10, le=30)
    seed: Optional[int] = None

class AnswerItem(BaseModel):
    token: str
    answer: int = Field(ge=0, le=3)

class CheckSetReq(BaseModel):
    answers: List[AnswerItem]

class ExplainReq(BaseModel):
    token: str
    question: str

class TutorChatReq(BaseModel):
    mode: str = "by_chapter"
    chapter_id: int
    subject: str
    question: str

@app.post("/api/register")
def register(req: RegisterReq, db: Session = Depends(get_db)):
    username = req.username.strip().lower()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already used")
    pw = req.password or ""
    if len(pw.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password maksimal 72 byte/karakter.")
    u = User(
        username=username,
        password_hash=bcrypt.hash(pw),
        role="student",
        is_paid=False,
        attempts_used=0,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    token = make_jwt(u)
    return {"token": token, "user": u.username, "role": u.role, "is_paid": u.is_paid}

@app.post("/api/login")
def login(req: LoginReq, db: Session = Depends(get_db)):
    username = req.username.strip().lower()
    u = db.query(User).filter(User.username == username).first()
    if not u or not bcrypt.verify(req.password, u.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_jwt(u)
    return {"token": token, "user": u.username, "role": u.role, "is_paid": u.is_paid}

@app.get("/api/me")
def me(user: User = Depends(get_current_user)):
    return {
        "user": user.username,
        "role": user.role,
        "is_paid": user.is_paid,
        "attempts_used": user.attempts_used,
        "free_limit": FREE_ATTEMPT_LIMIT,
    }

@app.get("/api/materials")
def list_materials(
    subject: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = (subject or "").strip().upper()
    rows = db.query(Material).filter(Material.subject == sub).order_by(Material.id.asc()).all()
    return [{"id": r.id, "subject": r.subject, "chapter": r.chapter} for r in rows]

@app.get("/api/material/{mid}")
def get_material(
    mid: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(Material).filter(Material.id == mid).first()
    if not r:
        raise HTTPException(status_code=404, detail="Materi tidak ditemukan")
    return {
        "id": r.id,
        "subject": r.subject,
        "chapter": r.chapter,
        "summary": r.summary or "",
        "formulas": r.formulas or "",
        "examples": r.examples or "",
    }

@app.post("/api/tutor_chat")
def tutor_chat(
    req: TutorChatReq,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(Material).filter(Material.id == int(req.chapter_id)).first()
    if not r:
        raise HTTPException(status_code=404, detail="Bab tidak ditemukan")
    q = (req.question or "").lower().strip()
    if any(k in q for k in ["rumus", "formula", "persamaan"]):
        ans = r.formulas or "Bab ini belum punya daftar rumus."
    elif any(k in q for k in ["contoh", "latihan", "soal"]):
        ans = r.examples or "Bab ini belum punya contoh soal."
    elif any(k in q for k in ["ringkas", "summary", "inti", "jelaskan", "pengertian"]):
        ans = r.summary or "Bab ini belum punya ringkasan."
    else:
        ans = (
            "Aku bisa bantu dengan format:\n"
            "- ketik: ringkas (ringkasan)\n"
            "- ketik: rumus (rumus/konsep)\n"
            "- ketik: contoh (contoh/latihan)\n\n"
            f"Ringkasan:\n{(r.summary or '-')}"
        )
    return {"answer": ans}

UTBK_SUBJECTS = ["TPS_PU", "TPS_PPU", "TPS_PBM", "TPS_PK", "LITBIN", "LITBING", "PM"]
TKA_SAINTEK = ["MAT_WAJIB", "MAT_LANJUT", "FISIKA", "KIMIA", "BIOLOGI"]
TKA_SOSHUM = ["EKONOMI", "GEOGRAFI", "SEJARAH", "SOSIOLOGI"]

@app.get("/api/meta")
def meta():
    return {"UTBK": UTBK_SUBJECTS, "TKA": {"SAINTEK": TKA_SAINTEK, "SOSHUM": TKA_SOSHUM}}

def clamp_level(level: float) -> float:
    return max(1.0, min(3.0, float(level)))

def lvl_bucket(level: float) -> int:
    if level < 1.67: return 1
    if level < 2.67: return 2
    return 3

def allowed_subjects(exam: str, track: str) -> List[str]:
    if exam.upper() == "UTBK":
        return UTBK_SUBJECTS
    return TKA_SAINTEK if track.upper() == "SAINTEK" else TKA_SOSHUM

def wchoice(items: List[Tuple[Callable[[float], dict], int]]) -> Callable[[float], dict]:
    total = sum(w for _, w in items)
    r = random.randint(1, total)
    acc = 0
    for fn, w in items:
        acc += w
        if r <= acc:
            return fn
    return items[-1][0]

def pack(kategori: str, teks: str, opsi: List[str], kunci: int, pembahasan: str, konsep: List[str]):
    return {
        "kategori": kategori,
        "teks": teks,
        "opsi": [str(x) for x in opsi],
        "kunci": int(kunci),
        "pembahasan": pembahasan,
        "konsep": konsep,
    }

READING_ID = [
    {
        "title": "Transportasi Publik",
        "text": (
            "Kota yang meningkatkan kualitas transportasi publik sering mengalami penurunan kemacetan. "
            "Namun, perubahan perilaku warga tidak terjadi seketika. Dibutuhkan konsistensi layanan, "
            "integrasi rute, dan informasi yang mudah diakses agar warga bersedia beralih dari kendaraan pribadi."
        ),
    },
    {
        "title": "Belajar Efektif",
        "text": (
            "Belajar yang efektif tidak hanya bergantung pada durasi, tetapi juga strategi. "
            "Mengulang materi dengan jeda waktu, menguji diri sendiri, dan merangkum dengan kata-kata sendiri "
            "membantu pemahaman lebih dalam dibanding sekadar membaca berulang."
        ),
    },
    {
        "title": "Sampah Plastik",
        "text": (
            "Pengurangan sampah plastik dapat dilakukan dengan membatasi penggunaan plastik sekali pakai dan meningkatkan daur ulang. "
            "Meski demikian, tanpa perubahan kebiasaan konsumsi, kebijakan daur ulang saja sering tidak cukup menurunkan volume sampah secara signifikan."
        ),
    },
]

def gen_tps_pu(level: float):
    bank = [
        ("Jika semua A adalah B dan sebagian B adalah C, apakah semua A adalah C?",
         ["Benar", "Salah", "Tidak tentu", "Tergantung"], 2,
         "Tidak tentu: sebagian B yang C belum tentu termasuk A.",
         ["silogisme", "himpunan"]),
        ("Jika (P→Q) dan (Q→R), apakah (P→R)?",
         ["Benar (Transitif)", "Salah", "Kadang benar", "Tidak tentu"], 0,
         "Hukum silogisme: P→Q dan Q→R maka P→R.",
         ["implikasi", "transitif"]),
        ("Negasi dari 'Semua siswa hadir' adalah…",
         ["Semua siswa tidak hadir", "Sebagian siswa hadir", "Ada siswa yang tidak hadir", "Tidak ada siswa hadir"], 2,
         "Negasi kuantor: ∀ menjadi ∃ yang tidak.",
         ["negasi kuantor"]),
    ]
    teks, opsi, kunci, pemb, konsep = random.choice(bank)
    return pack("TPS-PU", teks, opsi, kunci, pemb, konsep)

def gen_tps_ppu(level: float):
    bank = [
        ("Sinonim dari 'cermat' adalah…", ["teliti", "ceroboh", "keras", "lambat"], 0,
         "Sinonim = makna mirip.", ["sinonim"]),
        ("Antonim dari 'optimis' adalah…", ["pesimis", "realistis", "obyektif", "sabar"], 0,
         "Antonim = makna berlawanan.", ["antonim"]),
        ("Dokter : Rumah Sakit = Guru : …", ["Pasar", "Sekolah", "Terminal", "Kantor Pos"], 1,
         "Relasi tempat bekerja.", ["analogi"]),
    ]
    teks, opsi, kunci, pemb, konsep = random.choice(bank)
    return pack("TPS-PPU", teks, opsi, kunci, pemb, konsep)

def gen_reading(kind: str, passage: dict):
    title, text = passage["title"], passage["text"]
    if kind == "ide_pokok":
        correct = "Bacaan menekankan pentingnya konsistensi dan dukungan sistem agar perubahan efektif."
        wrongs = ["Bacaan memuat data statistik lengkap", "Bacaan menceritakan sejarah panjang", "Bacaan membahas teknis detail tanpa alasan"]
        opsi = [correct] + wrongs
        random.shuffle(opsi)
        return (
            f"Bacaan: {title}\n\n{text}\n\nPertanyaan: Apa ide pokok bacaan?",
            opsi, opsi.index(correct),
            "Ide pokok adalah gagasan utama yang menaungi seluruh bacaan."
        )
    correct = "Perubahan efektif butuh konsistensi dan perubahan kebiasaan, tidak instan."
    wrongs = ["Hasil selalu instan", "Informasi publik tidak perlu", "Satu kebijakan saja cukup"]
    opsi = [correct] + wrongs
    random.shuffle(opsi)
    return (
        f"Bacaan: {title}\n\n{text}\n\nPertanyaan: Simpulan yang tepat adalah…",
        opsi, opsi.index(correct),
        "Simpulan harus sesuai isi bacaan dan tidak menambah klaim baru."
    )

def gen_tps_pbm(level: float):
    p = random.choice(READING_ID)
    kind = random.choice(["ide_pokok", "simpulan"])
    teks, opsi, kunci, pemb = gen_reading(kind, p)
    return pack("TPS-PBM", teks, opsi, kunci, pemb, ["membaca", kind])

def gen_tps_pk(level: float):
    b = lvl_bucket(level)
    mode = random.choice(["deret", "persen", "linear"])
    if mode == "deret":
        a = random.randint(2, 10)
        d = random.randint(2, 5 + b)
        n = random.randint(5, 7 + b)
        seq = [a + i*d for i in range(n-1)]
        ans = a + (n-1)*d
        opsi = [ans, ans+d, ans-d, ans+2*d]
        random.shuffle(opsi)
        return pack("TPS-PK",
                    f"Tentukan suku ke-{n} dari: {', '.join(map(str, seq))}, ...",
                    list(map(str, opsi)),
                    opsi.index(ans),
                    f"U_n = a+(n-1)d = {a}+({n}-1)*{d} = {ans}",
                    ["deret aritmetika"])
    if mode == "persen":
        harga = random.randint(50, 200) * 1000
        diskon = random.choice([10, 15, 20, 25, 30])
        bayar = harga * (100 - diskon) // 100
        opsi = [bayar, bayar + 5000, bayar - 5000, bayar + 10000]
        random.shuffle(opsi)
        return pack("TPS-PK",
                    f"Barang Rp{harga:,} diskon {diskon}%. Harga bayar…",
                    [f"Rp{x:,}" for x in opsi],
                    opsi.index(bayar),
                    f"Bayar = {harga}×(100-{diskon})/100 = {bayar}",
                    ["persen", "diskon"])
    x = sp.Symbol("x")
    a = random.randint(2, 9)
    b0 = random.randint(1, 15)
    c = random.randint(10, 50)
    sol = sp.solve(sp.Eq(a*x + b0, c))[0]
    opsi = [sol, sol + 1, sol - 1, sol + 2]
    random.shuffle(opsi)
    return pack("TPS-PK",
                f"Selesaikan: {a}x + {b0} = {c}",
                [str(o) for o in opsi],
                opsi.index(sol),
                f"x = ({c}-{b0})/{a} = {sp.nsimplify(sol)}",
                ["persamaan linear"])

def gen_pm(level: float):
    mode = random.choice(["rasio", "fungsi", "peluang"])
    if mode == "rasio":
        a = random.randint(2, 8)
        b = random.randint(2, 8)
        k = random.randint(2, 6)
        ans = b*k
        opsi = [ans, ans+b, ans-b, ans+2*b]
        random.shuffle(opsi)
        return pack("PM", f"Perbandingan A:B={a}:{b}. Jika A={a*k}, B=…",
                    [str(x) for x in opsi], opsi.index(ans),
                    "Gunakan faktor pengali k pada rasio.", ["rasio"])
    if mode == "fungsi":
        m = random.randint(2, 6); n = random.randint(1, 7); x0 = random.randint(1, 5)
        y = m*x0 + n
        opsi = [y, y+m, y-m, y+2]
        random.shuffle(opsi)
        return pack("PM", f"Diketahui f(x)={m}x+{n}. f({x0})=…",
                    [str(x) for x in opsi], opsi.index(y),
                    f"Substitusi: f({x0})={m}·{x0}+{n}={y}", ["fungsi"])
    total = random.choice([6, 8, 10, 12])
    red = random.randint(1, total-1)
    correct = f"{red}/{total}"
    wrongs = [f"{total}/{red}", f"{red}/{total+2}", f"{red+1}/{total}"]
    opsi = [correct] + wrongs
    random.shuffle(opsi)
    return pack("PM", f"Ada {total} bola, {red} merah. Peluang ambil merah…",
                opsi, opsi.index(correct),
                "Peluang = kejadian diinginkan / total.", ["peluang"])

def gen_litbin(level: float):
    p = random.choice(READING_ID)
    teks, opsi, kunci, pemb = gen_reading("ide_pokok", p)
    return pack("LITBIN", teks, opsi, kunci, pemb, ["literasi", "ide pokok"])

def gen_litbing(level: float):
    passage = {
        "title": "Habits and Progress",
        "text": (
            "Small habits often produce meaningful progress over time. However, results are rarely immediate. "
            "Consistency, feedback, and realistic goals help people maintain new routines and avoid giving up too early."
        )
    }
    teks, opsi, kunci, pemb = gen_reading("simpulan", passage)
    return pack("LITBING", teks, opsi, kunci, pemb, ["english reading", "conclusion"])

def gen_mat(level: float, advanced: bool):
    b = lvl_bucket(level)
    x = sp.Symbol("x")
    if not advanced:
        a = random.randint(2, 9)
        b0 = random.randint(1, 15)
        c = random.randint(10, 50)
        sol = sp.solve(sp.Eq(a*x + b0, c))[0]
        opsi = [sol, sol+1, sol-1, sol+2]
        random.shuffle(opsi)
        return pack("TKA-MAT",
                    f"Selesaikan: {a}x + {b0} = {c}",
                    [str(o) for o in opsi],
                    opsi.index(sol),
                    f"x = ({c}-{b0})/{a} = {sp.nsimplify(sol)}",
                    ["linear"])
    a1 = random.randint(1, 6+b); b1 = random.randint(1, 6+b)
    a2 = random.randint(1, 6+b); b2 = random.randint(1, 6+b)
    x0 = random.randint(1, 8); y0 = random.randint(1, 8)
    c1 = a1*x0 + b1*y0
    c2 = a2*x0 + b2*y0
    opsi = [x0, x0+1, x0-1, x0+2]
    random.shuffle(opsi)
    return pack("TKA-MAT-LANJUT",
                f"Diketahui:\n{a1}x+{b1}y={c1}\n{a2}x+{b2}y={c2}\nNilai x adalah…",
                [str(o) for o in opsi],
                opsi.index(x0),
                "Selesaikan SPLDV dengan eliminasi/substitusi untuk mendapatkan x.",
                ["SPLDV"])

def gen_fisika(level: float):
    mode = random.choice(["v", "F"])
    if mode == "v":
        s = random.randint(20, 200); t = random.randint(2, 20)
        v = s/t
        opsi = [v, v+1, v-1, v+2]
        random.shuffle(opsi)
        return pack("TKA-FISIKA",
                    f"Benda menempuh {s} m dalam {t} s. Kelajuan (m/s)…",
                    [str(o) for o in opsi], opsi.index(v),
                    "v = s/t", ["GLB"])
    m = random.randint(2, 10); a = random.randint(2, 10)
    F = m*a
    opsi = [F, F+m, F-m, F+2*m]
    random.shuffle(opsi)
    return pack("TKA-FISIKA",
                f"Gaya pada m={m} kg, a={a} m/s² adalah… (N)",
                [str(o) for o in opsi], opsi.index(F),
                "F = m·a", ["Hukum Newton II"])

def gen_kimia(level: float):
    m = random.randint(10, 120)
    Mr = random.choice([18, 44, 58, 60, 98])
    n = round(m/Mr, 2)
    opsi = [n, round(n+0.1,2), round(max(n-0.1,0),2), round(n+0.2,2)]
    random.shuffle(opsi)
    return pack("TKA-KIMIA",
                f"Jumlah mol untuk massa {m} g dengan Mr {Mr} adalah…",
                [str(o) for o in opsi], opsi.index(n),
                "n = m/Mr", ["mol"])

def gen_biologi(level: float):
    teks = "Organel tempat respirasi sel adalah…"
    opsi = ["Mitokondria", "Ribosom", "Lisosom", "Kloroplas"]
    return pack("TKA-BIOLOGI", teks, opsi, 0, "Mitokondria menghasilkan ATP.", ["organel"])

def gen_ekonomi(level: float):
    teks = "Inflasi adalah…"
    opsi = ["Kenaikan harga umum terus-menerus", "Penurunan nilai tukar sesaat", "Kenaikan gaji pegawai", "Penurunan produksi pabrik"]
    return pack("TKA-EKONOMI", teks, opsi, 0, "Inflasi: kenaikan tingkat harga umum berkelanjutan.", ["inflasi"])

def gen_geografi(level: float):
    teks = "Urbanisasi adalah…"
    opsi = ["Perpindahan desa ke kota", "Perpindahan kota ke desa", "Kelahiran di kota", "Perluasan hutan"]
    return pack("TKA-GEOGRAFI", teks, opsi, 0, "Urbanisasi: migrasi ke kota.", ["demografi"])

def gen_sejarah(level: float):
    teks = "Kronologi berarti…"
    opsi = ["Urutan waktu peristiwa", "Hubungan sebab-akibat", "Penafsiran penulis", "Perbandingan budaya"]
    return pack("TKA-SEJARAH", teks, opsi, 0, "Kronologi = urutan berdasarkan waktu.", ["kronologi"])

def gen_sosiologi(level: float):
    teks = "Sosialisasi adalah proses…"
    opsi = ["Internalisasi norma & nilai", "Mengubah iklim", "Menaikkan pajak", "Membuat undang-undang"]
    return pack("TKA-SOSIOLOGI", teks, opsi, 0, "Sosialisasi: pembentukan nilai/norma pada individu.", ["sosialisasi"])

REGISTRY: Dict[str, List[Tuple[Callable[[float], dict], int]]] = {
    "TPS_PU": [(gen_tps_pu, 1)],
    "TPS_PPU": [(gen_tps_ppu, 1)],
    "TPS_PBM": [(gen_tps_pbm, 1)],
    "TPS_PK": [(gen_tps_pk, 1)],
    "LITBIN": [(gen_litbin, 1)],
    "LITBING": [(gen_litbing, 1)],
    "PM": [(gen_pm, 1)],
    "MAT_WAJIB": [(lambda lv: gen_mat(lv, advanced=False), 1)],
    "MAT_LANJUT": [(lambda lv: gen_mat(lv, advanced=True), 1)],
    "FISIKA": [(gen_fisika, 1)],
    "KIMIA": [(gen_kimia, 1)],
    "BIOLOGI": [(gen_biologi, 1)],
    "EKONOMI": [(gen_ekonomi, 1)],
    "GEOGRAFI": [(gen_geografi, 1)],
    "SEJARAH": [(gen_sejarah, 1)],
    "SOSIOLOGI": [(gen_sosiologi, 1)],
}

def generate_one(subject: str, level: float) -> dict:
    if subject not in REGISTRY:
        raise HTTPException(status_code=400, detail=f"Unknown subject: {subject}")
    fn = wchoice(REGISTRY[subject])
    return fn(level)

def enforce_quota(user: User):
    if user.role == "admin" or user.is_paid:
        return
    if user.attempts_used >= FREE_ATTEMPT_LIMIT:
        raise HTTPException(status_code=402, detail=f"Limit free habis ({FREE_ATTEMPT_LIMIT}x).")

def consume_attempt(db: Session, user: User):
    if user.role == "admin" or user.is_paid:
        return
    user.attempts_used += 1
    db.commit()

@app.post("/api/generate_set")
def generate_set(req: GenSetReq, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    enforce_quota(user)
    level = clamp_level(req.level)
    if req.seed is not None:
        random.seed(int(req.seed))
    exam = req.exam.upper()
    track = req.track.upper()
    subjects = allowed_subjects(exam, track)
    if req.subject == "MIX":
        picked = [random.choice(subjects) for _ in range(req.n)]
    else:
        if req.subject not in subjects:
            raise HTTPException(status_code=400, detail="Subject not allowed for this exam/track")
        picked = [req.subject] * req.n
    out = []
    for sub in picked:
        q = generate_one(sub, level)
        token = make_token({
            "kunci": q["kunci"],
            "pembahasan": q["pembahasan"],
            "konsep": q["konsep"],
            "kategori": q["kategori"],
            "subject": sub,
            "exp": int(time.time()) + 60 * 30
        })
        out.append({
            "subject": sub,
            "kategori": q["kategori"],
            "teks": q["teks"],
            "opsi": q["opsi"],
            "token": token
        })
    consume_attempt(db, user)
    return {"exam": exam, "track": track, "n": req.n, "questions": out}

@app.post("/api/check_set")
def check_set(req: CheckSetReq, user: User = Depends(get_current_user)):
    results = []
    score = 0
    for item in req.answers:
        data = read_token(item.token)
        if time.time() > data.get("exp", 0):
            raise HTTPException(status_code=400, detail="Token expired")
        kunci = int(data["kunci"])
        correct = int(item.answer) == kunci
        score += 1 if correct else 0
        results.append({
            "correct": correct,
            "correct_index": kunci,
            "pembahasan": data.get("pembahasan", ""),
            "konsep": data.get("konsep", []),
            "kategori": data.get("kategori", ""),
            "subject": data.get("subject", "")
        })
    return {"score": score, "total": len(results), "results": results}

@app.post("/api/explain")
def explain(req: ExplainReq, user: User = Depends(get_current_user)):
    data = read_token(req.token)
    if time.time() > data.get("exp", 0):
        raise HTTPException(status_code=400, detail="Token expired")
    q = (req.question or "").strip().lower()
    pemb = data.get("pembahasan", "")
    konsep = data.get("konsep", [])
    kategori = data.get("kategori", "")
    subject = data.get("subject", "")
    if any(k in q for k in ["konsep", "materi", "topik"]):
        return {"answer": f"Kategori: {kategori} ({subject})\nKonsep: {', '.join(konsep) if konsep else '-'}"}
    if any(k in q for k in ["rumus", "formula"]):
        return {"answer": f"Rumus mengikuti konsep.\n\nPembahasan:\n{pemb}"}
    if any(k in q for k in ["langkah", "cara", "step"]):
        lines = [ln.strip() for ln in pemb.split("\n") if ln.strip()]
        bullets = "\n".join([f"- {ln}" for ln in lines[:10]]) if lines else pemb
        return {"answer": f"Langkah ringkas:\n{bullets}"}
    if any(k in q for k in ["kunci", "jawaban benar"]):
        kunci = int(data.get("kunci", 0))
        return {"answer": f"Jawaban benar: opsi {['A','B','C','D'][kunci]}."}
    return {"answer": f"Tanyakan: konsep/rumus/langkah.\n\nPembahasan:\n{pemb}"}
