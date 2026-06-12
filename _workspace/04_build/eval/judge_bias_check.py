"""Judge 편향 점검: 동일 응답을 faithfulness judge로 3회 채점 → variance < 0.5 요구.
샘플 3건만(비용 절제). runner.py의 judge·call_api 재사용.
"""
import json
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import runner  # noqa: E402

ENDPOINT = "http://localhost:8000/v1/jha/evaluate"
SAMPLE_IDS = sys.argv[1:] if len(sys.argv) > 1 else None


def main():
    cfg = runner.EvalConfig(
        dataset_path="dataset/gold_v1.jsonl",
        api_endpoint=ENDPOINT,
        variant_name="judge_bias_check",
        judge_model=os.environ.get("JUDGE_MODEL", "gpt-4.1"),
    )
    cases = runner.load_gold(cfg.dataset_path)
    # 샘플 3건: 명확/모호/refuse 한 건씩 우선, 없으면 앞 3건
    chosen = []
    if SAMPLE_IDS:
        chosen = [c for c in cases if c.get("id") in SAMPLE_IDS][:3]
    else:
        by_diff = {}
        for c in cases:
            by_diff.setdefault(c.get("difficulty"), c)
        chosen = list(by_diff.values())[:3]
        if len(chosen) < 3:
            chosen = cases[:3]

    print(f"[bias] 샘플 {len(chosen)}건: {[c['id'] for c in chosen]}")
    rows = []
    for c in chosen:
        resp = runner.call_api(cfg.api_endpoint, c, {})
        if resp is None:
            print(f"[bias] {c['id']} API skip")
            continue
        scores = []
        for _ in range(3):
            j = runner.judge_faithfulness(c, resp, cfg)
            s = j.get("score")
            if s is not None:
                scores.append(float(s))
        if len(scores) >= 2:
            var = statistics.pvariance(scores)
        else:
            var = None
        rows.append({"id": c["id"], "scores": scores, "variance": var})
        print(f"[bias] {c['id']}: scores={scores} variance={var}")

    out = {"sample_ids": [r["id"] for r in rows], "rows": rows,
           "max_variance": max((r["variance"] for r in rows if r["variance"] is not None), default=None),
           "threshold": 0.5}
    out["pass"] = (out["max_variance"] is not None and out["max_variance"] < 0.5)
    with open("reports/judge_bias_check.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"[bias] max_variance={out['max_variance']} pass={out['pass']}")


if __name__ == "__main__":
    main()
