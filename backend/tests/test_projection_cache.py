from backend import persistence


def test_projection_cache_roundtrip_and_miss():
    db = persistence.get_session()
    try:
        assert persistence.get_cached_projection(db, "no-such-key") is None
        persistence.put_cached_projection(db, "k1", '{"p_success": 0.97, "seed": 42}')
        db.commit()
        got = persistence.get_cached_projection(db, "k1")
        assert got == {"p_success": 0.97, "seed": 42}
        persistence.put_cached_projection(db, "k1", '{"p_success": 0.5, "seed": 7}')
        db.commit()
        assert persistence.get_cached_projection(db, "k1")["seed"] == 7
    finally:
        db.close()
