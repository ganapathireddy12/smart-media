# -*- mode: python ; coding: utf-8 -*-
# ============================================================
# SmartMedia AI Engine – PyInstaller Spec
# Produces:  build/python-engine/main/  (--onedir)
# To build:  python -m PyInstaller python/smartmedia.spec
# ============================================================

import os
import sys
from PyInstaller.utils.hooks import collect_all, collect_submodules

# ── Collect heavy ML packages ────────────────────────────────
datas_torch,   binaries_torch,   hiddenimports_torch   = collect_all('torch')
datas_tv,      binaries_tv,      hiddenimports_tv       = collect_all('torchvision')
datas_tf,      binaries_tf,      hiddenimports_tf       = collect_all('transformers')
datas_acc,     binaries_acc,     hiddenimports_acc      = collect_all('accelerate')
datas_pil,     binaries_pil,     hiddenimports_pil      = collect_all('PIL')

# Combine all collected resources
all_datas = (
    datas_torch + datas_tv + datas_tf + datas_acc + datas_pil
)
all_binaries = (
    binaries_torch + binaries_tv + binaries_tf + binaries_acc + binaries_pil
)
all_hidden = (
    hiddenimports_torch + hiddenimports_tv + hiddenimports_tf +
    hiddenimports_acc + hiddenimports_pil +
    collect_submodules('qwen_vl_utils') +
    collect_submodules('face_recognition') +
    collect_submodules('cv2') +
    collect_submodules('numpy') +
    collect_submodules('PIL') +
    collect_submodules('sklearn') +
    collect_submodules('scipy') +
    collect_submodules('geopy') +
    collect_submodules('requests') +
    collect_submodules('sentence_transformers') +
    [
        'torch',
        'torchvision',
        'transformers',
        'PIL',
        'PIL.Image',
        'numpy',
        'cv2',
        'accelerate',
        'duckduckgo_search',
        'autocorrect',
        'spellchecker',
        'ImageHash',
        'geopy',
        'geopy.geocoders',
        'sentence_transformers',
        'sklearn',
        'scipy',
        'scipy.special',
        'scipy.spatial',
        'logging',
        'json',
        'pathlib',
        'hashlib',
    ]
)

block_cipher = None

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=all_binaries,
    datas=all_datas + [
        # Bundle requirements file so the app can show it
        ('requirements.txt', '.'),
    ],
    hiddenimports=all_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib',
        'notebook',
        'ipython',
        'ipykernel',
        'pytest',
        'unittest',
        'tkinter',
        '_tkinter',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='main',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,   # Keep console for Electron to read stdout/stderr
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='main',
)
