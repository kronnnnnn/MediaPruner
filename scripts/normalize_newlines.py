from pathlib import Path
p=Path(r'C:\apps\MediaPruner\.github\workflows\copilot-review.yml')
text=p.read_text()
text=text.replace('\r\n','\n')
p.write_text(text, newline='\n')
print('Normalized')
