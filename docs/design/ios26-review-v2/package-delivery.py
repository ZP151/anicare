from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from shutil import copy2
import json

root = Path(__file__).resolve().parent
bundle = root / 'WhiskerCommons-iOS26-Design-v2.zip'
with ZipFile(bundle, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for item in sorted(root.rglob('*')):
        if not item.is_file() or item.suffix == '.zip' or item.name.startswith(('pdf-check-', 'probe-', 'material-layer-probe')):
            continue
        archive.write(item, item.relative_to(root).as_posix())
with ZipFile(bundle) as archive:
    assert archive.testzip() is None
    names = archive.namelist()
    assert len([n for n in names if n.startswith('screens/') and n.endswith('.png')]) == 87
    assert all(n in names for n in ['index.html','all-screens.pdf','review-spec.md','assets/LUCIDE-LICENSE.txt','assets/NOTO-OFL.txt'])
delivery = Path('C:/Users/15492/Downloads/WhiskerCommons-Design-v2')
delivery.mkdir(exist_ok=True)
for name in [bundle.name,'all-screens.pdf','overview-A.png','overview-G.png','material-comparison.png','review-spec.md','test-samples-release.md']:
    copy2(root / name, delivery / name)
print(json.dumps({'bundle':str(delivery/bundle.name),'zip_bytes':bundle.stat().st_size,'entries':len(names),'pngs':87}))
