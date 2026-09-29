"""Wypisuje wiersze z długimi myślnikami i znakiem minus w plikach projektu."""
import pathlib
import sys

BAD = {chr(code) for code in range(0x2012, 0x2016)} | {chr(0x2212)}
SUFFIXES = {'.js', '.html', '.css', '.sh', '.py', '.md'}
SKIP = {'.git', '.shots'}

found = 0
for path in sorted(pathlib.Path('.').rglob('*')):
    if path.suffix not in SUFFIXES or SKIP & set(path.parts) or not path.is_file():
        continue
    for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        if BAD & set(line):
            found += 1
            print(f'{path}:{number}: {line.strip()[:100]}')
sys.exit(1 if found else 0)
