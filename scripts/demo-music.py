# Original background music, synthesized here (no third-party audio): soft pad + gentle arpeggio, C–Am–F–G
import numpy as np, soundfile as sf
SR = 44100; T = 173.3; n = int(T * SR); t = np.arange(n) / SR
out = np.zeros(n)
def note(f): return 440 * 2 ** ((f - 69) / 12)
chords = [[48, 55, 64, 67], [45, 52, 60, 64], [41, 48, 57, 60], [43, 50, 59, 62]]
bar = 4.0
for b in range(int(T / bar) + 1):
    ch = chords[b % 4]; s0 = int(b * bar * SR); L = int((bar + 1.0) * SR); seg = np.arange(L) / SR
    env = np.minimum(1, seg / 1.2) * np.minimum(1, np.maximum(0, (bar + 1.0 - seg) / 1.2))
    pad = sum(np.sin(2 * np.pi * note(m) * seg) * 0.6 + np.sin(2 * np.pi * note(m) * 2.003 * seg) * 0.15 for m in ch) * env
    e = min(n, s0 + L); out[s0:e] += pad[: e - s0] * 0.05
    for i in range(8):  # arpeggio, eighth notes
        m = ch[[0, 1, 2, 3, 2, 1, 2, 3][i]] + 12; ps = s0 + int(i * bar / 8 * SR); pl = int(0.9 * SR); ss = np.arange(pl) / SR
        pk = (np.sin(2 * np.pi * note(m) * ss) + 0.3 * np.sin(2 * np.pi * note(m) * 2 * ss)) * np.exp(-ss * 4.5)
        e2 = min(n, ps + pl)
        if ps < n: out[ps:e2] += pk[: e2 - ps] * 0.035
    # soft bass
    bl = int(bar * SR); bs = np.arange(bl) / SR; e3 = min(n, s0 + bl)
    out[s0:e3] += (np.sin(2 * np.pi * note(ch[0] - 12) * bs) * np.exp(-bs * 0.8))[: e3 - s0] * 0.08
fade = np.ones(n); fi = int(2 * SR); fo = int(4 * SR); fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo)
out *= fade; out /= np.abs(out).max(); out *= 0.5
sf.write('scripts/demo-assets/music.wav', np.stack([out, out], 1).astype(np.float32), SR)
print('ok')
