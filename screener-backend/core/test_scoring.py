"""
test_scoring.py

Runs with pytest, or directly:  python test_scoring.py

The centrepiece is the DIRECTION TEST demanded by Phase 1: names you already
know are beaten-down-but-solid must score high and pass; extended-and-strong
names must score low and fail. A sign error in the KST flip or the MA rule
would pass every other check but flip these, so this is the test that catches
an inverted technical block.
"""

from scoring import (
    technical_score,
    fundamental_score_nonbank,
    fundamental_score_bank,
    evaluate_nonbank,
    evaluate_bank,
    ev_ebit,
    in_market_cap_band,
    below_200sma,
    meets_crar,
)

# ---------------------------------------------------------------------------
# Technical direction test: 3 beaten-down, 3 extended
# ---------------------------------------------------------------------------
BEATEN = [
    dict(rsi=22, kst=-40, kst_signal=-55, price=80, sma50=95, sma200=120, volume=200, vol_sma20=100),
    dict(rsi=28, kst=-10, kst_signal=-12, price=50, sma50=60, sma200=90,  volume=150, vol_sma20=120),
    dict(rsi=15, kst=-80, kst_signal=-90, price=30, sma50=45, sma200=70,  volume=300, vol_sma20=110),
]
EXTENDED = [
    dict(rsi=75, kst=40, kst_signal=30, price=140, sma50=120, sma200=100, volume=200, vol_sma20=100),
    dict(rsi=82, kst=10, kst_signal=5,  price=200, sma50=180, sma200=150, volume=150, vol_sma20=120),
    dict(rsi=68, kst=60, kst_signal=55, price=90,  sma50=80,  sma200=70,  volume=90,  vol_sma20=110),
]


def test_technical_direction_beaten_down_pass():
    for x in BEATEN:
        t, b = technical_score(**x)
        assert t >= 3, (t, b, x)


def test_technical_direction_extended_fail():
    for x in EXTENDED:
        t, b = technical_score(**x)
        assert t < 3, (t, b, x)


def test_technical_all_missing_scores_zero():
    t, b = technical_score()
    assert t == 0
    assert set(b) == {"rsi", "kst", "ma", "volume"}


def test_technical_boundaries():
    # RSI exactly 30 -> +1 tier, 50 -> -1 tier, 80 -> -1 tier
    assert technical_score(rsi=30)[1]["rsi"] == 1
    assert technical_score(rsi=50)[1]["rsi"] == -1
    assert technical_score(rsi=80)[1]["rsi"] == -1
    assert technical_score(rsi=80.01)[1]["rsi"] == -2
    # KST exactly on the signal, below zero -> +2 (>= signal branch)
    assert technical_score(kst=-5, kst_signal=-5)[1]["kst"] == 2
    # KST exactly on the signal, above zero -> -2
    assert technical_score(kst=5, kst_signal=5)[1]["kst"] == -2


def test_ma_four_way_all_branches():
    assert technical_score(price=8, sma50=10, sma200=12)[1]["ma"] == 2     # below both
    assert technical_score(price=11, sma50=10, sma200=12)[1]["ma"] == 1    # below 200, above 50
    assert technical_score(price=11, sma50=12, sma200=10)[1]["ma"] == -1   # above 200, below 50
    assert technical_score(price=13, sma50=12, sma200=10)[1]["ma"] == -2   # above both


# ---------------------------------------------------------------------------
# Non-bank fundamental direction test
# ---------------------------------------------------------------------------
SOLID_CUR = dict(net_income=120, total_assets=1000, borrowings=100, revenue=900,
                 gross_margin=42, current_ratio=2.1, shares_outstanding=100, ocf=150)
SOLID_PRIOR = dict(net_income=90, total_assets=1000, borrowings=150, revenue=800,
                   gross_margin=38, current_ratio=1.8, shares_outstanding=100, ocf=110)

WEAK_CUR = dict(net_income=-20, total_assets=1000, borrowings=400, revenue=700,
                gross_margin=30, current_ratio=1.1, shares_outstanding=130, ocf=-10)
WEAK_PRIOR = dict(net_income=50, total_assets=1000, borrowings=300, revenue=800,
                  gross_margin=35, current_ratio=1.6, shares_outstanding=100, ocf=60)


def test_fundamental_nonbank_solid_full_marks():
    f, b = fundamental_score_nonbank(SOLID_CUR, SOLID_PRIOR,
                                     ev_ebit_current=10, ev_ebit_median_5y=15)
    assert f == 10, b


def test_fundamental_nonbank_weak_fails_gate():
    f, b = fundamental_score_nonbank(WEAK_CUR, WEAK_PRIOR,
                                     ev_ebit_current=25, ev_ebit_median_5y=15)
    assert f < 7, b


def test_fundamental_nonbank_missing_scores_zero():
    f, b = fundamental_score_nonbank({}, {}, None, None)
    assert f == 0
    assert len(b) == 10


def test_ev_ebit_value_and_loss_guard():
    # EV = 1000 + (200 - 50) = 1150 ; /100 = 11.5
    assert abs(ev_ebit(1000, 200, 50, 100) - 11.5) < 1e-9
    # negative EBIT -> None, so no value point for loss-makers
    assert ev_ebit(1000, 200, 50, -10) is None
    assert ev_ebit(1000, 200, 50, 0) is None


# ---------------------------------------------------------------------------
# Bank fundamental direction test (phase 2)
# ---------------------------------------------------------------------------
BANK_SOLID_CUR = dict(gross_npa=3.0, provision_coverage=75, roa=1.2, nim=3.5,
                      cost_to_income=42, casa_ratio=45)
BANK_SOLID_YOY = dict(gross_npa=4.5, provision_coverage=68, roa=0.9, nim=3.2,
                      cost_to_income=48, casa_ratio=41)

BANK_WEAK_CUR = dict(gross_npa=6.0, provision_coverage=55, roa=-0.3, nim=2.6,
                     cost_to_income=58, casa_ratio=36)
BANK_WEAK_YOY = dict(gross_npa=4.0, provision_coverage=62, roa=0.8, nim=3.0,
                     cost_to_income=50, casa_ratio=40)


def test_fundamental_bank_solid_full_marks():
    f, b = fundamental_score_bank(BANK_SOLID_CUR, BANK_SOLID_YOY,
                                  pb_current=1.1, pb_median_5y=1.6)
    assert f == 8, b


def test_fundamental_bank_weak_fails_gate():
    f, b = fundamental_score_bank(BANK_WEAK_CUR, BANK_WEAK_YOY,
                                  pb_current=2.2, pb_median_5y=1.6)
    assert f < 6, b


# ---------------------------------------------------------------------------
# End-to-end evaluate + gates
# ---------------------------------------------------------------------------
def test_evaluate_nonbank_passes_both_gates():
    r = evaluate_nonbank(SOLID_CUR, SOLID_PRIOR, technical=BEATEN[0],
                         ev_ebit_current=10, ev_ebit_median_5y=15)
    assert r["engine"] == "nonbank"
    assert r["f_score"] == 10 and r["t_score"] == 7
    assert r["passed"] is True


def test_evaluate_nonbank_good_fundamentals_but_extended_fails():
    r = evaluate_nonbank(SOLID_CUR, SOLID_PRIOR, technical=EXTENDED[0],
                         ev_ebit_current=10, ev_ebit_median_5y=15)
    assert r["f_pass"] is True
    assert r["t_pass"] is False
    assert r["passed"] is False


def test_evaluate_bank_passes_both_gates():
    r = evaluate_bank(BANK_SOLID_CUR, BANK_SOLID_YOY, technical=BEATEN[1],
                      pb_current=1.1, pb_median_5y=1.6)
    assert r["engine"] == "bank"
    assert r["f_score"] == 8
    assert r["passed"] is True


# ---------------------------------------------------------------------------
# Filter predicates
# ---------------------------------------------------------------------------
def test_market_cap_band():
    assert in_market_cap_band(20000) is True
    assert in_market_cap_band(4999) is False
    assert in_market_cap_band(100001) is False
    assert in_market_cap_band(None) is False


def test_below_200sma():
    assert below_200sma(80, 120) is True
    assert below_200sma(130, 120) is False


def test_meets_crar_defaults():
    assert meets_crar(16.0, 13.0) is True
    assert meets_crar(11.0, 13.0) is False        # total below 11.5 floor
    assert meets_crar(16.0, 9.0) is False         # tier-1 below 9.5 floor


if __name__ == "__main__":
    import sys

    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL  {fn.__name__}: {e}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
