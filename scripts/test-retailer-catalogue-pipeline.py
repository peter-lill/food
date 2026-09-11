"""Exercise an empty rebuilt catalogue against the real shell pipeline."""
import json
import os
from pathlib import Path
import subprocess
import tempfile


pipeline = Path(__file__).with_name("run-retailer-catalogue-pipeline.sh").resolve()
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    bin_dir = root / "bin"
    bin_dir.mkdir()
    mocks = {
        "curl": """#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
root = Path(os.environ['FOOD_ROOT'])
if '/collection/start' in sys.argv[-1]:
    with (root / 'starts').open('a') as output:
        output.write(sys.argv[-1] + '\\n')
    print('{"status":"accepted"}')
    sys.exit(0)
counter = root / 'requests'
n = int(counter.read_text()) + 1 if counter.exists() else 1
counter.write_text(str(n))
# First check sees a running discovery; first poll has no products yet.
products = 0 if n < 3 else 2
complete = n >= 4
if products:
    (root / 'ready').touch()
print(json.dumps({'collection': {'total': 1, 'running': int(n > 1 and not complete),
    'pending': int(not complete), 'completed': int(complete), 'failed': 0,
    'products': products, 'discovery': {'pending': 0, 'failed': 0}}}))
""",
        "npm": """#!/usr/bin/env bash
test -f "$FOOD_ROOT/ready" || exit 55
printf '%s\\n' "$*" >> "$FOOD_ROOT/imports"
""",
        "sleep": "#!/usr/bin/env bash\nexit 0\n",
    }
    for name, contents in mocks.items():
        target = bin_dir / name
        target.write_text(contents)
        target.chmod(0o755)
    env = dict(os.environ, FOOD_ROOT=str(root),
               FOOD_CATALOGUE_PIPELINE_STATE_DIR=str(root / "state"),
               FOOD_CATALOGUE_POLL_SECONDS="1", FOOD_CATALOGUE_MAX_WAIT_MINUTES="1",
               PATH=f"{bin_dir}:{os.environ['PATH']}")
    result = subprocess.run(["bash", str(pipeline), "coles"], env=env,
                            text=True, capture_output=True, timeout=15)
    assert result.returncode == 0, result.stdout + result.stderr
    imports = (root / "imports").read_text().splitlines()
    assert len(imports) == 2, imports
    assert all("products:coles-import" in line for line in imports), imports
    assert (root / "state/coles-initial-import-complete").exists()
    assert "cached_products=0" in result.stdout
    assert "initial-population" in result.stdout
    assert "final-reconciliation" in result.stdout
    # The saved initial import must not cause an interrupted sweep to restart
    # all completed categories when its runner is relaunched.
    for name in ('requests', 'imports', 'ready'):
        (root / name).unlink()
    result = subprocess.run(["bash", str(pipeline), "coles"], env=env,
                            text=True, capture_output=True, timeout=15)
    assert result.returncode == 0, result.stdout + result.stderr
    assert len((root / 'imports').read_text().splitlines()) == 1
    assert 'revisitAllCompleted' not in (root / 'starts').read_text()
print("Empty-cache catalogue pipeline regression passed.")
