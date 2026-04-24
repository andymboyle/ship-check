# TRUE POSITIVES — these should be flagged

# Bare except: pass — always wrong
def get_document(path):
    try:
        return read_file(path)
    except:
        pass

# Broad exception returning False — masks real failures
def document_exists(path):
    try:
        return check_gcs(path)
    except Exception:
        return False
