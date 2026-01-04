from api.db import SessionLocal, Base, engine
from sqlalchemy import Column, Integer, String, Text

Base.metadata.create_all(bind=engine)

class Material(Base):
    __tablename__ = "materials"
    id = Column(Integer, primary_key=True)
    subject = Column(String(30), index=True, nullable=False)
    chapter = Column(String(100), nullable=False)
    summary = Column(Text, default="")
    formulas = Column(Text, default="")
    examples = Column(Text, default="")

db = SessionLocal()

DATA = [
    ("KIMIA", "Stoikiometri",
     "Membahas konsep mol, Mr/Ar, dan perbandingan koefisien reaksi.",
     "n = m/Mr; n = V/22,4 (STP); M = n/V; perbandingan mol = koefisien reaksi",
     "Contoh: hitung mol 10 g H2O (Mr 18) → n=10/18=0,56 mol."
    ),
    ("KIMIA", "Larutan & pH",
     "Molaritas menyatakan jumlah mol zat terlarut per liter larutan, pH menyatakan tingkat keasaman.",
     "M = n/V; pH = -log[H+]; pOH = -log[OH-]; pH+pOH=14",
     "Contoh: [H+] = 10^-3 → pH = 3."
    ),
    ("FISIKA", "Gerak Lurus",
     "Gerak lurus terbagi GLB (v konstan) dan GLBB (a konstan).",
     "GLB: v=s/t; GLBB: v=v0+at; s=v0t+1/2at^2; v^2=v0^2+2as",
     "Contoh: v0=0, a=2, t=5 → v=10 m/s, s=25 m."
    ),
    ("FISIKA", "Hukum Newton",
     "Hubungan gaya, massa, dan percepatan; aksi-reaksi.",
     "ΣF = m·a; w = m·g; gesek f = μN",
     "Contoh: m=2 kg, a=3 m/s² → ΣF=6 N."
    ),
    ("MATEMATIKA", "Turunan",
     "Turunan menyatakan laju perubahan dan gradien garis singgung.",
     "(x^n)'=n x^(n-1); (sin x)'=cos x; (cos x)'=-sin x",
     "Contoh: f(x)=x^3 → f'(x)=3x^2."
    ),
    ("MATEMATIKA", "Integral",
     "Integral kebalikan turunan, untuk luas/akumulasi.",
     "∫x^n dx = x^(n+1)/(n+1) + C (n≠-1); ∫1/x dx = ln|x| + C",
     "Contoh: ∫2x dx = x^2 + C."
    ),
    ("BIOLOGI", "Genetika Dasar",
     "Gen berada pada kromosom, pewarisan sifat mengikuti hukum Mendel.",
     "Istilah: genotipe/fenotipe, dominan/resesif, persilangan monohibrid",
     "Contoh: Aa x Aa → rasio genotipe 1:2:1."
    ),
]

# bersihkan agar tidak dobel
db.query(Material).delete()
db.commit()

for s, ch, summ, form, ex in DATA:
    db.add(Material(subject=s, chapter=ch, summary=summ, formulas=form, examples=ex))

db.commit()
db.close()
print("Seed materi kelas 12 berhasil.")
