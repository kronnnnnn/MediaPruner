import logging


def test_check_and_migrate_moves_when_enabled(tmp_path, caplog, monkeypatch):
    # Prepare fake project root with legacy data
    project_root = tmp_path
    legacy_dir = project_root / 'data'
    legacy_dir.mkdir()
    legacy_db = legacy_dir / 'mediapruner.db'
    legacy_db.write_bytes(b"legacy db content")

    # Prepare new backend data dir
    backend_data = project_root / 'backend' / 'data'
    backend_data.mkdir(parents=True)
    new_db = backend_data / 'mediapruner.db'

    # Monkeypatch Path(__file__).resolve().parents[1] used in module to point to project_root
    # We'll import function directly by path manipulation: temporarily insert project package path
    # Create a tiny module that imports the real function
    # Instead, we'll import the module and call the function directly with our paths

    from app import database

    # Call the helper directly
    caplog.clear()
    caplog.set_level(logging.INFO)
    moved = database.check_and_migrate_legacy_db(legacy_db, new_db, auto_move=True)
    assert moved is True
    assert new_db.exists()
    assert (legacy_db.with_suffix('.bak')).exists()
    assert b"legacy db content" == new_db.read_bytes()
    # logs should mention backup and moved
    assert any('Created backup of legacy DB' in r.message for r in caplog.records)
    assert any('Moved legacy DB' in r.message for r in caplog.records)


def test_check_and_migrate_no_move_when_disabled(tmp_path, caplog):
    project_root = tmp_path
    legacy_dir = project_root / 'data'
    legacy_dir.mkdir()
    legacy_db = legacy_dir / 'mediapruner.db'
    legacy_db.write_bytes(b"legacy db content")

    backend_data = project_root / 'backend' / 'data'
    backend_data.mkdir(parents=True)
    new_db = backend_data / 'mediapruner.db'

    from app import database

    caplog.clear()
    caplog.set_level(logging.INFO)
    moved = database.check_and_migrate_legacy_db(legacy_db, new_db, auto_move=False)
    assert moved is False
    assert legacy_db.exists()
    assert not new_db.exists()
    assert any('Found legacy DB' in r.message for r in caplog.records)
