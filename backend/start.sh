 #!/bin/bash
  export PYTHONPATH=/Users/gauraklein/code/loop-finder/src:$PYTHONPATH
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
