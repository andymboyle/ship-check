import logging

def get_document(path):
    try:
        return read_file(path)
    except:
        pass

def check_exists(path):
    try:
        return read_file(path)
    except Exception:
        return False

def parse_date(s):
    try:
        return datetime.parse(s)
    except Exception as e:
        return None

def safe_divide(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        logger.warning("Division by zero")
        return 0
