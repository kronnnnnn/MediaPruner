#!/usr/bin/env python3
import json
import sys
from detect_secrets.core import baseline as baseline_mod
from detect_secrets.core import scan as scan_mod

BASELINE_FILE = '.secrets.baseline'
REPORT_FILE = 'detect-secrets-report.json'


def load_baseline_results(path):
    try:
        b = baseline_mod.load_from_file(path)
        return b.get('results', {})
    except Exception:
        return {}


def get_hashed_set(secrets_list):
    s = set()
    for sec in secrets_list:
        h = sec.get('hashed_secret') or sec.get('type') or json.dumps(sec, sort_keys=True)
        s.add(h)
    return s


def main():
    baseline_results = load_baseline_results(BASELINE_FILE)

    sc = baseline_mod.create('.', should_scan_all_files=True)
    current = baseline_mod.format_for_output(sc).get('results', {})

    new_findings = {}

    for filename, secrets in current.items():
        base_set = get_hashed_set(baseline_results.get(filename, []))
        curr_set = get_hashed_set(secrets)
        added = curr_set - base_set
        if added:
            # include more context on the added items
            added_items = [s for s in secrets if (s.get('hashed_secret') or s.get('type') or json.dumps(s, sort_keys=True)) in added]
            new_findings[filename] = added_items

    report = {
        'baseline_file': BASELINE_FILE,
        'new_secrets_count': sum(len(v) for v in new_findings.values()),
        'new_findings': new_findings,
    }

    with open(REPORT_FILE, 'w') as f:
        json.dump(report, f, indent=2)

    if report['new_secrets_count'] > 0:
        print(f"ERROR: Found {report['new_secrets_count']} new potential secret(s). See {REPORT_FILE} for details.")
        return 1

    print('No new secrets found.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:
        # Ensure a report file is written on unexpected failures so CI can upload diagnostics
        with open(REPORT_FILE, 'w') as f:
            json.dump({'error': str(e)}, f, indent=2)
        print(f"ERROR: detect-secrets check failed: {e}")
        sys.exit(2)
